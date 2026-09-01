import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  approachLabel,
  computeMethodMetrics,
  looCeilingChrf,
  onePerAnnotator,
  splitServedIds,
  toAgreementScore,
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
function fakePrisma(
  calls: RecordedCall[],
  { leakP1 = true }: { leakP1?: boolean } = {},
): PrismaClient {
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
            // With leakP1 off, P1 is served only an innocuous dictionary
            // line, so BOTH prompts land in the leak-free subset.
            ragContextIds: leakP1 ? ["gold:G-LEAK"] : ["lex:L1"],
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
        // Pool-scoped counts (both sides must be pool arms) are the pivot's
        // checkpoint metric - the fixture keeps them strictly smaller than
        // the corpus-wide counts so a query that dropped the pool filter
        // would be caught by the numbers, not just the recorded WHERE.
        if (where.modelOutputA) {
          if (where.winner === "both_inadequate") return 1;
          // Decided wins: winner in ["a","b"]. 1 + 1 < 3, so one pool
          // comparison is a tie - deriving decided by subtraction instead of
          // querying it would be caught here.
          if (where.winner) return 1;
          return 3;
        }
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
      poolComparisons: 3,
      poolBothInadequate: 1,
      poolDecided: 1,
      parallelPairs: 10,
      lexEntries: 5,
      // annA appears in two signal types; the union counts people, not rows.
      annotators: 2,
    });
  });

  it("scopes the pool counts to comparisons where BOTH sides are pool arms", async () => {
    const { calls } = await run();
    const poolCounts = calls.filter(
      (c) => c.model === "pairwise.count" && c.args.where?.modelOutputA,
    );
    expect(poolCounts).toHaveLength(3);
    for (const call of poolCounts) {
      expect(call.args.where?.isDemo).toBe(false);
      expect(call.args.where?.modelOutputA).toEqual({
        candidateModel: { inPairingPool: true },
      });
      expect(call.args.where?.modelOutputB).toEqual({
        candidateModel: { inPairingPool: true },
      });
    }
    expect(
      poolCounts.filter((c) => c.args.where?.winner === "both_inadequate"),
    ).toHaveLength(1);
    // Decided wins must be an explicit winner-in-["a","b"] query, so ties can
    // never be counted as decided.
    expect(
      poolCounts.filter(
        (c) =>
          JSON.stringify(c.args.where?.winner) ===
          JSON.stringify({ in: ["a", "b"] }),
      ),
    ).toHaveLength(1);
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

describe("computeMethodMetrics - Community Agreement Score", () => {
  it("is null for every candidate when the clean ceiling cannot exist", async () => {
    // Default fixture: P1 leaks, so the leak-free subset is P2 alone - and P2
    // has a single gold, so there is no inter-speaker ceiling to normalize
    // against. Honest degradation: no ceiling, no score, never a made-up one.
    const { metrics } = await run();
    expect(metrics.agreementCeilingChrf).toBeNull();
    for (const c of metrics.candidates) {
      expect(c.agreementScore).toBeNull();
      expect(c.agreementCiLow).toBeNull();
      expect(c.agreementCiHigh).toBeNull();
    }
  });

  it("anchors 100 to the dedup leak-free ceiling and does NOT cap above it", async () => {
    const calls: RecordedCall[] = [];
    const metrics = await computeMethodMetrics(
      fakePrisma(calls, { leakP1: false }),
    );

    // No leaks -> both prompts are clean; the dedup ceiling on the clean
    // subset is P1's Omi-vs-Ọmi leave-one-out chrF, strictly below 100.
    expect(metrics.benchmark.leakFreePrompts).toBe(2);
    const ceiling = metrics.agreementCeilingChrf;
    expect(ceiling).not.toBeNull();
    expect(ceiling!).toBeGreaterThan(0);
    expect(ceiling!).toBeLessThan(100);
    expect(ceiling).toBe(metrics.ceilings.onePerAnnotator.chrfClean);

    // RAG v2 matched the community exactly on both clean prompts (chrF 100),
    // which is CLOSER to the community than one speaker is to another - so
    // its score must exceed 100, uncapped, exactly (100 / ceiling) * 100.
    const ragV2 = metrics.candidates.find((c) => c.name === "GPT + RAG v2")!;
    expect(ragV2.strippedChrfClean).toBeCloseTo(100, 6);
    expect(ragV2.agreementScore).toBeGreaterThan(100);
    expect(ragV2.agreementScore).toBeCloseTo((100 / ceiling!) * 100, 6);

    // Plain GPT is far below the ceiling.
    const plain = metrics.candidates.find((c) => c.name === "Plain GPT")!;
    expect(plain.agreementScore).not.toBeNull();
    expect(plain.agreementScore!).toBeLessThan(ragV2.agreementScore!);

    // nClean = 2 < MIN_BOOTSTRAP_N: the CI must be flagged degenerate, and
    // its bounds collapse onto the point estimate rather than pretending.
    expect(ragV2.agreementUnderpowered).toBe(true);
    expect(ragV2.agreementCiLow).toBeCloseTo(ragV2.agreementScore!, 6);
    expect(ragV2.agreementCiHigh).toBeCloseTo(ragV2.agreementScore!, 6);
  });
});

describe("pure helpers", () => {
  it("toAgreementScore renormalizes chrF so the ceiling reads 100, uncapped", () => {
    expect(toAgreementScore(null, 46)).toBeNull();
    expect(toAgreementScore(40, null)).toBeNull();
    expect(toAgreementScore(40, 0)).toBeNull(); // no divide-by-zero score
    expect(toAgreementScore(23, 46)).toBeCloseTo(50, 9);
    expect(toAgreementScore(46, 46)).toBeCloseTo(100, 9);
    // Above the ceiling stays above 100 - never silently clamped.
    expect(toAgreementScore(55.2, 46)).toBeCloseTo(120, 9);
  });

  it("approachLabel maps candidate metadata to the public labels", () => {
    expect(approachLabel("baseline", null)).toBe("untouched");
    expect(approachLabel("rag", null)).toBe("retrieval v1");
    expect(approachLabel("rag", "rag-v2")).toBe("retrieval v2");
    expect(approachLabel("rag", "rag-v3")).toBe("retrieval v3");
    expect(approachLabel("rag", "rag-v4")).toBe("retrieval v4");
    expect(approachLabel("rag", "rag-v4-1")).toBe("retrieval v4.1");
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
