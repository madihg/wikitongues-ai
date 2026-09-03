import type {
  Approach,
  CeilingResult,
  MethodMetrics,
} from "@/lib/method-metrics";

/**
 * PUBLIC, AGGREGATE-ONLY projection of MethodMetrics.
 *
 * This module shapes the payload served by GET /api/public/method-metrics,
 * which is UNAUTHENTICATED and consumed by the public marketing site's
 * How-it-works story. Same boundary rule as public-stats.ts: counts, rates
 * and scores only - never names, emails, raw Igala answers, a frozen prompt's
 * text, or any gold answer string. The Igala corpus is the community's asset;
 * only numbers about it leave this boundary. Candidate model names and
 * approach labels are already public on the site's sample leaderboard, so
 * they are the only strings this payload carries besides timestamps.
 *
 * The mapping is deliberately field-by-field - NEVER a spread of the source
 * object - so a future private field added to MethodMetrics cannot silently
 * ride across the public boundary. The projection is a pure function so it
 * can be unit-tested without a DB, and the test suite serializes the whole
 * payload and runs it through the leak guard's checkStatic against the
 * protected gold set.
 *
 * The numbers themselves must come from computeMethodMetrics (the page's
 * single source of figures) - this module only projects and rounds, it never
 * computes a metric of its own.
 *
 * `scoring` (tasks/project-audit-2026-09-01.md, option (c), item 8) names
 * the construction so a consumer parsing this payload cold - a script, a
 * future maintainer, the marketing repo - can tell WHICH construction
 * `agreementScore` is without re-deriving it from the numbers. Bump `version`
 * whenever the construction changes again; never reuse a version number for a
 * different formula.
 */

/** Same shape as CeilingResult; re-declared so the public surface is spelled
 * out in this file and pinned by its own tests. */
export interface PublicCeiling {
  chrfAll: number | null;
  chrfClean: number | null;
  nPromptsAll: number;
  nPromptsClean: number;
}

/** One public scoreboard row. Everything here is a label, a count, a score,
 * or a flag - no per-prompt or per-answer content. */
export interface PublicCandidate {
  name: string;
  approach: Approach;
  n: number;
  nClean: number;
  nLikeForLike: number;
  emptyOutputs: number;
  strippedChrfAll: number | null;
  strippedChrfClean: number | null;
  /** Like-for-like construction (finding 2) - see the module doc. */
  agreementScore: number | null;
  agreementCiLow: number | null;
  agreementCiHigh: number | null;
  agreementUnderpowered: boolean;
  /** DEPRECATED - the pre-2026-09-03 construction. See
   * method-metrics.ts's module doc for why it was retired. Kept for one
   * release so nothing mid-transition loses its number outright. */
  agreementScoreLegacy: number | null;
  speakerRank: number | null;
  speakerRankCiLow: number | null;
  speakerRankCiHigh: number | null;
  speakerRankUnderpowered: boolean;
  agreementScoreToneInsensitive: number | null;
  strippedChrfCleanToneInsensitive: number | null;
  agreementScoreSourcefree: number | null;
}

export interface PublicMethodMetrics {
  computedAt: string;
  /** Names the score construction so a cold reader of this payload never has
   * to re-derive it from the numbers. */
  scoring: {
    construction: "like-for-like-loo";
    version: 2;
  };
  corpus: {
    goldAnswers: number;
    pairwiseComparisons: number;
    pairwiseBothInadequate: number;
    parallelPairs: number;
    lexEntries: number;
    /** Count only - never any identifying information. */
    annotators: number;
  };
  benchmark: {
    frozenPrompts: number;
    promptsWithGold: number;
    leakedPrompts: number;
    leakFreePrompts: number;
  };
  ceilings: {
    asShipped: PublicCeiling;
    onePerAnnotator: PublicCeiling;
  };
  /** The chrF value that anchors Community Agreement Score 100. */
  agreementCeilingChrf: number | null;
  /** Leak-free prompts with >= 2 distinct real speakers - the prompt set
   * agreementScore (and its tone-insensitive column) is computed on. */
  likeForLikePrompts: number;
  agreementCeilingChrfToneInsensitive: number | null;
  /** Prompts qualifying for the sourcefree-sensitivity column (finding 7). */
  nSourcefreePrompts: number;
  agreementCeilingChrfSourcefree: number | null;
  /** Preference judgments where BOTH sides are current pairing-pool arms -
   * the split the pivot decision is checkpointed on. */
  poolPreference: {
    poolComparisons: number;
    poolBothInadequate: number;
    /** Winner "a" or "b" picked - ties and both-inadequate excluded. */
    poolDecided: number;
    /** 0..1, rounded to 4 decimals. 0 when there are no pool judgments yet. */
    poolBothInadequateRate: number;
  };
  /** Sorted by leak-free score, best first - the order MethodMetrics ships. */
  candidates: PublicCandidate[];
}

/** Round to a fixed number of decimals without floating-point drift in output.
 * Same helper as public-stats.ts. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** chrF-scale values ship with one decimal - display precision, nothing more. */
function score(value: number | null): number | null {
  return value === null ? null : round(value, 1);
}

function ceiling(c: CeilingResult): PublicCeiling {
  return {
    chrfAll: score(c.chrfAll),
    chrfClean: score(c.chrfClean),
    nPromptsAll: c.nPromptsAll,
    nPromptsClean: c.nPromptsClean,
  };
}

/** Project full MethodMetrics onto the public payload. Pure. */
export function toPublicMethodMetrics(m: MethodMetrics): PublicMethodMetrics {
  return {
    computedAt: m.computedAt,
    scoring: { construction: "like-for-like-loo", version: 2 },
    corpus: {
      goldAnswers: m.corpus.goldAnswers,
      pairwiseComparisons: m.corpus.pairwiseComparisons,
      pairwiseBothInadequate: m.corpus.pairwiseBothInadequate,
      parallelPairs: m.corpus.parallelPairs,
      lexEntries: m.corpus.lexEntries,
      annotators: m.corpus.annotators,
    },
    benchmark: {
      frozenPrompts: m.benchmark.frozenPrompts,
      promptsWithGold: m.benchmark.promptsWithGold,
      leakedPrompts: m.benchmark.leakedPrompts,
      leakFreePrompts: m.benchmark.leakFreePrompts,
    },
    ceilings: {
      asShipped: ceiling(m.ceilings.asShipped),
      onePerAnnotator: ceiling(m.ceilings.onePerAnnotator),
    },
    agreementCeilingChrf: score(m.agreementCeilingChrf),
    likeForLikePrompts: m.likeForLikePrompts,
    agreementCeilingChrfToneInsensitive: score(
      m.agreementCeilingChrfToneInsensitive,
    ),
    nSourcefreePrompts: m.nSourcefreePrompts,
    agreementCeilingChrfSourcefree: score(m.agreementCeilingChrfSourcefree),
    poolPreference: {
      poolComparisons: m.corpus.poolComparisons,
      poolBothInadequate: m.corpus.poolBothInadequate,
      poolDecided: m.corpus.poolDecided,
      poolBothInadequateRate:
        m.corpus.poolComparisons > 0
          ? round(m.corpus.poolBothInadequate / m.corpus.poolComparisons, 4)
          : 0,
    },
    candidates: m.candidates.map((c) => ({
      name: c.name,
      approach: c.approach,
      n: c.n,
      nClean: c.nClean,
      nLikeForLike: c.nLikeForLike,
      emptyOutputs: c.emptyOutputs,
      strippedChrfAll: score(c.strippedChrfAll),
      strippedChrfClean: score(c.strippedChrfClean),
      agreementScore: score(c.agreementScore),
      agreementCiLow: score(c.agreementCiLow),
      agreementCiHigh: score(c.agreementCiHigh),
      agreementUnderpowered: c.agreementUnderpowered,
      agreementScoreLegacy: score(c.agreementScoreLegacy),
      speakerRank: score(c.speakerRank),
      speakerRankCiLow: score(c.speakerRankCiLow),
      speakerRankCiHigh: score(c.speakerRankCiHigh),
      speakerRankUnderpowered: c.speakerRankUnderpowered,
      agreementScoreToneInsensitive: score(c.agreementScoreToneInsensitive),
      strippedChrfCleanToneInsensitive: score(
        c.strippedChrfCleanToneInsensitive,
      ),
      agreementScoreSourcefree: score(c.agreementScoreSourcefree),
    })),
  };
}
