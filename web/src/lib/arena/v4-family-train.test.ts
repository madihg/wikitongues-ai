import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * The shared train-answer assembly. What these pin: retrieval and the grammar
 * block are built for a TRAIN prompt (isHoldout false); the grammar block is
 * read only by the labels that serve it; the served pass's tokens are the
 * LAST call's, not the repair round's sum; and the storability rule refuses
 * empty and pinned answers on the served pass.
 */

const calls: { retrieval: unknown[]; grammar: unknown[]; generate: unknown[] } =
  { retrieval: [], grammar: [], generate: [] };
let generations: { text: string; tokensOut: number }[] = [];

vi.mock("@/lib/arena/retrieval-v4", () => ({
  buildRetrievalV4: async (_p: unknown, args: unknown) => {
    calls.retrieval.push(args);
    return {
      correctionsBlock: "",
      parallelBlock: "",
      dictionaryBlock: "",
      exampleTurns: [],
      contextIds: ["lex:1"],
      leakReport: { pass: true, hitCount: 0, hits: [] },
    };
  },
}));
vi.mock("@/lib/arena/grammar-block", () => ({
  buildGrammarBlock: async (_p: unknown, args: unknown) => {
    calls.grammar.push(args);
    return {
      grammarBlock: "GRAMMAR NOTES",
      grammarIds: ["grammar:g1"],
      leakReport: { pass: true, hitCount: 0, hits: [] },
    };
  },
}));
vi.mock("@/lib/arena/providers", () => ({
  generateForCandidate: async (candidate: unknown, args: unknown) => {
    calls.generate.push({ candidate, args });
    const g = generations.shift()!;
    return {
      text: g.text,
      modelId: "gemini-3.1-pro-preview",
      latencyMs: 1,
      tokensIn: 100,
      tokensOut: g.tokensOut,
      ragContextIds: [],
    };
  },
}));

const { generateV4FamilyTrainAnswer, unstorableReason } =
  await import("./v4-family-train");

const prisma = {} as PrismaClient;
const candidate = {
  provider: "google",
  baseModelId: "gemini-3.1-pro-preview",
  versionLabel: "rag-v4-4",
  decodingParams: { temperature: 0, maxTokens: 4096 },
};
const prompt = {
  promptId: "ig_v42_gram_001",
  text: "Translate 'Musa lives in Idah' into Igala.",
  bucket: "grammar_tone",
};

beforeEach(() => {
  calls.retrieval = [];
  calls.grammar = [];
  calls.generate = [];
});

describe("generateV4FamilyTrainAnswer", () => {
  it("assembles for a train prompt and serves a clean first pass as is", async () => {
    generations = [{ text: "Musa dodo efẹwọ Idah.", tokensOut: 1200 }];
    const a = await generateV4FamilyTrainAnswer(
      prisma,
      candidate,
      "rag-v4-4",
      prompt,
      4096,
    );
    expect(calls.retrieval).toEqual([
      expect.objectContaining({
        promptId: "ig_v42_gram_001",
        isHoldout: false,
      }),
    ]);
    expect(calls.grammar).toEqual([
      expect.objectContaining({ isHoldout: false }),
    ]);
    expect(a.gen.repaired).toBe(false);
    expect(a.gen.text).toBe("Musa dodo efẹwọ Idah.");
    expect(a.ragContextIds).toEqual(["lex:1", "grammar:g1"]);
    expect(a.servedPassTokensOut).toBe(1200);
    // The train budget, not the candidate's own, reaches the provider.
    const sent = calls.generate[0] as {
      candidate: { decodingParams: { maxTokens: number } };
    };
    expect(sent.candidate.decodingParams.maxTokens).toBe(4096);
  });

  it("reports the SECOND pass's tokens when the repair round re-asks", async () => {
    // First pass has an invented s-word, so the round re-asks once.
    generations = [
      { text: "Musa sọ efẹwọ Idah.", tokensOut: 3000 },
      { text: "Musa dodo efẹwọ Idah.", tokensOut: 4090 },
    ];
    const a = await generateV4FamilyTrainAnswer(
      prisma,
      candidate,
      "rag-v4-4",
      prompt,
      4096,
    );
    expect(a.gen.repaired).toBe(true);
    expect(a.gen.tokensOut).toBe(7090); // the round's sum, what was paid
    expect(a.servedPassTokensOut).toBe(4090); // what the guard must judge
    expect(unstorableReason(a.gen.text, a.servedPassTokensOut, 4096)).toMatch(
      /truncated/,
    );
    // The sum alone would have hidden it under a two-pass threshold.
    expect(a.gen.tokensOut! < 2 * 4096 - 8).toBe(true);
  });

  it("skips the grammar block for a label that does not serve it", async () => {
    generations = [{ text: "Musa dodo efẹwọ Idah.", tokensOut: 900 }];
    const a = await generateV4FamilyTrainAnswer(
      prisma,
      { ...candidate, versionLabel: "rag-v4-2" },
      "rag-v4-2",
      prompt,
      4096,
    );
    expect(calls.grammar).toEqual([]);
    expect(a.ragContextIds).toEqual(["lex:1"]);
  });
});

describe("unstorableReason", () => {
  it("refuses empty text and a served pass pinned at the cap, and nothing else", () => {
    expect(unstorableReason("", 10, 4096)).toMatch(/empty/);
    expect(unstorableReason("   ", 10, 4096)).toMatch(/empty/);
    expect(unstorableReason("Agba oo", 4088, 4096)).toMatch(/truncated/);
    expect(unstorableReason("Agba oo", 4087, 4096)).toBeNull();
    expect(unstorableReason("Agba oo", undefined, 4096)).toBeNull();
  });
});
