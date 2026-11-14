import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb } from "@/lib/fake-db.testutil";

const { state, mockSession, mockQueue } = vi.hoisted(() => ({
  state: { db: null as unknown },
  mockSession: vi.fn(),
  mockQueue: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, prop) => (state.db as Record<string | symbol, unknown>)[prop] },
  ),
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/queue-input", () => ({
  loadQueueInputs: async () => ({ queuePrompts: [] }),
  loadCorrectionInputs: async () => ({ correctionInputs: [] }),
}));
vi.mock("@/lib/pairing", () => ({ computeQueueState: mockQueue }));

import { GET } from "./route";

const d = (iso: string) => new Date(iso);
const lab = process.env.SPEECH_LAB_ENABLED;
const layer = process.env.SPEECH_LAYER_ANNOTATORS;

/** Own rows for "me": 2 answers without a meaning, one clip, one answer to record. */
function seed(over: Record<string, Record<string, unknown>[]> = {}) {
  const mine = { annotatorId: "me", isDemo: false };
  return fakeDb({
    user: [{ id: "me", name: "Me Test", email: "me@example.org", role: "ANNOTATOR" }],
    pairwiseComparison: [{ ...mine, id: "pw1", promptId: "code_1", winner: "a", createdAt: d("2026-11-12T09:00:00Z") }],
    coldAuthorAnswer: [
      { ...mine, id: "a1", promptId: "p1", englishGloss: null, createdAt: d("2026-11-12T09:05:00Z"), prompt: { text: "Prompt one" } },
      { ...mine, id: "a2", promptId: "p2", englishGloss: "", createdAt: d("2026-11-12T09:06:00Z"), prompt: { text: "Prompt two" } },
    ],
    outputEdit: [],
    rubricAxisScore: [],
    promptFlag: [],
    prompt: [{ promptId: "code_1", text: "Prompt code one" }],
    speechRecording: [
      { ...mine, id: "c1", promptId: "p1", language: "igala", durationMs: 9000, createdAt: d("2026-11-12T09:30:00Z"), prompt: { text: "Prompt one" } },
    ],
    speechComparison: [],
    speechCheck: [],
    activityPing: [],
    timeNote: [],
    handoffItem: [],
    ...over,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(d("2026-11-13T12:00:00Z"));
  state.db = seed();
  mockSession.mockResolvedValue({ user: { id: "me", role: "ANNOTATOR", email: "me@example.org" } });
  mockQueue.mockReturnValue({ remaining: Array.from({ length: 12 }), corrections: [] });
  delete process.env.SPEECH_LAB_ENABLED;
  delete process.env.SPEECH_LAYER_ANNOTATORS;
});
afterEach(() => {
  vi.useRealTimers();
  if (lab === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = lab;
  if (layer === undefined) delete process.env.SPEECH_LAYER_ANNOTATORS;
  else process.env.SPEECH_LAYER_ANNOTATORS = layer;
});

describe("GET /api/annotator/summary", () => {
  it("401 when signed out", async () => {
    mockSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("the Annotate number is the queue's length, and the old fields are still there", async () => {
    const json = await (await GET()).json();
    expect(json.waiting.annotate).toBe(12);
    expect(json.pending).toBe(12);
    expect(json).toMatchObject({ completed: 1, coldAnswers: 2, correctionsWaiting: 0 });
  });

  it("an annotator with the speech switches off gets no speech numbers", async () => {
    const json = await (await GET()).json();
    expect(json.speech).toBe(false);
    expect(json.waiting).toMatchObject({ record: 0, listen: 0, check: 0, tone: 0 });
  });

  it("the lab on is not enough for an annotator: the annotator layer must be on too", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    expect((await (await GET()).json()).speech).toBe(false);
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    expect((await (await GET()).json()).speech).toBe(true);
    mockSession.mockResolvedValue({ user: { id: "me", role: "RESEARCHER", email: "me@example.org" } });
    delete process.env.SPEECH_LAYER_ANNOTATORS;
    expect((await (await GET()).json()).speech).toBe(true);
  });

  it("the fix card stays at zero until the edit log exists, then counts own answers with no meaning", async () => {
    expect((await (await GET()).json()).waiting).toMatchObject({ fix: 0, fixTotal: 0 });
    state.db = seed({ AnswerRevisionSaves: [] });
    expect((await (await GET()).json()).waiting).toMatchObject({ fix: 2, fixTotal: 2 });
  });

  it("counts clips recorded and lists clips in Recent Activity as type Clip", async () => {
    const json = await (await GET()).json();
    expect(json.clips).toBe(1);
    expect(json.recent[0]).toMatchObject({ prompt: "Prompt one", type: "Clip", status: "Saved" });
    expect(json.recent.map((r: { type: string }) => r.type)).toEqual([
      "Clip",
      "Gold answer",
      "Gold answer",
      "Comparison",
    ]);
  });

  it("lists a saved edit in Recent Activity as type Edit, naming the prompt and nothing of the text", async () => {
    state.db = seed({
      AnswerRevisionSaves: [
        { editorId: "me", targetType: "cold", targetId: "a1", at: d("2026-11-13T08:00:00Z") },
      ],
    });
    const json = await (await GET()).json();
    expect(json.recent[0]).toEqual({
      prompt: "Prompt one",
      type: "Edit",
      status: "Saved",
      date: "2026-11-13T08:00:00.000Z",
    });
  });

  it("gives this week and last week, estimated from saved work while the clock is not running", async () => {
    const json = await (await GET()).json();
    // 09:00 to 09:30, + 5: one sitting, the clip included.
    expect(json.time.thisWeek).toEqual({ seconds: 35 * 60, basis: "estimate" });
    expect(json.time.lastWeek).toEqual({ seconds: 0, basis: "estimate" });
    expect(json.time.measuredSince).toBeNull();
  });
});
