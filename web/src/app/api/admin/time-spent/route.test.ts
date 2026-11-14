import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { fakeDb } from "@/lib/fake-db.testutil";

const { state, mockRequireResearcher, mockSession } = vi.hoisted(() => ({
  state: { db: null as unknown },
  mockRequireResearcher: vi.fn(),
  mockSession: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (state.db as Record<string | symbol, unknown>)[prop] },
  ),
}));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
// The hours route is for research leads (RESEARCH_LEADS): it asks requireLead,
// which answers here exactly as requireResearcher did. Who is a lead is
// tested in src/lib/admin/leads.test.ts.
vi.mock("@/lib/admin/lead-route", () => ({ requireLead: mockRequireResearcher }));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// The annotator summary's queue numbers are not under test here.
vi.mock("@/lib/queue-input", () => ({
  loadQueueInputs: async () => ({ queuePrompts: [] }),
  loadCorrectionInputs: async () => ({ correctionInputs: [] }),
}));
vi.mock("@/lib/pairing", () => ({
  computeQueueState: () => ({ remaining: [], corrections: [] }),
}));

import { GET } from "./route";
import { GET as summaryGET } from "../../annotator/summary/route";

const d = (iso: string) => new Date(iso);
// Friday 13 Nov 2026, 12:00 UTC. The week started Mon 9 Nov, Lagos time.
const NOW = d("2026-11-13T12:00:00Z");

function seed(over: Record<string, Record<string, unknown>[]> = {}) {
  const work = (annotatorId: string, iso: string) => ({
    annotatorId,
    isDemo: false,
    createdAt: d(iso),
  });
  return fakeDb({
    user: [
      { id: "agnes", name: "Agnes Test", email: "agnes@example.org", role: "RESEARCHER" },
      { id: "austine", name: "Austine Test", email: "austine@example.org", role: "ANNOTATOR" },
    ],
    pairwiseComparison: [
      work("agnes", "2026-11-12T09:10:00Z"),
      work("austine", "2026-11-12T08:00:00Z"),
      { ...work("austine", "2026-11-12T08:05:00Z"), isDemo: true },
      work("agnes", "2026-11-04T09:00:00Z"), // last week
    ],
    coldAuthorAnswer: [work("agnes", "2026-11-12T09:00:00Z")],
    outputEdit: [work("agnes", "2026-11-12T09:20:00Z")],
    rubricAxisScore: [],
    promptFlag: [],
    speechRecording: [
      { ...work("agnes", "2026-11-12T09:40:00Z"), durationMs: 12_000 },
      { ...work("agnes", "2026-11-12T10:00:00Z"), durationMs: 18_000 },
      { annotatorId: null, isDemo: false, createdAt: d("2026-11-12T10:00:00Z"), durationMs: 9_000 },
    ],
    speechComparison: [],
    speechCheck: [{ reviewerId: "agnes", isDemo: false, createdAt: d("2026-11-12T10:20:00Z") }],
    activityPing: [
      { userId: "agnes", minute: d("2026-11-12T09:00:00Z"), activeSeconds: 60, isDemo: false },
      { userId: "agnes", minute: d("2026-11-12T09:01:00Z"), activeSeconds: 45, isDemo: false },
      { userId: "agnes", minute: d("2026-11-12T09:02:00Z"), activeSeconds: 60, isDemo: true },
    ],
    timeNote: [],
    ...over,
  });
}

const get = (qs = "") => GET(new Request(`http://test/api/admin/time-spent${qs}`));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.db = seed();
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "halim", role: "RESEARCHER" });
  mockSession.mockResolvedValue({ user: { id: "agnes", role: "RESEARCHER" } });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/admin/time-spent", () => {
  it("is for researchers only", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await get()).status).toBe(403);
  });

  it("gives this week by default, one row per person who did anything, three figures side by side", async () => {
    const json = await (await get()).json();
    expect(json.week).toEqual({ start: "2026-11-09", end: "2026-11-15", isCurrent: true });
    expect(json.rows.map((r: { userId: string }) => r.userId)).toEqual(["agnes", "austine"]);
    const agnes = json.rows[0];
    expect(agnes).toMatchObject({
      basis: "measured",
      activeSeconds: 105, // demo minute left out
      oldMinutes: 25, // 09:00 to 09:20, + 5
      recountedMinutes: 85, // 09:00 to 10:20, + 5
      submissions: 2,
      edits: 1,
      recordings: 2,
      recordingSeconds: 30,
      checkVerdicts: 1,
    });
    expect(json.measuredSince).toBe("2026-11-12T09:00:00.000Z");
    expect(json.demoMinutesLeftOut).toBe(1);
  });

  it("a person with no beat that week reads as not measured, with the estimates only", async () => {
    const austine = (await (await get()).json()).rows[1];
    expect(austine.activeSeconds).toBeNull();
    expect(austine.basis).toBe("estimate");
    expect(austine.oldMinutes).toBe(5);
    expect(austine.comparisons).toBe(1); // the demo comparison is left out
  });

  it("a past week: the old estimate is there, the measured column is empty", async () => {
    const json = await (await get("?week=2026-11-04")).json();
    expect(json.week).toEqual({ start: "2026-11-02", end: "2026-11-08", isCurrent: false });
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toMatchObject({ userId: "agnes", activeSeconds: null, oldMinutes: 5 });
  });

  it("?weeks and ?userId give one person's weeks, newest first", async () => {
    const json = await (await get("?weeks=2&userId=agnes")).json();
    expect(json.weeks).toEqual(["2026-11-09", "2026-11-02"]);
    expect(json.rows.map((r: { weekStart: string }) => r.weekStart)).toEqual([
      "2026-11-09",
      "2026-11-02",
    ]);
  });

  it("works before the three new tables exist: estimates only, edits are corrections only", async () => {
    const db = seed() as Record<string, { findMany: unknown; findFirst: unknown }>;
    const missing = async () => {
      throw Object.assign(new Error("no table"), { code: "P2021" });
    };
    db.activityPing.findMany = missing;
    db.activityPing.findFirst = missing;
    db.timeNote.findMany = missing;
    state.db = db;
    const json = await (await get()).json();
    expect(json.measuredSince).toBeNull();
    expect(json.revisionsCounted).toBe(false);
    expect(json.rows[0]).toMatchObject({ userId: "agnes", activeSeconds: null, edits: 1 });
  });

  it("counts a saved edit once the revision table exists, one per save", async () => {
    state.db = seed({
      AnswerRevisionSaves: [{ editorId: "agnes", at: d("2026-11-12T10:40:00Z") }],
    });
    const json = await (await get()).json();
    expect(json.revisionsCounted).toBe(true);
    expect(json.rows[0].edits).toBe(2);
    expect(json.rows[0].recountedMinutes).toBe(105); // the sitting now runs to 10:40
    expect(json.rows[0].oldMinutes).toBe(25); // the old estimate does not move
  });

  it("?format=csv downloads the same rows, with the span in the file name", async () => {
    const res = await get("?format=csv&weeks=2");
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="hours_2026-11-02_2026-11-15.csv"',
    );
    const lines = (await res.text()).trimEnd().split("\n");
    expect(lines[0].startsWith("week_start,week_end,name,email,role,active_hours,")).toBe(true);
    expect(lines).toHaveLength(4);
    // The past week: active_hours empty, basis estimate.
    expect(lines[1]).toContain("2026-11-02,2026-11-08,Agnes Test,agnes@example.org,RESEARCHER,,");
  });
});

describe("parity: the annotator's Dashboard figure is their row in the researcher table", () => {
  it.each(["agnes", "austine"])("%s", async (userId) => {
    mockSession.mockResolvedValue({ user: { id: userId, role: "ANNOTATOR" } });
    const summary = await (await summaryGET()).json();
    const admin = await (await get("?weeks=2")).json();
    const row = (week: string) =>
      admin.rows.find(
        (r: { userId: string; weekStart: string }) =>
          r.userId === userId && r.weekStart === week,
      );
    for (const [figure, week] of [
      [summary.time.thisWeek, "2026-11-09"],
      [summary.time.lastWeek, "2026-11-02"],
    ] as const) {
      const r = row(week);
      if (!r) {
        expect(figure).toEqual({ seconds: 0, basis: "estimate" });
      } else if (r.activeSeconds !== null) {
        expect(figure).toEqual({ seconds: r.activeSeconds, basis: "measured" });
      } else {
        expect(figure).toEqual({ seconds: r.recountedMinutes * 60, basis: "estimate" });
      }
    }
    if (userId === "agnes") {
      expect(summary.time.thisWeek).toEqual({ seconds: 105, basis: "measured" });
      expect(summary.time.lastWeek).toEqual({ seconds: 300, basis: "estimate" });
    }
  });
});
