import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  approachLabel,
  computeMethodMetrics,
  leaveOneOutMeanChrf,
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
              provenance: "speaker_authored_sourcefree",
            },
            {
              promptId: "P1",
              answerText: "Omi",
              annotatorId: "annA",
              createdAt: t(2),
              provenance: "speaker_authored_sourcefree",
            },
            {
              promptId: "P1",
              answerText: "Ọmi",
              annotatorId: "annB",
              createdAt: t(3),
              provenance: "speaker_authored_sourcefree",
            },
            {
              promptId: "P2",
              answerText: "Oji",
              annotatorId: "annB",
              createdAt: t(4),
              provenance: "speaker_authored_sourcefree",
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
        if (args.distinct) {
          rec("editAnnotators", args);
          return [];
        }
        // Correction resolution by id, for edit: leak detection (finding 18)
        // - empty in this fixture, no output serves an edit: id.
        rec("editById", args);
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

  it("excludes @test.com seed accounts from the benchmark gold query itself (finding 24)", async () => {
    // Not just the annotator COUNT - the gold used for scoring and the
    // ceiling must never include a seed account's answer.
    const { calls } = await run();
    const gold = calls.find((c) => c.model === "gold");
    expect(gold!.args.where?.annotator).toEqual({
      email: { not: { endsWith: "@test.com" } },
    });
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
      expect(call.args.where?.annotator).toEqual({
        email: { not: { endsWith: "@test.com" } },
      });
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

  it("applies REAL_CONTRIBUTOR to the corpus-wide gold and comparison counts too (finding 24)", async () => {
    // Not just the pool-scoped counts - the corpus-wide pairwiseComparisons/
    // pairwiseBothInadequate/goldAnswers counts must agree with
    // computeAnnotationInsights, which already excludes seed rows.
    const { calls } = await run();
    const corpusCounts = calls.filter(
      (c) => c.model === "pairwise.count" && !c.args.where?.modelOutputA,
    );
    expect(corpusCounts.length).toBeGreaterThan(0);
    for (const call of corpusCounts) {
      expect(call.args.where?.annotator).toEqual({
        email: { not: { endsWith: "@test.com" } },
      });
    }
    const goldCount = calls.find((c) => c.model === "gold.count");
    expect(goldCount!.args.where?.annotator).toEqual({
      email: { not: { endsWith: "@test.com" } },
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

describe("computeMethodMetrics - legacy Community Agreement Score (deprecated)", () => {
  // agreementScoreLegacy is the pre-2026-09-03 construction: best chrF over
  // EVERY consented gold, expressed against the dedup leak-free ceiling. Kept
  // for one release - see method-metrics.ts's module doc. The NEW
  // like-for-like agreementScore/speakerRank are covered in their own
  // describe block below, with a fixture built for exact, hand-checkable
  // values.
  it("is null for every candidate when the clean ceiling cannot exist", async () => {
    // Default fixture: P1 leaks, so the leak-free subset is P2 alone - and P2
    // has a single gold, so there is no inter-speaker ceiling to normalize
    // against. Honest degradation: no ceiling, no score, never a made-up one.
    const { metrics } = await run();
    expect(metrics.agreementCeilingChrf).toBeNull();
    for (const c of metrics.candidates) {
      expect(c.agreementScoreLegacy).toBeNull();
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
    // its LEGACY score must exceed 100, uncapped, exactly (100/ceiling)*100.
    // This is exactly the construction finding 2 retired: the model was
    // scored against BOTH P1 golds (2 references) while the ceiling only
    // ever compares a speaker to their 1 peer.
    const ragV2 = metrics.candidates.find((c) => c.name === "GPT + RAG v2")!;
    expect(ragV2.strippedChrfClean).toBeCloseTo(100, 6);
    expect(ragV2.agreementScoreLegacy).toBeGreaterThan(100);
    expect(ragV2.agreementScoreLegacy).toBeCloseTo((100 / ceiling!) * 100, 6);

    // Plain GPT is far below the ceiling.
    const plain = metrics.candidates.find((c) => c.name === "Plain GPT")!;
    expect(plain.agreementScoreLegacy).not.toBeNull();
    expect(plain.agreementScoreLegacy!).toBeLessThan(
      ragV2.agreementScoreLegacy!,
    );
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
        provenance: "speaker_authored_sourcefree",
      },
      {
        promptSlug: "p",
        annotatorId: "a",
        answerText: "first",
        createdAt: new Date(2026, 0, 1),
        provenance: "speaker_authored_sourcefree",
      },
      {
        promptSlug: "p",
        annotatorId: "b",
        answerText: "other",
        createdAt: new Date(2026, 0, 3),
        provenance: "speaker_authored_sourcefree",
      },
      {
        promptSlug: "q",
        annotatorId: "a",
        answerText: "kept",
        createdAt: new Date(2026, 0, 4),
        provenance: "speaker_authored_sourcefree",
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

  it("leaveOneOutMeanChrf: exact match against every reference -> 100 regardless of which is held out", () => {
    // chrF of a string against itself is exactly 1.0 (100) at every character
    // order that has any n-grams at all - see chrf.ts's module doc. With two
    // IDENTICAL references, holding either one out still leaves an exact
    // match, so every draw is exactly 100 and the mean is exactly 100.
    expect(leaveOneOutMeanChrf("Omi", ["Omi", "Omi"])).toBeCloseTo(100, 9);
  });

  it("leaveOneOutMeanChrf: zero character overlap with every reference -> 0", () => {
    // "kkk" shares no character with "Omi" or "xyz" at any order, so
    // precision and recall are both 0 at every effective order - chrF is
    // exactly 0, on both draws, mean exactly 0.
    expect(leaveOneOutMeanChrf("kkk", ["Omi", "xyz"])).toBeCloseTo(0, 9);
  });

  it("splitServedIds separates the five served-id families, including edit: (finding 18)", () => {
    expect(
      splitServedIds(["gold:g1", "lex:l1", "pp:x1", "edit:e1", "bare-rag-id"]),
    ).toEqual({
      ragEntryIds: ["bare-rag-id"],
      goldIds: ["g1"],
      lexIds: ["l1"],
      pairIds: ["x1"],
      editIds: ["e1"],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LIKE-FOR-LIKE, SPEAKER-RANK, TONE-INSENSITIVE, SOURCEFREE (option (c),
// findings 1/2/3/4/7/11/24) - hand-computed fixtures.
//
// A generic, minimal prisma fake: promptId doubles as the cuid (no separate
// slug mapping needed), a gold row's `seed: true` simulates an @test.com
// annotator (excluded by REAL_CONTRIBUTOR at the query, so it never reaches
// the returned rows - exercising the ACTUAL exclusion, not just the WHERE
// clause shape already pinned above).
// ─────────────────────────────────────────────────────────────────────────

interface WorldGold {
  promptId: string;
  answerText: string;
  annotatorId: string;
  createdAt: Date;
  provenance?: string;
  seed?: boolean;
}

interface WorldOutput {
  promptId: string;
  outputText: string;
  ragContextIds?: string[];
  candidateModel: {
    name: string;
    kind: string;
    versionLabel: string | null;
    archived: boolean;
  };
}

interface WorldLex {
  id: string;
  headword: string;
  gloss: string;
}

interface WorldEdit {
  id: string;
  originalText: string;
  correctedText: string;
  rationale: string | null;
  segments: unknown;
}

function buildWorld(opts: {
  golds: WorldGold[];
  outputs: WorldOutput[];
  lex?: WorldLex[];
  edits?: WorldEdit[];
}): PrismaClient {
  const promptIds = new Set<string>([
    ...opts.golds.map((g) => g.promptId),
    ...opts.outputs.map((o) => o.promptId),
  ]);
  const frozen = [...promptIds].map((p) => ({ id: p, promptId: p }));
  const realGolds = opts.golds.filter((g) => !g.seed);

  const idsIn = (args: RecordedCall["args"]): string[] =>
    (args.where?.id as { in?: string[] } | undefined)?.in ?? [];

  return {
    prompt: { findMany: async () => frozen },
    coldAuthorAnswer: {
      findMany: async (args: RecordedCall["args"]) => {
        const where = args.where ?? {};
        if (where.consentBenchmark === true) {
          return realGolds.map((g) => ({
            promptId: g.promptId,
            answerText: g.answerText,
            annotatorId: g.annotatorId,
            createdAt: g.createdAt,
            provenance: g.provenance ?? "speaker_authored_sourcefree",
          }));
        }
        if (args.distinct) {
          const seen = new Set<string>();
          const out: { annotatorId: string }[] = [];
          for (const g of realGolds) {
            if (seen.has(g.annotatorId)) continue;
            seen.add(g.annotatorId);
            out.push({ annotatorId: g.annotatorId });
          }
          return out;
        }
        // gold: exemplar resolution - unused by the fixtures below, which
        // never serve gold: context.
        return [];
      },
      count: async () => realGolds.length,
    },
    modelOutput: {
      findMany: async () =>
        opts.outputs.map((o) => ({
          ...o,
          ragContextIds: o.ragContextIds ?? [],
        })),
    },
    pairwiseComparison: {
      count: async () => 0,
      findMany: async () => [],
    },
    outputEdit: {
      findMany: async (args: RecordedCall["args"]) => {
        if (args.distinct) return [];
        const ids = new Set(idsIn(args));
        return (opts.edits ?? []).filter((e) => ids.has(e.id));
      },
    },
    parallelPair: {
      count: async () => 0,
      findMany: async () => [],
    },
    lexEntry: {
      count: async () => (opts.lex ?? []).length,
      findMany: async (args: RecordedCall["args"]) => {
        const ids = new Set(idsIn(args));
        return (opts.lex ?? []).filter((l) => ids.has(l.id));
      },
    },
    ragEntry: { findMany: async () => [] },
  } as unknown as PrismaClient;
}

const t0 = new Date(2026, 1, 1);

describe("computeMethodMetrics - like-for-like agreementScore and speakerRank (findings 1, 2)", () => {
  // Prompt "P", 3 DISTINCT real speakers: two agree exactly ("Omi"), one
  // disagrees entirely ("xyz" - no character overlap with "Omi" at all, so
  // chrF between them is exactly 0; chrF of a string against itself is
  // exactly 100 - see chrf.ts's module doc). That gives an exactly
  // hand-computable ceiling and per-candidate score with no partial-match
  // arithmetic:
  //
  //   speaker LOO draws  = [chrf(Omi,[Omi,xyz]), chrf(Omi,[Omi,xyz]), chrf(xyz,[Omi,Omi])]
  //                      = [100, 100, 0]  ->  ceiling = 200/3 = 66.667
  //
  //   Model A hyp="xyz": draws [chrf(xyz,[Omi,xyz]), chrf(xyz,[Omi,xyz]), chrf(xyz,[Omi,Omi])]
  //                    = [100, 100, 0] -> M = 66.667 -> agreementScore = 66.667/66.667*100 = 100
  //                    speakerRank: M(66.667) >= [100,100,0]? only the third -> share 1/3 = 33.33
  //   Model B hyp="kkk" (shares no character with Omi OR xyz): every draw = 0
  //                    -> M = 0 -> agreementScore = 0
  //                    speakerRank: 0 >= [100,100,0]? only the third (tie) -> 1/3 = 33.33
  //   Model C hyp="Omi": every draw = 100 (an exact match survives in every
  //                    2-of-3 reference subset) -> M = 100
  //                    -> agreementScore = 100/66.667*100 = 150 (> 100, BY MEASUREMENT:
  //                       the model matches the majority pattern better than one
  //                       speaker matches the others - not a reference-count trick,
  //                       every construction here uses exactly k-1 references)
  //                    speakerRank: 100 >= [100,100,0] on all three (two ties, one
  //                       beat) -> share 3/3 = 100 - the speakerRank UPPER bound.
  const golds: WorldGold[] = [
    { promptId: "P", answerText: "Omi", annotatorId: "ann1", createdAt: t0 },
    { promptId: "P", answerText: "Omi", annotatorId: "ann2", createdAt: t0 },
    { promptId: "P", answerText: "xyz", annotatorId: "ann3", createdAt: t0 },
  ];
  const cand = (name: string, outputText: string) => ({
    promptId: "P",
    outputText,
    candidateModel: {
      name,
      kind: "rag",
      versionLabel: "rag-v4",
      archived: false,
    },
  });
  const outputs: WorldOutput[] = [
    cand("Model A", "xyz"),
    cand("Model B", "kkk"),
    cand("Model C", "Omi"),
  ];

  async function metrics() {
    return computeMethodMetrics(buildWorld({ golds, outputs }));
  }

  it("qualifies the prompt (>= 2 distinct real speakers, leak-free) and anchors the ceiling at 200/3", async () => {
    const m = await metrics();
    expect(m.likeForLikePrompts).toBe(1);
    expect(m.agreementCeilingChrf).toBeCloseTo(200 / 3, 6);
  });

  it("Model A: matches the outlier speaker exactly -> agreementScore ~100, speakerRank ~33.3", async () => {
    const m = await metrics();
    const a = m.candidates.find((c) => c.name === "Model A")!;
    expect(a.nLikeForLike).toBe(1);
    expect(a.agreementScore).toBeCloseTo(100, 4);
    expect(a.speakerRank).toBeCloseTo((1 / 3) * 100, 4);
  });

  it("Model B: zero overlap with every speaker -> agreementScore 0, speakerRank ~33.3 (ties the outlier)", async () => {
    const m = await metrics();
    const b = m.candidates.find((c) => c.name === "Model B")!;
    expect(b.agreementScore).toBeCloseTo(0, 6);
    expect(b.speakerRank).toBeCloseTo((1 / 3) * 100, 4);
  });

  it("Model C: matches the majority exactly -> agreementScore 150 (above 100 BY MEASUREMENT), speakerRank 100 (the upper bound)", async () => {
    const m = await metrics();
    const c = m.candidates.find((c) => c.name === "Model C")!;
    expect(c.agreementScore).toBeCloseTo(150, 4);
    expect(c.speakerRank).toBeCloseTo(100, 6);
  });

  it("speakerRank never leaves [0, 100] for any candidate here", async () => {
    const m = await metrics();
    for (const c of m.candidates) {
      if (c.speakerRank === null) continue;
      expect(c.speakerRank).toBeGreaterThanOrEqual(0);
      expect(c.speakerRank).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeMethodMetrics - tone-insensitive column (finding 5)", () => {
  // Two real speakers write the SAME word with two DIFFERENT tone marks
  // (grave vs acute); the model under-marks tone entirely, same pattern the
  // audit found in the v4 -> v4.1 gain. stripToneMarks removes tone (dot-below
  // survives), so all three texts become byte-identical "Ọmi" - an EXACT
  // match, chrF exactly 100, at every effective order. Raw chrF cannot reach
  // 100: the model's answer is strictly shorter (3 codepoints) than either
  // reference (4 codepoints - base letter + tone mark), so no reference-set
  // subset can ever contain an n-gram-for-n-gram-identical string.
  const golds: WorldGold[] = [
    {
      promptId: "T",
      answerText: "Ọ̀mi", // Ọ + grave
      annotatorId: "ann1",
      createdAt: t0,
    },
    {
      promptId: "T",
      answerText: "Ọ́mi", // Ọ + acute
      annotatorId: "ann2",
      createdAt: t0,
    },
  ];
  const outputs: WorldOutput[] = [
    {
      promptId: "T",
      outputText: "Ọmi", // no tone mark at all
      candidateModel: {
        name: "Tone-blind model",
        kind: "rag",
        versionLabel: "rag-v4-1",
        archived: false,
      },
    },
  ];

  async function metrics() {
    return computeMethodMetrics(buildWorld({ golds, outputs }));
  }

  it("recomputes the ceiling tone-insensitively, exactly 100", async () => {
    const m = await metrics();
    expect(m.agreementCeilingChrfToneInsensitive).toBeCloseTo(100, 6);
    // The RAW ceiling (tone marks left in) cannot be an exact match.
    expect(m.agreementCeilingChrf).toBeLessThan(100);
  });

  it("the tone-insensitive raw chrF reaches exactly 100 (an exact match); the raw column does not share that value", async () => {
    const m = await metrics();
    const c = m.candidates[0];
    expect(c.strippedChrfCleanToneInsensitive).toBeCloseTo(100, 6);
    expect(c.agreementScoreToneInsensitive).toBeCloseTo(100, 6);
    // The raw (tone-marked) construction cannot be an exact character-for-
    // character match - the model's answer is strictly shorter than either
    // reference - so its own numerator cannot be 100 the way the
    // tone-stripped one is. (The RAW ceiling asserted above already shows
    // this: agreementCeilingChrf < 100 while its tone-insensitive twin is
    // exactly 100.) The raw and tone-insensitive agreementScore need not
    // land on the same side of 100 - both are ratios, and stripping tone
    // moves numerator and denominator together - so this test only pins the
    // exact-match numerator/ceiling facts, not an ordering between the two
    // agreementScore columns.
    expect(c.agreementScoreToneInsensitive).not.toBeCloseTo(
      c.agreementScore!,
      3,
    );
  });
});

describe("computeMethodMetrics - sourcefree sensitivity (finding 7)", () => {
  // Prompt "S": 3 real speakers, but only 2 carry provenance
  // speaker_authored_sourcefree ("Omi" x2); the third ("xyz") is
  // corrected_from_inadequate - written after seeing rejected model output -
  // and must drop out of the sourcefree construction while still counting
  // for the main (provenance-blind) like-for-like construction.
  //
  // Prompt "S2": only ONE sourcefree speaker - must not count toward
  // nSourcefreePrompts at all (finding 7: "fewer than two sourcefree
  // speakers drop out").
  const golds: WorldGold[] = [
    {
      promptId: "S",
      answerText: "Omi",
      annotatorId: "ann1",
      createdAt: t0,
      provenance: "speaker_authored_sourcefree",
    },
    {
      promptId: "S",
      answerText: "Omi",
      annotatorId: "ann2",
      createdAt: t0,
      provenance: "speaker_authored_sourcefree",
    },
    {
      promptId: "S",
      answerText: "xyz",
      annotatorId: "ann3",
      createdAt: t0,
      provenance: "corrected_from_inadequate",
    },
    {
      promptId: "S2",
      answerText: "Aaa",
      annotatorId: "ann4",
      createdAt: t0,
      provenance: "speaker_authored_sourcefree",
    },
    {
      promptId: "S2",
      answerText: "Bbb",
      annotatorId: "ann5",
      createdAt: t0,
      provenance: "corrected_from_inadequate",
    },
  ];
  const outputs: WorldOutput[] = [
    {
      promptId: "S",
      outputText: "Omi",
      candidateModel: {
        name: "Model",
        kind: "rag",
        versionLabel: "rag-v4",
        archived: false,
      },
    },
    {
      promptId: "S2",
      outputText: "Aaa",
      candidateModel: {
        name: "Model",
        kind: "rag",
        versionLabel: "rag-v4",
        archived: false,
      },
    },
  ];

  async function metrics() {
    return computeMethodMetrics(buildWorld({ golds, outputs }));
  }

  it("only S qualifies (S2 has a single sourcefree speaker)", async () => {
    const m = await metrics();
    expect(m.nSourcefreePrompts).toBe(1);
    // Sourcefree ceiling on S: chrf(Omi,[Omi]) twice, exactly 100.
    expect(m.agreementCeilingChrfSourcefree).toBeCloseTo(100, 6);
  });

  it("agreementScoreSourcefree (2 speakers) differs from the main score (3 speakers, includes the non-sourcefree outlier)", async () => {
    const m = await metrics();
    const c = m.candidates[0];
    // Sourcefree-only: hyp="Omi" against 2 identical sourcefree refs -> 100.
    expect(c.agreementScoreSourcefree).toBeCloseTo(100, 6);
    // Main construction on S alone would be 150 (same arithmetic as "Model C"
    // above); S2 also qualifies for the main construction (2 distinct real
    // speakers) and pulls the average, so just assert the two numbers DIFFER
    // rather than re-deriving the blended value by hand.
    expect(c.agreementScore).not.toBeCloseTo(c.agreementScoreSourcefree!, 1);
  });
});

describe("computeMethodMetrics - empty outputs excluded from every score (finding 11)", () => {
  const golds: WorldGold[] = [
    { promptId: "E1", answerText: "Omi", annotatorId: "ann1", createdAt: t0 },
    { promptId: "E1", answerText: "Ọmi", annotatorId: "ann2", createdAt: t0 },
    { promptId: "E2", answerText: "Oji", annotatorId: "ann1", createdAt: t0 },
  ];
  const flaky = {
    name: "Flaky Model",
    kind: "rag",
    versionLabel: "rag-v4",
    archived: false,
  };
  const outputs: WorldOutput[] = [
    // A provider failure persisted as an empty string - must be excluded,
    // never scored as chrF 0, and never a hypothesis for like-for-like.
    { promptId: "E1", outputText: "   ", candidateModel: flaky },
    // A whitespace-only string is "empty after trimming" too.
    { promptId: "E2", outputText: "Oji", candidateModel: flaky },
  ];

  it("counts the empty output separately and excludes it from n, nClean, and nLikeForLike", async () => {
    const m = await computeMethodMetrics(buildWorld({ golds, outputs }));
    const c = m.candidates.find((x) => x.name === "Flaky Model")!;
    expect(c.emptyOutputs).toBe(1);
    // Only E2's real output is scored - E1's empty output never enters n.
    expect(c.n).toBe(1);
    expect(c.nClean).toBe(1);
    expect(c.strippedChrfAll).toBeCloseTo(100, 6);
    // E1 would have qualified for like-for-like (2 distinct real speakers),
    // but the empty output leaves no hypothesis to score there; E2 has only
    // one speaker and never qualifies. Zero qualifying prompts for THIS
    // candidate - agreementScore must be null, not a made-up chrF-0 average.
    expect(c.nLikeForLike).toBe(0);
    expect(c.agreementScore).toBeNull();
  });
});

describe("computeMethodMetrics - seed accounts excluded from gold and ceiling, functionally (finding 24)", () => {
  // Two REAL speakers agree exactly ("Omi" x2, ceiling = 100 exactly); one
  // @test.com seed account contributes a wildly different answer ("xyz") that
  // would drag the ceiling down to 200/3 = 66.667 (the exact "Model C"
  // pattern from the like-for-like fixture above) if it were not excluded.
  // The gap between 100 and 66.667 makes the leak impossible to miss.
  const golds: WorldGold[] = [
    { promptId: "SEED", answerText: "Omi", annotatorId: "ann1", createdAt: t0 },
    { promptId: "SEED", answerText: "Omi", annotatorId: "ann2", createdAt: t0 },
    {
      promptId: "SEED",
      answerText: "xyz",
      annotatorId: "seed-bringup",
      createdAt: t0,
      seed: true,
    },
  ];
  const outputs: WorldOutput[] = [
    {
      promptId: "SEED",
      outputText: "Omi",
      candidateModel: {
        name: "Model",
        kind: "rag",
        versionLabel: "rag-v4",
        archived: false,
      },
    },
  ];

  it("goldAnswers counts 2, not 3, and the ceiling reads 100, not 66.667", async () => {
    const m = await computeMethodMetrics(buildWorld({ golds, outputs }));
    expect(m.corpus.goldAnswers).toBe(2);
    expect(m.agreementCeilingChrf).toBeCloseTo(100, 4);
    expect(m.agreementCeilingChrf).not.toBeCloseTo(200 / 3, 1);
  });
});

describe("computeMethodMetrics - edit: and toOrthography leak-guard fixes wired end to end (findings 18, 19)", () => {
  // Finding 18: an edit: id must resolve to the OutputEdit row and be
  // checked like any other served piece. Finding 19: a lex: id must be
  // checked in its RENDERED (toOrthography) form, not the raw phonemic
  // headword. Both are exercised here through computeMethodMetrics itself,
  // not just the leak-guard unit tests.
  const golds: WorldGold[] = [
    {
      promptId: "PEDIT",
      answerText: "Ọkọ",
      annotatorId: "ann1",
      createdAt: t0,
    },
    {
      promptId: "PLEX",
      answerText: "Ẹga",
      annotatorId: "ann1",
      createdAt: t0,
    },
  ];
  const model = {
    name: "Model",
    kind: "rag",
    versionLabel: "rag-v4",
    archived: false,
  };
  const outputs: WorldOutput[] = [
    {
      promptId: "PEDIT",
      outputText: "x",
      ragContextIds: ["edit:E1"],
      candidateModel: model,
    },
    {
      promptId: "PLEX",
      outputText: "y",
      ragContextIds: ["lex:L1"],
      candidateModel: model,
    },
  ];
  const edits: WorldEdit[] = [
    {
      id: "E1",
      originalText: "wrong",
      correctedText: "the correct word is Ọkọ",
      rationale: null,
      segments: null,
    },
  ];
  // chikhapo-style phonemic headword: ɛga -> toOrthography -> ẹga, which
  // folds to the same string as PLEX's own gold "Ẹga".
  const lex: WorldLex[] = [{ id: "L1", headword: "ɛga", gloss: "bird" }];

  it("both prompts are detected as leaked", async () => {
    const m = await computeMethodMetrics(
      buildWorld({ golds, outputs, edits, lex }),
    );
    expect(m.benchmark.leakedPrompts).toBe(2);
    expect(m.benchmark.leakFreePrompts).toBe(0);
  });
});

describe("derived control arms announce themselves", () => {
  // The tone-removal control outscores every real system on this board. If it
  // ever renders as "retrieval v4" or "untouched", a reader sees a system we
  // built topping the chart, which is the opposite of what the number means.
  it("labels a derived arm as a control regardless of its kind or version", () => {
    expect(approachLabel("rag", "rag-v4", "derived")).toBe(
      "control (tone removed)",
    );
    expect(approachLabel("baseline", null, "derived")).toBe(
      "control (tone removed)",
    );
  });

  it("names the no-repair control instead of dropping it to retrieval v1", () => {
    // Unknown rag version labels fall through to "retrieval v1"; this one is a
    // v4.1 arm and was reaching the public board under the oldest method's name.
    expect(approachLabel("rag", "rag-v4-1-norepair", "google")).toBe(
      "retrieval v4.1 (no repair)",
    );
    expect(approachLabel("rag", "rag-v4-1", "google")).toBe("retrieval v4.1");
  });

  it("leaves every real arm's label untouched", () => {
    expect(approachLabel("rag", "rag-v4-1", "google")).toBe("retrieval v4.1");
    expect(approachLabel("rag", "rag-v4", "openrouter")).toBe("retrieval v4");
    expect(approachLabel("baseline", null, "google")).toBe("untouched");
    expect(approachLabel("sft", null, "openai")).toBe("fine-tuned");
    // and with no provider argument at all, the pre-change behaviour holds
    expect(approachLabel("rag", "rag-v3")).toBe("retrieval v3");
    expect(approachLabel("baseline", null)).toBe("untouched");
  });
});
