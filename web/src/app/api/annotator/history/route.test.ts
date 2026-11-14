import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, session } = vi.hoisted(() => ({
  mockPrisma: {
    pairwiseComparison: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    outputEdit: { findMany: vi.fn() },
    prompt: { findMany: vi.fn() },
  },
  session: { value: null as unknown },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.value }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "./route";

/** My Work's feed: what the Edit button and the fix filter need from it.
 *  Invented placeholder texts. */

const at = (n: number) => new Date(Date.UTC(2026, 9, 12, 8, n));
const get = (qs = "") =>
  GET(new Request(`http://test/api/annotator/history${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { id: "ann", role: "ANNOTATOR" } };
  mockPrisma.pairwiseComparison.findMany.mockResolvedValue([
    {
      id: "p1",
      promptId: "ig_test_001",
      bucket: null,
      winner: "b",
      confidence: null,
      explanation: "B reads better.",
      createdAt: at(5),
      modelOutputA: { outputText: "a" },
      modelOutputB: { outputText: "b" },
    },
  ]);
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
    {
      id: "c-none",
      bucket: null,
      answerText: "alpha",
      englishGloss: null,
      provenance: "speaker_authored_sourcefree",
      createdAt: at(4),
      prompt: { text: "Q1?" },
    },
    {
      id: "c-ok",
      bucket: null,
      answerText: "beta",
      englishGloss: "It says beta.",
      provenance: "speaker_authored_sourcefree",
      createdAt: at(3),
      prompt: { text: "Q2?" },
    },
  ]);
  mockPrisma.outputEdit.findMany.mockResolvedValue([
    {
      id: "e-short",
      bucket: null,
      originalText: "one",
      correctedText: "ONE",
      rationale: "tone",
      createdAt: at(2),
      modelOutput: { prompt: { text: "Q3?" } },
    },
    {
      id: "e-ok",
      bucket: null,
      originalText: "two",
      correctedText: "TWO",
      rationale: "The word is a name, so it takes a capital.",
      createdAt: at(1),
      modelOutput: { prompt: { text: "Q4?" } },
    },
  ]);
  mockPrisma.prompt.findMany.mockResolvedValue([
    { promptId: "ig_test_001", text: "Q0?" },
  ]);
});

describe("GET /api/annotator/history", () => {
  it("401 signed out", async () => {
    session.value = null;
    expect((await get()).status).toBe(401);
  });

  it("every row carries its kind and id (what Edit opens) and the fix flag", async () => {
    const body = await (await get()).json();
    expect(
      body.rows.map((r: { kind: string; id: string; needsFix?: boolean }) => [
        r.kind,
        r.id,
        r.needsFix,
      ]),
    ).toEqual([
      ["pairwise", "p1", undefined],
      ["cold", "c-none", true],
      ["cold", "c-ok", false],
      ["edit", "e-short", true],
      ["edit", "e-ok", false],
    ]);
    expect(body.filter).toBe("all");
    // the meaning and the reason come back so an edit shows in My Work
    expect(body.rows[2].englishGloss).toBe("It says beta.");
    expect(body.rows[4].rationale).toContain("takes a capital");
  });

  it("?filter=fix: only an answer with no meaning or a correction with a short reason", async () => {
    const body = await (await get("?filter=fix")).json();
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual([
      "c-none",
      "e-short",
    ]);
    expect(body.fixCount).toBe(2);
    expect(body.filter).toBe("fix");
    // comparisons have nothing to fix and are not read at all
    expect(mockPrisma.pairwiseComparison.findMany).not.toHaveBeenCalled();
  });

  it("reads only the signed-in person's counted rows", async () => {
    await get("?filter=fix");
    for (const m of [mockPrisma.coldAuthorAnswer, mockPrisma.outputEdit]) {
      expect(m.findMany.mock.calls[0][0].where).toEqual({
        annotatorId: "ann",
        isDemo: false,
      });
    }
  });
});
