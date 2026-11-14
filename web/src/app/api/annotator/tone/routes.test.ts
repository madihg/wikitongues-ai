import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { fakeToneDb } from "@/lib/tone/tone-pass.fake";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
}));
const { mockRequireResearcher } = vi.hoisted(() => ({
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] },
  ),
}));
vi.mock("next-auth", () => ({ getServerSession: async () => holder.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as next } from "./next/route";
import { POST as submit } from "./submit/route";
import { POST as skip } from "./skip/route";
import { GET as count } from "./count/route";
import { GET as admin } from "@/app/api/admin/tone/route";
import { POST as adjudicate } from "@/app/api/admin/tone/adjudicate/route";
import { GET as exportCsv } from "@/app/api/admin/tone/export/route";

/**
 * The tone routes: who may come in, and the status codes. The rules behind
 * them are held in src/lib/tone/tone-pass.test.ts. Invented non-words; the
 * mark \u0301 is an acute.
 */

const H = "\u0301";
const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(
    new Request("http://test/x", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const as = (id: string | null, role = "ANNOTATOR") => {
  holder.session = id ? { user: { id, role } } : null;
};

let db: ReturnType<typeof fakeToneDb>;
beforeEach(() => {
  vi.clearAllMocks();
  db = fakeToneDb({
    prompts: [{ id: "p1", promptId: "ig_test_001", text: "A question?" }],
    users: [{ id: "ann", name: "Marker One" }],
    items: [
      {
        id: "i1",
        setName: "tone-set-v1",
        sourceType: "cold",
        sourceId: "c1",
        promptId: "p1",
        sourceTextSnapshot: "babe du",
        cells: [],
        requiredMarkers: 2,
        createdAt: new Date("2026-11-13T10:00:00Z"),
      },
    ],
    assignments: [
      {
        id: "a1",
        itemId: "i1",
        annotatorId: "ann",
        skippedAt: null,
        createdAt: new Date(),
      },
    ],
  });
  holder.db = db;
  as(null);
  mockRequireResearcher.mockResolvedValue({
    error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    userId: null,
    role: null,
  });
});

describe("the marker's routes", () => {
  it("401 signed out, 403 for a learner, on every route", async () => {
    const calls = () => [
      next(new Request("http://test/x")),
      post(submit, { itemId: "i1", text: "babe du" }),
      post(skip, { itemId: "i1" }),
      count(),
    ];
    for (const res of await Promise.all(calls())) expect(res.status).toBe(401);
    as("lea", "LEARNER");
    for (const res of await Promise.all(calls())) expect(res.status).toBe(403);
    expect(db.tonePass.rows).toHaveLength(0);
  });

  it("an annotator with an item gets it, marks it, and the count follows", async () => {
    as("ann");
    expect(await (await count()).json()).toEqual({ waiting: 1, done: 0 });
    const task = await (await next(new Request("http://test/x"))).json();
    expect(task.task.itemId).toBe("i1");
    const saved = await post(submit, { itemId: "i1", text: `ba${H}be du` });
    expect(saved.status).toBe(200);
    expect(await (await count()).json()).toEqual({ waiting: 0, done: 1 });
    const reopened = await next(new Request("http://test/x?item=i1"));
    expect((await reopened.json()).task.mine.text).toBe(
      `ba${H}be du`.normalize("NFC"),
    );
  });

  it("a change that is not a tone mark is a 409 with its code", async () => {
    as("ann");
    const res = await post(submit, { itemId: "i1", text: "babe da" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("non_tone_change");
  });

  it("someone with no item gets an empty queue and cannot mark another's (403)", async () => {
    as("other", "RESEARCHER");
    expect(
      (await (await next(new Request("http://test/x"))).json()).complete,
    ).toBe(true);
    expect((await post(submit, { itemId: "i1", text: "babe du" })).status).toBe(
      403,
    );
    expect((await post(skip, { itemId: "i1" })).status).toBe(404);
  });

  it("a bad body is a JSON 400", async () => {
    as("ann");
    expect((await post(submit, "{nope")).status).toBe(400);
    expect((await post(skip, {})).status).toBe(400);
  });
});

describe("the researcher's routes", () => {
  it("an annotator is turned away from all three (403)", async () => {
    as("ann");
    expect((await admin()).status).toBe(403);
    expect(
      (await post(adjudicate, { itemId: "i1", agreedText: "babe du" })).status,
    ).toBe(403);
    expect(
      (await exportCsv(new Request("http://test/x?file=layers"))).status,
    ).toBe(403);
    expect(db.tonePassAgreed.rows).toHaveLength(0);
  });

  it("a researcher reads the view, decides an item, and downloads both files", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: null,
      userId: "res",
      role: "RESEARCHER",
    });
    const view = await (await admin()).json();
    expect(view.items).toHaveLength(1);
    expect(view.summary.items).toBe(1);
    const ok = await post(adjudicate, {
      itemId: "i1",
      agreedText: `ba${H}be du`,
    });
    expect(ok.status).toBe(200);
    expect(db.tonePassAgreed.rows[0]).toMatchObject({
      method: "adjudicated",
      adjudicatorId: "res",
    });
    const layers = await exportCsv(new Request("http://test/x?file=layers"));
    expect(layers.headers.get("Content-Disposition")).toContain(
      "tone_pass.csv",
    );
    expect((await layers.text()).split("\n")[0]).toContain("layer,igala_text");
    const agreement = await exportCsv(
      new Request("http://test/x?file=agreement"),
    );
    expect(agreement.headers.get("Content-Disposition")).toContain(
      "tone_agreement.csv",
    );
    expect(
      (await exportCsv(new Request("http://test/x?file=nope"))).status,
    ).toBe(400);
  });
});
