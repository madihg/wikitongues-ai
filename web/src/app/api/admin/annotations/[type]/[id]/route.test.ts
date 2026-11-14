import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { fakePrisma } from "@/lib/answer-edit.fake";

const holder = vi.hoisted(() => ({ db: null as unknown }));
const { mockRequireResearcher } = vi.hoisted(() => ({
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] },
  ),
}));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { PATCH } from "./route";

/**
 * The researcher's door (Annotations). Before Nov 13 this PATCH accepted the
 * answer text alone: a body with `englishGloss` or `rationale` answered 400
 * "Nothing to update", and every pairwise PATCH answered 405. That is the
 * cause of what Agnes reported on Nov 10 (she holds the RESEARCHER role and
 * edits here). These tests hold the fix, and what must not have moved.
 * Invented placeholder texts.
 */

const patch = (type: string, id: string, body: unknown) =>
  PATCH(
    new Request("http://test/x", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ type, id }) },
  );

let db: ReturnType<typeof fakePrisma>;
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "agnes",
    role: "RESEARCHER",
  });
  const base = { isDemo: false, promptId: "p1", createdAt: new Date() };
  db = fakePrisma({
    cold: ["agnes", "other"].map((who) => ({
      ...base,
      id: `c-${who}`,
      annotatorId: who,
      answerText: "alpha beta",
      englishGloss: null,
      dialect: null,
      instructionIg: null,
      verificationStatus: "single_annotator",
      prompt: { promptId: "ig_test_001" },
    })),
    edits: ["agnes", "other"].map((who) => ({
      ...base,
      id: `e-${who}`,
      annotatorId: who,
      originalText: "one two",
      correctedText: "one TWO",
      rationale: null,
      segments: null,
      verificationStatus: "single_annotator",
    })),
    pairwise: ["agnes", "other"].map((who) => ({
      ...base,
      id: `pw-${who}`,
      annotatorId: who,
      winner: "a",
      explanation: "A is right.",
      promptId: "ig_test_001",
    })),
  });
  holder.db = db;
});

const find = (rows: Record<string, unknown>[], id: string) =>
  rows.find((r) => r.id === id) as Record<string, unknown>;

describe("PATCH /api/admin/annotations/[type]/[id]", () => {
  it("was 400 and 405: a researcher's own meaning, reason and why now save", async () => {
    const meaning = await patch("cold", "c-agnes", { englishGloss: "A new meaning." });
    const reason = await patch("edit", "e-agnes", {
      rationale: "A fuller reason for the change.",
    });
    const why = await patch("pairwise", "pw-agnes", {
      explanation: "A keeps the tone marks.",
    });
    expect([meaning.status, reason.status, why.status]).toEqual([200, 200, 200]);
    expect(find(db.coldAuthorAnswer.rows, "c-agnes").englishGloss).toBe(
      "A new meaning.",
    );
    expect(find(db.outputEdit.rows, "e-agnes").rationale).toBe(
      "A fuller reason for the change.",
    );
    expect(find(db.pairwiseComparison.rows, "pw-agnes").explanation).toBe(
      "A keeps the tone marks.",
    );
    expect(db.answerRevision.rows).toHaveLength(3);
  });

  it("another person's meaning, reason or why stays closed (403)", async () => {
    expect((await patch("cold", "c-other", { englishGloss: "x" })).status).toBe(403);
    expect((await patch("edit", "e-other", { rationale: "x" })).status).toBe(403);
    expect((await patch("pairwise", "pw-other", { explanation: "x" })).status)
      .toBe(403);
    expect(db.answerRevision.rows).toHaveLength(0);
  });

  it("another person's answer text still saves, as before, and is now logged", async () => {
    const res = await patch("cold", "c-other", { answerText: "alpha BETA" });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(find(db.coldAuthorAnswer.rows, "c-other").answerText).toBe("alpha BETA");
    const fix = await patch("edit", "e-other", { correctedText: "ONE two" });
    expect(fix.status).toBe(200);
    expect(find(db.outputEdit.rows, "e-other").correctedText).toBe("ONE two");
    expect(db.answerRevision.rows.map((r) => r.field)).toEqual([
      "answerText",
      "correctedText",
      "segments",
    ]);
    expect(db.answerRevision.rows.every((r) => r.editorId === "agnes")).toBe(true);
  });

  it("the choice is still refused (405), on one's own comparison too", async () => {
    expect((await patch("pairwise", "pw-agnes", { winner: "b" })).status).toBe(405);
    expect((await patch("pairwise", "pw-other", { winner: "b" })).status).toBe(405);
    expect(
      (await patch("pairwise", "pw-agnes", { verificationStatus: "expert_reviewed" }))
        .status,
    ).toBe(405);
    expect(find(db.pairwiseComparison.rows, "pw-agnes").winner).toBe("a");
  });

  it("verification status works as before, alone and with a text", async () => {
    const alone = await patch("cold", "c-other", {
      verificationStatus: "expert_reviewed",
    });
    expect(alone.status).toBe(200);
    expect((await alone.json()).verificationStatus).toBe("expert_reviewed");
    expect(find(db.coldAuthorAnswer.rows, "c-other").verificationStatus).toBe(
      "expert_reviewed",
    );
    // a status change is not a revision
    expect(db.answerRevision.rows).toHaveLength(0);
    const both = await patch("edit", "e-other", {
      correctedText: "one TWO three",
      verificationStatus: "expert_reviewed",
    });
    expect(both.status).toBe(200);
    expect(find(db.outputEdit.rows, "e-other")).toMatchObject({
      correctedText: "one TWO three",
      verificationStatus: "expert_reviewed",
    });
    expect((await patch("cold", "c-other", { verificationStatus: "nope" })).status)
      .toBe(400);
    expect((await patch("cold", "c-other", {})).status).toBe(400);
  });

  it("an annotator is still turned away here (403)", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await patch("cold", "c-other", { answerText: "x" })).status).toBe(403);
  });
});
