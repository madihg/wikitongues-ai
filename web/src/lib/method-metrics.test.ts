import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  approachLabel,
  computeMethodMetrics,
  looCeilingChrf,
  onePerAnnotator,
  splitServedIds,
  type GoldRow,
} from "./method-metrics";

/**
 * The "How it works" page promises every number is computed live. These tests
 * pin down WHAT is computed: consent enforced in the gold query, seed
 * accounts excluded from the annotator count, leakage detected from the
 * served context, archived candidates kept out of the scoreboard, and the
 * two ceilings actually differing when one annotator repeats themselves -
 * the 63.2 -> 46 correction from tasks/latest-learnings-2026-08-09.md.
 *
 * Prisma is injected, so a recorder fake stands in for the database - the
 * same pattern as src/lib/eval/collect.test.ts.
 */

interface RecordedCall {
  model: string;
  args: {
    where?: Record<string, unknown>;
    distinct?: string[];
  };
}

/**
 * Fixture world:
 *   Frozen prompts: P1 (gold "Omi" x2 by ann A - a repeat - plus "Ọmi" by B),
 *                   P2 (gold "Oji" by B).
 *   Outputs:
 *     "Plain GPT" (baseline): wrong on both prompts, no context.
 *     "GPT + RAG v2" (rag, versionLabel rag-v2): exact on both; on P1 it was
 *       served exemplar G-LEAK whose text IS P1's own gold -> P1 leaks.
 *     "Old broken" (archived): must never appear in the scoreboard.
 */
function fakePrisma(calls: RecordedCall[]): PrismaClient {
  const rec = (model: string, args: RecordedCall["args"]) =>
    calls.push({ model, args });

  const t = (n: number) => new Date(2026, 0, n);

  return {
    prompt: {
      findMany: async (args: RecordedCall["args"]) => {
        rec("prompt", args);
        return [
          { id: "P1", promptId: "ig_bank_orth_001" },
          { id: "P2", promptId: "ig_bank_lex_003" },
        ];
      },
    },
    coldAuthorAnswer: {
      findMany: async (args: RecordedCall["args"]) => {
        const where = args.where ?? {};
        if (where.consentBenchmark === true) {
          rec("gold", args);
          return [
            {
              promptId: "P1",
              answerText: "Omi",
              annotatorId: "annA",
              createdAt: t(1),
            },
            {
              promptId: "P1",
              answerText: "Omi",
              annotatorId: "annA",
              createdAt: t(2),
            },
            {
              promptId: "P1",
              answerText: "Ọmi",
              annotatorId: "annB",
              createdAt: t(3),
            },
            {
              promptId: "P2",
              answerText: "Oji",
              annotatorId: "annB",
              createdAt: t(4),
            },
          ];
        }
        if (args.distinct) {
          rec("goldAnnotators", args);
          return [{ annotatorId: "annA" }, { annotatorId: "annB" }];
        }
        // Exemplar resolution by id, for leak detection.
        rec("exemplarById", args);
        return [{ id: "G-LEAK", answerText: "Omi" }];
      },
      count: async (args: RecordedCall["args"]) => {
        rec("gold.count", args);
        return 4;
      },
    },
    modelOutput: {
      findMany: async (args: RecordedCall["args"]) => {
        rec("modelOutput", args);
        const plain = {
          name: "Plain GPT",
          kind: "baseline",
          versionLabel: null,
          archived: false,
        };
        const ragV2 = {
          name: "GPT + RAG v2",
          kind: "rag",
          versionLabel: "rag-v2",
          archived: false,
        };
        const archived = {
          name: "Old broken",
          kind: "sft",
          versionLabel: null,
          archived: true,
        };
        return [
          {
            promptId: "P1",
            outputText: "ámẹ́",
            ragContextIds: [],
            candidateModel: plain,
          },
          {
            promptId: "P2",
            outputText: "úchu",
            ragContextIds: [],
            candidateModel: plain,
          },
          {
            promptId: "P1",
            outputText: "Omi",
            ragContextIds: ["gold:G-LEAK"],
            candidateModel: ragV2,
          },
          {
            promptId: "P2",
            outputText: "Oji",
            ragContextIds: ["lex:L1"],
            candidateModel: ragV2,
          },
          {
            promptId: "P2",
            outputText: "Oji",
            ragContextIds: [],
            candidateModel: archived,
          },
        ];
      },
    },
    pairwiseComparison: {
      count: async (args: RecordedCall["args"]) => {
        rec("pairwise.count", args);
        const where = args.where ?? {};
        return where.winner === "both_inadequate" ? 6 : 7;
      },
      findMany: async (args: RecordedCall["args"]) => {
        rec("pairwiseAnnotators", args);
        return [{ annotatorId: "annA" }];
      },
    },
    outputEdit: {
      findMany: async (args: RecordedCall["args"]) => {
        rec("editAnnotators", args);
        return [];
      },
    },
    parallelPair: {
      count: async () => 10,
      findMany: async (args: RecordedCall["args"]) => {
        rec("pairById", args);
        return [];
      },
    },
    lexEntry: {
      count: async () => 5,
      findMany: async (args: RecordedCall["args"]) => {
        rec("lexById", args);
        // Innocuous dictionary line - must NOT trip the leak guard for P2.
        return [{ id: "L1", headword: "Ẹga", gloss: "bird" }];
      },
    },
    ragEntry: {
      findMany: async (args: RecordedCall["args"]) => {
        rec("ragById", args);
        return [];
      },
    },
  } as unknown as PrismaClient;
}

async function run() {
  const calls: RecordedCall[] = [];
  const metrics = await computeMethodMetrics(fakePrisma(calls));
  return { calls, metrics };
}

describe("computeMethodMetrics - what the queries enforce", () => {
  it("reads benchmark gold with consent enforced in the WHERE clause", async () => {
    const { calls } = await run();
    const gold = calls.find((c) => c.model === "gold");
    expect(gold).toBeDefined();
    expect(gold!.args.where?.consentBenchmark).toBe(true);
    expect(gold!.args.where?.isDemo).toBe(false);
  });

  it("scores only frozen igala prompts", async () => {
    const { calls } = await run();
    const prompt = calls.find((c) => c.model === "prompt");
    expect(prompt!.args.where?.isHoldout).toBe(true);
    expect(prompt!.args.where?.language).toBe("igala");
  });

  it("excludes @test.com seed accounts from every annotator-count query", async () => {
    const { calls } = await run();
    for (const model of [
      "pairwiseAnnotators",
      "goldAnnotators",
      "editAnnotators",
    ]) {
      const call = calls.find((c) => c.model === model);
      expect(call, `${model} query missing`).toBeDefined();
      expect(call!.args.where?.annotator).toEqual({
        email: { not: { endsWith: "@test.com" } },
      });
      expect(call!.args.where?.isDemo).toBe(false);
    }
  });
});

describe("computeMethodMetrics - corpus and benchmark shape", () => {
  it("returns live corpus counts and a deduplicated annotator count", async () => {
    const { metrics } = await run();
    expect(metrics.corpus).toMatchObject({
      goldAnswers: 4,
      pairwiseComparisons: 7,
      pairwiseBothInadequate: 6,
      parallelPairs: 10,
      lexEntries: 5,
      // annA appears in two signal types; the union counts people, not rows.
      annotators: 2,
    });
  });

  it("derives the leak-free subset from the served context, mechanically", async () => {
    const { metrics } = await run();
    // P1 was served its own gold ("Omi" via exemplar G-LEAK); P2 was served
    // only an unrelated dictionary line.
    expect(metrics.benchmark).toEqual({
      frozenPrompts: 2,
      promptsWithGold: 2,
      leakedPrompts: 1,
      leakFreePrompts: 1,
    });
  });
});

describe("computeMethodMetrics - scoreboard", () => {
  it("scores stripped chrF on all prompts and on the leak-free subset", async () => {
    const { metrics } = await run();
    const ragV2 = metrics.candidates.find((c) => c.name === "GPT + RAG v2")!;
    expect(ragV2.approach).toBe("retrieval v2");
    expect(ragV2.n).toBe(2);
    expect(ragV2.nClean).toBe(1);
    // Exact matches on both prompts -> 100 both ways.
    expect(ragV2.strippedChrfAll).toBeCloseTo(100, 6);
    expect(ragV2.strippedChrfClean).toBeCloseTo(100, 6);

    const plain = metrics.candidates.find((c) => c.name === "Plain GPT")!;
    expect(plain.approach).toBe("untouched");
    expect(plain.n).toBe(2);
    expect(plain.nClean).toBe(1);
    expect(plain.strippedChrfAll).toBeLessThan(50);
  });

  it("sorts by leak-free score and never lists archived candidates", async () => {
    const { metrics } = await run();
    expect(metrics.candidates.map((c) => c.name)).toEqual([
      "GPT + RAG v2",
      "Plain GPT",
    ]);
    expect(
      metrics.candidates.find((c) => c.name === "Old broken"),
    ).toBeUndefined();
  });
});

describe("computeMethodMetrics - the two ceilings", () => {
  it("dedup lowers the ceiling when one annotator repeated themselves", async () => {
    const { metrics } = await run();
    const shipped = metrics.ceilings.asShipped;
    const honest = metrics.ceilings.onePerAnnotator;

    // Only P1 has >= 2 golds either way.
    expect(shipped.nPromptsAll).toBe(1);
    expect(honest.nPromptsAll).toBe(1);

    // As shipped, annA's exact repeat of "Omi" scores 100 against itself in
    // two of three leave-one-out draws; with one answer per annotator the
    // only comparison left is Omi vs Ọmi. The inflation must be visible.
    expect(shipped.chrfAll).not.toBeNull();
    expect(honest.chrfAll).not.toBeNull();
    expect(honest.chrfAll!).toBeLessThan(shipped.chrfAll!);
    expect(shipped.chrfAll!).toBeGreaterThan(66);
    expect(honest.chrfAll!).toBeLessThan(100);

    // P1 leaked, so neither ceiling has a leak-free prompt to stand on.
    expect(shipped.nPromptsClean).toBe(0);
    expect(shipped.chrfClean).toBeNull();
  });
});

describe("pure helpers", () => {
  it("approachLabel maps candidate metadata to the four public labels", () => {
    expect(approachLabel("baseline", null)).toBe("untouched");
    expect(approachLabel("rag", null)).toBe("retrieval v1");
    expect(approachLabel("rag", "rag-v2")).toBe("retrieval v2");
    expect(approachLabel("sft", null)).toBe("fine-tuned");
    expect(approachLabel("dpo", null)).toBe("fine-tuned");
    expect(approachLabel("continued_pretrain", null)).toBe("other");
  });

  it("onePerAnnotator keeps each person's FIRST answer per prompt", () => {
    const rows: GoldRow[] = [
      {
        promptSlug: "p",
        annotatorId: "a",
        answerText: "second",
        createdAt: new Date(2026, 0, 2),
      },
      {
        promptSlug: "p",
        annotatorId: "a",
        answerText: "first",
        createdAt: new Date(2026, 0, 1),
      },
      {
        promptSlug: "p",
        annotatorId: "b",
        answerText: "other",
        createdAt: new Date(2026, 0, 3),
      },
      {
        promptSlug: "q",
        annotatorId: "a",
        answerText: "kept",
        createdAt: new Date(2026, 0, 4),
      },
    ];
    expect(onePerAnnotator(rows).map((r) => r.answerText)).toEqual([
      "first",
      "other",
      "kept",
    ]);
  });

  it("looCeilingChrf skips prompts with fewer than two golds", () => {
    const single = looCeilingChrf(new Map([["p", ["Omi"]]]));
    expect(single).toEqual({ mean: null, nPrompts: 0 });

    const identical = looCeilingChrf(new Map([["p", ["Omi", "Omi"]]]));
    expect(identical.nPrompts).toBe(1);
    expect(identical.mean).toBeCloseTo(100, 6);
  });

  it("splitServedIds separates the four served-id families", () => {
    expect(
      splitServedIds(["gold:g1", "lex:l1", "pp:x1", "bare-rag-id"]),
    ).toEqual({
      ragEntryIds: ["bare-rag-id"],
      goldIds: ["g1"],
      lexIds: ["l1"],
      pairIds: ["x1"],
    });
  });
});
