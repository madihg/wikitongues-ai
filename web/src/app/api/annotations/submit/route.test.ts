import { describe, it, expect, vi, beforeEach } from "vitest";
import { RUBRIC_V2 } from "@/lib/buckets";

/**
 * Server-side proof of the 2026-08-28 rework's REQUIRED fields:
 *   - at least one failure tag on every side the verdict rejects
 *     (loser on a/b, both on both_inadequate, none on tie);
 *   - an English rationale on every OutputEdit the episode saves.
 * Plus the guards that must NOT have moved: provenance values, the
 * never-rejecting enrichment (garbage segments still save the edit), and
 * "no edit -> no rationale demanded".
 *
 * Prisma and auth are mocked; everything else in the route is the real code.
 */

const { mockPrisma, mockGetServerSession } = vi.hoisted(() => {
  const mockPrisma = {
    modelOutput: { findUnique: vi.fn() },
    prompt: { findUnique: vi.fn() },
    pairwiseComparison: { findFirst: vi.fn(), create: vi.fn() },
    rubricAxisScore: { create: vi.fn() },
    outputEdit: { create: vi.fn() },
    coldAuthorAnswer: { create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { mockPrisma, mockGetServerSession: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { POST } from "./route";

const OUTPUT_A = {
  id: "out-a",
  promptId: "prompt-db-id",
  bucket: "orthography",
  outputText: "Ọjọ ki chẹnyọ ñwu wẹ",
};
const OUTPUT_B = {
  id: "out-b",
  promptId: "prompt-db-id",
  bucket: "orthography",
  outputText: "Àgbá Ọ́jọ́",
};

/** A rubric payload that satisfies "every axis answered, at least one scored". */
const fullRubric = () =>
  RUBRIC_V2.map((a, i) => ({ axis: a.key, score: i === 0 ? 4 : null }));

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    promptId: "ig_orth_001",
    modelOutputAId: OUTPUT_A.id,
    modelOutputBId: OUTPUT_B.id,
    winner: "a",
    explanation: "B is not Igala.",
    failureTagsA: [],
    failureTagsB: ["wrong_language"],
    rubricAxes: fullRubric(),
    ...overrides,
  };
}

function post(payload: Record<string, unknown>) {
  return POST(
    new Request("http://test/api/annotations/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { id: "annot-1" } });
  mockPrisma.modelOutput.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      where.id === OUTPUT_A.id
        ? OUTPUT_A
        : where.id === OUTPUT_B.id
          ? OUTPUT_B
          : null,
  );
  mockPrisma.prompt.findUnique.mockResolvedValue({ bucket: "orthography" });
  mockPrisma.pairwiseComparison.findFirst.mockResolvedValue(null);
  // Each create returns a row stub; $transaction resolves them in order.
  for (const model of [
    mockPrisma.pairwiseComparison,
    mockPrisma.rubricAxisScore,
    mockPrisma.outputEdit,
    mockPrisma.coldAuthorAnswer,
  ]) {
    model.create.mockImplementation(() => ({ id: "row-id" }));
  }
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("required failure tags (server-side)", () => {
  it("400s a winner=a episode with no tags on the losing side B", async () => {
    const res = await post(basePayload({ failureTagsB: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/losing output/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("400s when the loser's tags are all unknown keys - sanitize first, then require", async () => {
    const res = await post(basePayload({ failureTagsB: ["bogus", "zzz"] }));
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("winner=b requires tags on side A, and A's tags satisfy it", async () => {
    const missing = await post(
      basePayload({ winner: "b", failureTagsA: [], failureTagsB: [] }),
    );
    expect(missing.status).toBe(400);

    const ok = await post(
      basePayload({
        winner: "b",
        failureTagsA: ["grammar"],
        failureTagsB: [],
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("both_inadequate requires at least one tag on EACH side", async () => {
    const oneSided = await post(
      basePayload({
        winner: "both_inadequate",
        explanation: "Neither is real Igala, the greeting is Yoruba.",
        failureTagsA: ["not_igala"],
        failureTagsB: [],
        rubricAxes: undefined,
      }),
    );
    expect(oneSided.status).toBe(400);
    expect((await oneSided.json()).error).toMatch(/each output/i);

    const bothSides = await post(
      basePayload({
        winner: "both_inadequate",
        explanation: "Neither is real Igala, the greeting is Yoruba.",
        failureTagsA: ["not_igala"],
        failureTagsB: ["wrong_language"],
        rubricAxes: undefined,
      }),
    );
    expect(bothSides.status).toBe(200);
  });

  it("tie requires no tags - there is no rejected output to diagnose", async () => {
    const res = await post(
      basePayload({
        winner: "tie",
        failureTagsA: [],
        failureTagsB: [],
        rubricAxes: undefined,
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("required edit rationale (server-side)", () => {
  const correctedA = "Ọjọ ki d'ẹnyọ ñwu wẹ";

  it("400s an edit that changes text but carries no rationale", async () => {
    const res = await post(
      basePayload({ edit: { correctedText: correctedA } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/why you made these corrections/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("400s a whitespace-only rationale - presence means words, not spaces", async () => {
    const res = await post(
      basePayload({ edit: { correctedText: correctedA, rationale: "   " } }),
    );
    expect(res.status).toBe(400);
  });

  it("saves the edit with its trimmed rationale and untouched winner provenance", async () => {
    const res = await post(
      basePayload({
        edit: {
          correctedText: correctedA,
          rationale: "  'chẹnyọ' needs the elision: d'ẹnyọ.  ",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).editsSaved).toBe(1);
    expect(mockPrisma.outputEdit.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.outputEdit.create.mock.calls[0][0].data;
    expect(data.rationale).toBe("'chẹnyọ' needs the elision: d'ẹnyọ.");
    expect(data.provenance).toBe("model_correction");
    expect(data.modelOutputId).toBe(OUTPUT_A.id);
  });

  it("keeps the both_inadequate markup provenance: salvage_both_inadequate", async () => {
    const res = await post(
      basePayload({
        winner: "both_inadequate",
        explanation: "Neither is right - here is what is wrong.",
        failureTagsA: ["not_igala"],
        failureTagsB: ["tone_marks"],
        rubricAxes: undefined,
        edit: {
          modelOutputId: OUTPUT_B.id,
          correctedText: "Agba ọjọ",
          rationale: "The tone marks do not belong on this greeting.",
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = mockPrisma.outputEdit.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("salvage_both_inadequate");
    expect(data.modelOutputId).toBe(OUTPUT_B.id);
  });

  it("demands no rationale when the 'edit' does not actually change the text", async () => {
    // NFD spelling of the same string: the NFC compare must see "no change",
    // so no edit row and no rationale requirement (the phantom-diff rule).
    const res = await post(
      basePayload({
        edit: { correctedText: OUTPUT_A.outputText.normalize("NFD") },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).editsSaved).toBe(0);
    expect(mockPrisma.outputEdit.create).not.toHaveBeenCalled();
  });

  it("enrichment stays never-rejecting: garbage segments still save the edit (derived server-side)", async () => {
    const res = await post(
      basePayload({
        edit: {
          correctedText: correctedA,
          rationale: "One word fixed.",
          segments: [{ start: "not", end: "numbers" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).editsSaved).toBe(1);
    const data = mockPrisma.outputEdit.create.mock.calls[0][0].data;
    // Derived segments envelope, not the garbage.
    expect(data.segments.v).toBe(1);
    expect(Array.isArray(data.segments.segments)).toBe(true);
    expect(data.segments.segments.length).toBeGreaterThan(0);
  });
});

describe("what did not change", () => {
  it("a clean winner episode still writes comparison + rubric rows", async () => {
    const res = await post(basePayload());
    expect(res.status).toBe(200);
    expect(mockPrisma.pairwiseComparison.create).toHaveBeenCalledTimes(1);
    const cmp = mockPrisma.pairwiseComparison.create.mock.calls[0][0].data;
    expect(cmp.winner).toBe("a");
    expect(cmp.failureTagsA).toEqual([]); // winner side never records tags
    expect(cmp.failureTagsB).toEqual(["wrong_language"]);
    expect(mockPrisma.rubricAxisScore.create).toHaveBeenCalledTimes(
      RUBRIC_V2.length,
    );
  });

  it("confidence stays accepted-optional for stale clients", async () => {
    const res = await post(basePayload({ confidence: 4 }));
    expect(res.status).toBe(200);
    const cmp = mockPrisma.pairwiseComparison.create.mock.calls[0][0].data;
    expect(cmp.confidence).toBe(4);
  });
});
