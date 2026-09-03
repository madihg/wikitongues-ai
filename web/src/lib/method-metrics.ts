import type { PrismaClient } from "@prisma/client";
import { chrfMulti } from "@/lib/eval/chrf";
import { stripAnswer } from "@/lib/eval/answer-strip";
import { stripToneMarks } from "@/lib/eval/tone";
import { bootstrapMean } from "@/lib/eval/stats";
import {
  buildProtectedSet,
  filterAssembled,
  leakFreePrompts,
  renderLexPieceForGuard,
  renderEditPieceForGuard,
  type LeakHit,
} from "@/lib/eval/leak-guard";
import { correctionReason } from "@/lib/arena/retrieval-v4";

/**
 * Live metrics for the "How it works" page.
 *
 * Everything here is computed from the database AT REQUEST TIME - no cached
 * scores, no hardcoded counts. The project has been burned repeatedly by
 * stale numbers surviving in prose after the data moved, so this module is
 * the page's only source of figures: pure JS over well under 2,000 rows,
 * cheap enough to run per request.
 *
 * The scoring path deliberately composes the SAME pure functions as
 * scripts/leak-audit.ts (chrfMulti, stripAnswer, buildProtectedSet,
 * filterAssembled, leakFreePrompts), so a number on the page and a number in
 * the audit CLI can never come from two implementations of "stripped chrF on
 * the leak-free subset".
 *
 * Prisma is injected so the whole thing is unit-testable with a recorder
 * fake - the same pattern as collectEvalBundle (src/lib/eval/collect.test.ts).
 *
 * LIKE-FOR-LIKE SCORING (tasks/project-audit-2026-09-01.md, finding 2 /
 * option (c)) - READ BEFORE CHANGING agreementScore
 * -----------------------------------------------------------------------
 * The score this module shipped before 2026-09-03 scored a model's answer
 * against EVERY consented benchmark gold (mean 5.56 references per clean
 * prompt) while the 100-line ceiling scored a speaker against only their k-1
 * PEERS (mean 3.11 references) - an asymmetry that pushed the best arm past
 * 100 by construction, not by measurement. `agreementScore` now uses the
 * SAME construction the ceiling uses: for each prompt with >= 2 distinct
 * real, deduplicated speakers, hold out each speaker h in turn and score the
 * model against the k-1 references excluding h, then average over holdouts.
 * That mean-over-holdouts value is comparable prompt-for-prompt with a
 * speaker's own leave-one-out score, so `speakerRank` (0-100 by construction)
 * can ask "what share of real speakers does the model tie or beat". A model
 * CAN still land above 100 - it can still be measurably closer to the
 * community than one speaker is to another - but it can no longer do so
 * merely by being handed more answer keys than the speaker it is compared
 * against.
 *
 * The pre-2026-09-03 construction survives as `agreementScoreLegacy` for one
 * release, so a chart mid-transition (or a saved comparison) does not lose
 * its number outright. Do not build anything new on it: it is the
 * construction finding 2 exists to retire.
 */

// ─── shapes ─────────────────────────────────────────────────────────────────

/** Corpus-wide counts, all excluding demo rows and seed (@test.com) accounts
 * where the underlying row has an annotator. */
export interface CorpusCounts {
  goldAnswers: number;
  pairwiseComparisons: number;
  /** "Both inadequate" verdicts, for the live no-preference rate. */
  pairwiseBothInadequate: number;
  /**
   * Comparisons where BOTH sides are current pairing-pool arms
   * (CandidateModel.inPairingPool) - the pivot's checkpoint denominator.
   * Kept separate because the corpus-wide no-preference rate was measured
   * almost entirely against earlier, weaker arms: quoting it beside the
   * leaders' bars without this split would smear a verdict on old systems
   * onto the current ones (tasks/annotation-pivot-decision.md, section 2).
   */
  poolComparisons: number;
  /** "Both inadequate" verdicts within poolComparisons. */
  poolBothInadequate: number;
  /** Comparisons within poolComparisons where a winner was actually picked
   * (winner "a" or "b" - ties and both-inadequate excluded). Kept as its own
   * count rather than derived by subtraction because "tie" is a real verdict:
   * poolComparisons - poolBothInadequate would silently count ties as wins. */
  poolDecided: number;
  parallelPairs: number;
  lexEntries: number;
  /** Distinct real contributors - seed @test.com accounts excluded, same rule
   * and same reason as GET /api/public/stats. */
  annotators: number;
}

/** The frozen benchmark and what the leak audit says about it. */
export interface BenchmarkShape {
  frozenPrompts: number;
  promptsWithGold: number;
  /** Frozen prompts whose OWN gold appeared in a served context. */
  leakedPrompts: number;
  leakFreePrompts: number;
}

/** One leave-one-out inter-gold ceiling, on all prompts and the clean subset. */
export interface CeilingResult {
  /** Mean chrF x100 across frozen prompts with >= 2 golds; null when none. */
  chrfAll: number | null;
  /** Same, restricted to the leak-free subset. */
  chrfClean: number | null;
  nPromptsAll: number;
  nPromptsClean: number;
}

export type Approach =
  | "untouched"
  | "retrieval v1"
  | "retrieval v2"
  | "retrieval v3"
  | "retrieval v4"
  | "retrieval v4.1"
  | "fine-tuned"
  | "other";

/** One scoreboard row: a non-archived candidate scored both ways. */
export interface CandidateScore {
  name: string;
  approach: Approach;
  /** Outputs scored (frozen prompts with gold), empty outputs excluded. */
  n: number;
  nClean: number;
  /** Prompts contributing to agreementScore/speakerRank: leak-free, >= 2
   * distinct real speakers, and this candidate has a non-empty answer. */
  nLikeForLike: number;
  /** Stored outputs whose text was empty after trimming - excluded from
   * every score below, never scored as chrF 0 (finding 11). */
  emptyOutputs: number;
  /** Stripped chrF x100, all frozen prompts with gold. */
  strippedChrfAll: number | null;
  /** Stripped chrF x100, leak-free subset only - the honest column. */
  strippedChrfClean: number | null;
  /**
   * LIKE-FOR-LIKE AGREEMENT SCORE (finding 2 / option (c)): strippedChrf
   * computed under the SAME leave-one-out construction as the ceiling -
   * expressed as a percentage of agreementCeilingChrf on the same prompts.
   * See the module doc for why this replaced the pre-2026-09-03 score. NOT
   * capped at 100 - exceeding it means the model's answers sit closer to the
   * community's writing than one native speaker sits to another on a
   * measured, like-for-like construction, and clamping would hide that.
   * Null when the candidate has no qualifying prompt or the ceiling itself
   * cannot be computed yet.
   */
  agreementScore: number | null;
  /** 95% bootstrap CI for agreementScore, over per-prompt like-for-like
   * scores, bounds transformed the same way as the point estimate. */
  agreementCiLow: number | null;
  agreementCiHigh: number | null;
  /** True when nLikeForLike was too small to bootstrap - the CI is
   * degenerate and must be rendered as "n too small", never as a tight
   * interval. */
  agreementUnderpowered: boolean;
  /**
   * DEPRECATED - the pre-2026-09-03 construction (best chrF over every
   * consented gold, not just k-1 peers). Kept for one release so nothing
   * mid-transition loses its number outright; do not build anything new on
   * it. See the module doc's LIKE-FOR-LIKE SCORING note for why it was
   * retired: it could clear 100 purely because the model was scored against
   * more references than the speaker it was compared to.
   */
  agreementScoreLegacy: number | null;
  /**
   * SPEAKER-RANK (finding 2 / option (c)): 0-100 by construction. Per
   * like-for-like prompt, the model is compared to every real speaker's own
   * leave-one-out chrF on that prompt; speakerRank is the share of speakers
   * the model ties or beats, averaged over prompts. 50 reads as "a typical
   * speaker", 100 as "beats every speaker on every prompt". Immune to the
   * reference-count asymmetry that inflated the legacy score, because both
   * sides of the comparison are scored the same way. Null when there is no
   * qualifying prompt.
   */
  speakerRank: number | null;
  /** 95% bootstrap CI for speakerRank, over per-prompt shares. */
  speakerRankCiLow: number | null;
  speakerRankCiHigh: number | null;
  speakerRankUnderpowered: boolean;
  /**
   * TONE-INSENSITIVE (finding 5): agreementScore recomputed with
   * stripToneMarks applied to both the model's answer and every reference,
   * ceiling recomputed the same way. Answers whether the v4/v4.1 gain
   * survives once tone-mark density is factored out.
   */
  agreementScoreToneInsensitive: number | null;
  /** The tone-insensitive analogue of strippedChrfClean: the raw mean
   * like-for-like chrF (not yet expressed against the ceiling) under
   * stripToneMarks. */
  strippedChrfCleanToneInsensitive: number | null;
  /**
   * SOURCEFREE SENSITIVITY (finding 7): agreementScore recomputed using only
   * gold whose provenance is speaker_authored_sourcefree (written before the
   * annotator saw any rejected model output), on the prompts that still have
   * >= 2 distinct sourcefree speakers. See MethodMetrics.nSourcefreePrompts
   * for how many prompts that left. Null when the candidate has no
   * qualifying sourcefree prompt.
   */
  agreementScoreSourcefree: number | null;
}

export interface MethodMetrics {
  computedAt: string;
  corpus: CorpusCounts;
  benchmark: BenchmarkShape;
  ceilings: {
    /** Every stored gold counted, including repeat submissions by the same
     * person - the inflated number the harness originally shipped. */
    asShipped: CeilingResult;
    /** One answer per annotator per prompt (each person's first). The honest
     * inter-SPEAKER ceiling: a repeat submission is not a second speaker. */
    onePerAnnotator: CeilingResult;
  };
  /**
   * The chrF value that maps to a Community Agreement Score of 100: the
   * one-answer-per-annotator inter-gold ceiling on the leak-free subset
   * (ceilings.onePerAnnotator.chrfClean). Exported so the UI can say exactly
   * what its 100 line is anchored to. Null until the clean subset contains a
   * prompt with answers from two different speakers.
   */
  agreementCeilingChrf: number | null;
  /** Leak-free prompts with >= 2 distinct real, deduplicated speakers - the
   * prompt set agreementScore, agreementScoreLegacy's replacement construct,
   * speakerRank and the tone-insensitive columns are all computed on (the
   * ceiling's own qualifying set, "the 25" in the audit). */
  likeForLikePrompts: number;
  /** The tone-insensitive analogue of agreementCeilingChrf: the ceiling
   * recomputed with stripToneMarks applied to every reference, on the same
   * likeForLikePrompts set. */
  agreementCeilingChrfToneInsensitive: number | null;
  /** Leak-free prompts with >= 2 distinct real speakers whose gold has
   * provenance speaker_authored_sourcefree - the (usually smaller) prompt set
   * agreementScoreSourcefree is computed on. */
  nSourcefreePrompts: number;
  /** The sourcefree analogue of agreementCeilingChrf. */
  agreementCeilingChrfSourcefree: number | null;
  /** Sorted by leak-free score, best first; unscoreable rows last. */
  candidates: CandidateScore[];
}

// ─── pure helpers (exported for tests) ──────────────────────────────────────

/**
 * Human-readable method label from candidate metadata. versionLabel="rag-v2"
 * / "rag-v3" / "rag-v4" is how the serving routes themselves distinguish
 * those paths (see scripts/register-rag-v2.ts, register-rag-v3.ts and
 * register-rag-v4.ts), so the scoreboard branches on the same field rather
 * than on a name convention that could drift.
 */
export function approachLabel(
  kind: string,
  versionLabel: string | null,
): Approach {
  if (kind === "baseline") return "untouched";
  if (kind === "rag") {
    if (versionLabel === "rag-v4-1") return "retrieval v4.1";
    if (versionLabel === "rag-v4") return "retrieval v4";
    if (versionLabel === "rag-v3") return "retrieval v3";
    return versionLabel === "rag-v2" ? "retrieval v2" : "retrieval v1";
  }
  if (kind === "sft" || kind === "dpo") return "fine-tuned";
  return "other";
}

export interface GoldRow {
  promptSlug: string;
  answerText: string;
  annotatorId: string;
  createdAt: Date;
  /** ColdAuthorAnswer.provenance - "speaker_authored_sourcefree" or
   * "corrected_from_inadequate". Used by the sourcefree-sensitivity column
   * (finding 7); every other score ignores it. */
  provenance: string;
}

/**
 * Keep each annotator's FIRST answer per prompt. This is the deduplication
 * that separates "two speakers agree" from "one speaker repeats themselves":
 * with it off, the shipped ceiling counted 58 same-annotator exact duplicates
 * as inter-speaker agreement and printed 63.2 where the honest figure is ~46
 * (tasks/latest-learnings-2026-08-09.md, section 1).
 */
export function onePerAnnotator(rows: GoldRow[]): GoldRow[] {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const seen = new Set<string>();
  const out: GoldRow[] = [];
  for (const r of sorted) {
    const key = `${r.promptSlug}::${r.annotatorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Group already-deduplicated gold rows by prompt slug, text only. */
function groupBySlug(rows: GoldRow[]): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const g of rows) {
    const list = bySlug.get(g.promptSlug) ?? [];
    list.push(g.answerText);
    bySlug.set(g.promptSlug, list);
  }
  return bySlug;
}

/**
 * One prompt's full set of leave-one-out draws: for each gold in turn, its
 * chrF against the rest. Shared by looCeilingChrf (the ceiling: each draw
 * IS a speaker's own score) and speaker-rank (the same draws, kept per-index
 * rather than averaged, so the model can be compared against each one).
 */
function perGoldLeaveOneOut(golds: string[]): number[] {
  return golds.map((g, i) => {
    const rest = golds.filter((_, j) => j !== i);
    return chrfMulti(g, rest).best * 100;
  });
}

/**
 * Leave-one-out inter-gold chrF, aggregated the way the eval harness does it
 * (src/lib/eval/reference.ts interGoldAgreement + runner.ts): per prompt,
 * hold out each gold in turn and score it against the rest with the
 * best-of-references rule; average the draws per prompt; average prompts.
 */
export function looCeilingChrf(goldsByPrompt: Map<string, string[]>): {
  mean: number | null;
  nPrompts: number;
} {
  const perPrompt: number[] = [];
  for (const golds of goldsByPrompt.values()) {
    if (golds.length < 2) continue;
    perPrompt.push(avg(perGoldLeaveOneOut(golds)));
  }
  return {
    mean: perPrompt.length > 0 ? avg(perPrompt) : null,
    nPrompts: perPrompt.length,
  };
}

/**
 * The like-for-like construction (finding 2): mean, over each held-out real
 * speaker h, of the model's hypothesis scored against the k-1 references
 * excluding h. `golds` must already have >= 2 entries (callers restrict to
 * qualifying prompts before calling this); a hypothesis is scored against
 * the SAME size and shape of reference set a speaker's own leave-one-out
 * score uses, which is the whole point - see the module doc.
 */
export function leaveOneOutMeanChrf(
  hypothesis: string,
  golds: string[],
): number {
  const draws = golds.map((_, i) => {
    const rest = golds.filter((_, j) => j !== i);
    return chrfMulti(hypothesis, rest).best * 100;
  });
  return avg(draws);
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function avgOrNull(xs: number[]): number | null {
  return xs.length > 0 ? avg(xs) : null;
}

/**
 * ragContextIds mixes bare RagEntry ids with prefixed `gold:` / `lex:` / `pp:`
 * / `edit:` ids. Mirrors splitContextIds in scripts/leak-audit.ts (src cannot
 * import from scripts): joining the raw array to one table resolves only a
 * fraction of the served pieces and under-reports leakage badly, so the split
 * is explicit. `edit:` (OutputEdit corrections, v4+) was added for finding
 * 18: 210 of 215 v4/v4.1 frozen outputs carry edit: ids that a guard checking
 * only gold/lex/pp silently drops.
 */
export function splitServedIds(ids: string[]): {
  ragEntryIds: string[];
  goldIds: string[];
  lexIds: string[];
  pairIds: string[];
  editIds: string[];
} {
  const ragEntryIds: string[] = [];
  const goldIds: string[] = [];
  const lexIds: string[] = [];
  const pairIds: string[] = [];
  const editIds: string[] = [];
  for (const id of ids) {
    if (id.startsWith("gold:")) goldIds.push(id.slice("gold:".length));
    else if (id.startsWith("lex:")) lexIds.push(id.slice("lex:".length));
    else if (id.startsWith("pp:")) pairIds.push(id.slice("pp:".length));
    else if (id.startsWith("edit:")) editIds.push(id.slice("edit:".length));
    else ragEntryIds.push(id);
  }
  return { ragEntryIds, goldIds, lexIds, pairIds, editIds };
}

/**
 * Community Agreement Score: a chrF value renormalized so the deduplicated
 * native-speaker ceiling reads 100. A score of 85 means "85% as close to the
 * community's writing as one native speaker is to another" - the same framing
 * MT human-parity claims use, with chrF (the sacrebleu character metric) as
 * the underlying distance. NOT clamped: a model CAN exceed one speaker's
 * agreement with another, and when that happens the UI shows it honestly
 * rather than silently flattening it to 100.
 */
export function toAgreementScore(
  chrf: number | null,
  ceilingChrf: number | null,
): number | null {
  if (chrf === null || ceilingChrf === null || ceilingChrf <= 0) return null;
  return (chrf / ceilingChrf) * 100;
}

// ─── the computation ────────────────────────────────────────────────────────

/** Same seed-account exclusion, same reason, as /api/public/stats and
 * annotation-insights.ts: counting a bring-up test login as a community
 * contributor (or its answer as community gold) overstates a language
 * community on a page meant for its members (finding 24). Applied to every
 * gold, ceiling, and pool-comparison query below, not just the annotator
 * count, so this endpoint and computeAnnotationInsights agree. */
const SEED_ACCOUNT_EMAIL_SUFFIX = "@test.com";
const REAL_CONTRIBUTOR = {
  annotator: { email: { not: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } } },
} as const;

export async function computeMethodMetrics(
  prisma: PrismaClient,
): Promise<MethodMetrics> {
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true },
  });
  const frozenIds = frozen.map((p) => p.id);
  const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));

  const [
    golds,
    outputs,
    goldAnswers,
    pairwiseComparisons,
    pairwiseBothInadequate,
    poolComparisons,
    poolBothInadequate,
    poolDecided,
    parallelPairs,
    lexEntries,
    pairwiseAnnotators,
    coldAnnotators,
    editAnnotators,
  ] = await Promise.all([
    // The ONE benchmark-gold read. consentBenchmark is enforced in the query,
    // never downstream - the same consent rule collect.ts carries, for the
    // same reason: 8 real speakers withheld this permission. REAL_CONTRIBUTOR
    // is enforced here too (finding 24): a seed-account row is not a
    // community answer and must not enter the gold, the ceiling, or any
    // candidate's score.
    prisma.coldAuthorAnswer.findMany({
      where: {
        promptId: { in: frozenIds },
        isDemo: false,
        consentBenchmark: true,
        ...REAL_CONTRIBUTOR,
      },
      select: {
        promptId: true,
        answerText: true,
        annotatorId: true,
        createdAt: true,
        provenance: true,
      },
    }),
    // ALL stored frozen-bank outputs, archived candidates included: a prompt
    // whose answer key was ever served is compromised no matter which
    // candidate it was served to. Archived rows are excluded from the
    // scoreboard below, not from leak detection.
    prisma.modelOutput.findMany({
      where: { promptId: { in: frozenIds }, isDemo: false },
      select: {
        promptId: true,
        outputText: true,
        ragContextIds: true,
        candidateModel: {
          select: {
            name: true,
            kind: true,
            versionLabel: true,
            archived: true,
          },
        },
      },
    }),
    prisma.coldAuthorAnswer.count({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
    }),
    prisma.pairwiseComparison.count({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
    }),
    prisma.pairwiseComparison.count({
      where: {
        isDemo: false,
        winner: "both_inadequate",
        ...REAL_CONTRIBUTOR,
      },
    }),
    // Pool-arm comparisons: BOTH outputs must belong to a current pool arm.
    // The pool is a DB flag, never a name list, so this is live per request.
    prisma.pairwiseComparison.count({
      where: {
        isDemo: false,
        ...REAL_CONTRIBUTOR,
        modelOutputA: { candidateModel: { inPairingPool: true } },
        modelOutputB: { candidateModel: { inPairingPool: true } },
      },
    }),
    prisma.pairwiseComparison.count({
      where: {
        isDemo: false,
        winner: "both_inadequate",
        ...REAL_CONTRIBUTOR,
        modelOutputA: { candidateModel: { inPairingPool: true } },
        modelOutputB: { candidateModel: { inPairingPool: true } },
      },
    }),
    prisma.pairwiseComparison.count({
      where: {
        isDemo: false,
        winner: { in: ["a", "b"] },
        ...REAL_CONTRIBUTOR,
        modelOutputA: { candidateModel: { inPairingPool: true } },
        modelOutputB: { candidateModel: { inPairingPool: true } },
      },
    }),
    prisma.parallelPair.count(),
    prisma.lexEntry.count(),
    prisma.pairwiseComparison.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.outputEdit.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
  ]);

  const annotators = new Set<string>([
    ...pairwiseAnnotators.map((r) => r.annotatorId),
    ...coldAnnotators.map((r) => r.annotatorId),
    ...editAnnotators.map((r) => r.annotatorId),
  ]).size;

  // The gold query is already scoped to frozen prompt ids, so every row
  // resolves; the fallback only guards against a race with a concurrent
  // prompt edit.
  const goldRows: GoldRow[] = golds.map((g) => ({
    promptSlug: slugOf.get(g.promptId) ?? g.promptId,
    answerText: g.answerText,
    annotatorId: g.annotatorId,
    createdAt: g.createdAt,
    provenance: g.provenance,
  }));

  const goldBySlug = groupBySlug(goldRows);

  // ── leak detection over the ASSEMBLED served context ──────────────────────
  // Every id family is resolved to the text that was actually served, because
  // the v1 hole was precisely that id-level bookkeeping missed content-level
  // leaks (scripts/leak-audit.ts documents the composition). `edit:` ids
  // (finding 18) and the toOrthography-rendered dictionary line (finding 19)
  // are resolved the same way the serving path composes them, via the shared
  // leak-guard helpers - never a second implementation of "what was served".
  const allRagIds = new Set<string>();
  const allGoldIds = new Set<string>();
  const allLexIds = new Set<string>();
  const allPairIds = new Set<string>();
  const allEditIds = new Set<string>();
  for (const o of outputs) {
    const s = splitServedIds(o.ragContextIds);
    s.ragEntryIds.forEach((i) => allRagIds.add(i));
    s.goldIds.forEach((i) => allGoldIds.add(i));
    s.lexIds.forEach((i) => allLexIds.add(i));
    s.pairIds.forEach((i) => allPairIds.add(i));
    s.editIds.forEach((i) => allEditIds.add(i));
  }

  const [ragRows, exemplarRows, lexRows, pairRows, editRows] =
    await Promise.all([
      prisma.ragEntry.findMany({
        where: { id: { in: [...allRagIds] } },
        select: { id: true, content: true },
      }),
      prisma.coldAuthorAnswer.findMany({
        where: { id: { in: [...allGoldIds] } },
        select: { id: true, answerText: true },
      }),
      prisma.lexEntry.findMany({
        where: { id: { in: [...allLexIds] } },
        select: { id: true, headword: true, gloss: true },
      }),
      prisma.parallelPair.findMany({
        where: { id: { in: [...allPairIds] } },
        select: { id: true, igala: true, english: true },
      }),
      prisma.outputEdit.findMany({
        where: { id: { in: [...allEditIds] } },
        select: {
          id: true,
          originalText: true,
          correctedText: true,
          rationale: true,
          segments: true,
        },
      }),
    ]);
  const ragById = new Map(ragRows.map((r) => [r.id, r.content]));
  const exemplarById = new Map(exemplarRows.map((r) => [r.id, r.answerText]));
  // toOrthography applied here (finding 19) - see renderLexPieceForGuard's
  // doc for why the raw headword is the wrong thing to check.
  const lexById = new Map(
    lexRows.map((r) => [r.id, renderLexPieceForGuard(r.headword, r.gloss)]),
  );
  const pairById = new Map(
    pairRows.map((r) => [r.id, `${r.english}\n${r.igala}`]),
  );
  const editById = new Map(
    editRows.map((r) => [
      r.id,
      renderEditPieceForGuard(
        r.originalText,
        r.correctedText,
        correctionReason(r.segments, r.rationale),
      ),
    ]),
  );

  const protectedSet = buildProtectedSet(
    goldRows.map((g) => ({ promptId: g.promptSlug, answerText: g.answerText })),
  );

  const hits: LeakHit[] = [];
  for (const o of outputs) {
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const s = splitServedIds(o.ragContextIds);
    const pieces = [
      ...s.ragEntryIds.map((id) => ({
        where: `rag:${id}`,
        text: ragById.get(id) ?? "",
      })),
      ...s.goldIds.map((id) => ({
        where: `exemplar:${id}`,
        text: exemplarById.get(id) ?? "",
      })),
      ...s.lexIds.map((id) => ({
        where: `lex:${id}`,
        text: lexById.get(id) ?? "",
      })),
      ...s.pairIds.map((id) => ({
        where: `pp:${id}`,
        text: pairById.get(id) ?? "",
      })),
      ...s.editIds.map((id) => ({
        where: `edit:${id}`,
        text: editById.get(id) ?? "",
      })),
    ].filter((p) => p.text);
    const { report } = filterAssembled(slug, pieces, protectedSet);
    if (!report.pass) hits.push(...report.hits);
  }
  const clean = leakFreePrompts(
    frozen.map((p) => p.promptId),
    hits,
  );
  const cleanSet = new Set(clean);

  // ── the two ceilings ──────────────────────────────────────────────────────
  // Computed BEFORE the scoreboard because the honest leak-free ceiling is
  // the denominator of every Community Agreement Score below.
  const ceilingFor = (rows: GoldRow[]): CeilingResult => {
    const bySlug = groupBySlug(rows);
    const all = looCeilingChrf(bySlug);
    const cleanOnly = new Map(
      [...bySlug.entries()].filter(([slug]) => cleanSet.has(slug)),
    );
    const cleanRes = looCeilingChrf(cleanOnly);
    return {
      chrfAll: all.mean,
      chrfClean: cleanRes.mean,
      nPromptsAll: all.nPrompts,
      nPromptsClean: cleanRes.nPrompts,
    };
  };
  const asShipped = ceilingFor(goldRows);
  const dedupedReal = onePerAnnotator(goldRows);
  const honest = ceilingFor(dedupedReal);
  // One answer per annotator AND leak-free: the only ceiling honest enough to
  // anchor "100 = native speaker agreement".
  const agreementCeilingChrf = honest.chrfClean;

  // ── like-for-like prompt set (finding 2): leak-free, >= 2 distinct real,
  // deduplicated speakers - "the ceiling's own 25". Built explicitly (rather
  // than read off `honest`) because the candidate scoring below needs the
  // actual per-prompt reference arrays, not just their aggregate. ──────────
  const likeForLikeGoldByPrompt = new Map(
    [...groupBySlug(dedupedReal).entries()].filter(
      ([slug, g]) => cleanSet.has(slug) && g.length >= 2,
    ),
  );
  const likeForLikePrompts = likeForLikeGoldByPrompt.size;
  // Each prompt's per-speaker leave-one-out draws, computed once and shared
  // by every candidate's speakerRank - the model is compared against the
  // SAME speaker scores regardless of which candidate is being ranked.
  const speakerLooByPrompt = new Map<string, number[]>();
  for (const [slug, golds2] of likeForLikeGoldByPrompt) {
    speakerLooByPrompt.set(slug, perGoldLeaveOneOut(golds2));
  }

  // ── tone-insensitive ceiling (finding 5), same prompt set, tone-stripped
  // reference text. Tone stripping never changes how many distinct speakers
  // answered a prompt, so the qualifying prompt set is identical. ─────────
  const likeForLikeGoldByPromptTone = new Map(
    [...likeForLikeGoldByPrompt.entries()].map(([slug, g]) => [
      slug,
      g.map(stripToneMarks),
    ]),
  );
  const agreementCeilingChrfToneInsensitive = looCeilingChrf(
    likeForLikeGoldByPromptTone,
  ).mean;

  // ── sourcefree-sensitivity prompt set + ceiling (finding 7): same
  // construction, restricted to provenance speaker_authored_sourcefree gold
  // only, its own >= 2-distinct-speaker qualification. ─────────────────────
  const sourcefreeDedupedReal = onePerAnnotator(
    goldRows.filter((g) => g.provenance === "speaker_authored_sourcefree"),
  );
  const sourcefreeGoldByPrompt = new Map(
    [...groupBySlug(sourcefreeDedupedReal).entries()].filter(
      ([slug, g]) => cleanSet.has(slug) && g.length >= 2,
    ),
  );
  const nSourcefreePrompts = sourcefreeGoldByPrompt.size;
  const agreementCeilingChrfSourcefree = looCeilingChrf(
    sourcefreeGoldByPrompt,
  ).mean;

  // ── per-candidate stripped chrF, both ways, plus the hypothesis text kept
  // per prompt for the like-for-like constructions below ───────────────────
  const byCandidate = new Map<
    string,
    {
      kind: string;
      versionLabel: string | null;
      scores: { slug: string; str: number }[];
      hypBySlug: Map<string, string>;
      emptyOutputs: number;
    }
  >();
  for (const o of outputs) {
    const cm = o.candidateModel;
    if (!cm || cm.archived) continue;
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const refs = goldBySlug.get(slug);
    if (!refs || refs.length === 0) continue;
    const entry = byCandidate.get(cm.name) ?? {
      kind: cm.kind,
      versionLabel: cm.versionLabel,
      scores: [],
      hypBySlug: new Map<string, string>(),
      emptyOutputs: 0,
    };
    // Finding 11: an empty provider output is a failure to answer, not a
    // language failure - it must never be scored as chrF 0. Excluded from
    // EVERY score below; counted on its own so it stays visible.
    if (o.outputText.trim().length === 0) {
      entry.emptyOutputs += 1;
      byCandidate.set(cm.name, entry);
      continue;
    }
    const stripped = stripAnswer(o.outputText).stripped;
    const str = chrfMulti(stripped, refs).best * 100;
    entry.scores.push({ slug, str });
    entry.hypBySlug.set(slug, stripped);
    byCandidate.set(cm.name, entry);
  }

  const candidates: CandidateScore[] = [...byCandidate.entries()]
    .map(([name, c]) => {
      const cleanScores = c.scores.filter((s) => cleanSet.has(s.slug));
      const cleanVals = cleanScores.map((s) => s.str);
      const strippedChrfClean = avgOrNull(cleanVals);
      const strippedChrfAll = avgOrNull(c.scores.map((s) => s.str));

      // legacy construction: best chrF over every real consented gold. Kept
      // only as agreementScoreLegacy - see the module doc.
      const agreementScoreLegacy = toAgreementScore(
        strippedChrfClean,
        agreementCeilingChrf,
      );

      // ── like-for-like (finding 2) ──────────────────────────────────────
      const perPromptM: { slug: string; m: number }[] = [];
      for (const [slug, golds2] of likeForLikeGoldByPrompt) {
        const hyp = c.hypBySlug.get(slug);
        if (hyp === undefined) continue;
        perPromptM.push({ slug, m: leaveOneOutMeanChrf(hyp, golds2) });
      }
      const nLikeForLike = perPromptM.length;
      const meanM = avgOrNull(perPromptM.map((p) => p.m));
      const mCi = bootstrapMean(perPromptM.map((p) => p.m));
      const hasAgreementCi =
        perPromptM.length > 0 && agreementCeilingChrf !== null;
      const agreementScore = toAgreementScore(meanM, agreementCeilingChrf);

      // ── speaker-rank (finding 2) ────────────────────────────────────────
      const perPromptShare = perPromptM.map(({ slug, m }) => {
        const speakerLoos = speakerLooByPrompt.get(slug) ?? [];
        const k = speakerLoos.length;
        const tiesOrBeats = speakerLoos.filter((s) => m >= s).length;
        return k > 0 ? tiesOrBeats / k : 0;
      });
      const speakerRankMean = avgOrNull(perPromptShare);
      const rankCi = bootstrapMean(perPromptShare);
      const hasRankCi = perPromptShare.length > 0;

      // ── tone-insensitive (finding 5) ────────────────────────────────────
      const perPromptMTone: number[] = [];
      for (const [slug, golds2] of likeForLikeGoldByPromptTone) {
        const hyp = c.hypBySlug.get(slug);
        if (hyp === undefined) continue;
        perPromptMTone.push(leaveOneOutMeanChrf(stripToneMarks(hyp), golds2));
      }
      const strippedChrfCleanToneInsensitive = avgOrNull(perPromptMTone);
      const agreementScoreToneInsensitive = toAgreementScore(
        strippedChrfCleanToneInsensitive,
        agreementCeilingChrfToneInsensitive,
      );

      // ── sourcefree sensitivity (finding 7) ──────────────────────────────
      const perPromptMSourcefree: number[] = [];
      for (const [slug, golds2] of sourcefreeGoldByPrompt) {
        const hyp = c.hypBySlug.get(slug);
        if (hyp === undefined) continue;
        perPromptMSourcefree.push(leaveOneOutMeanChrf(hyp, golds2));
      }
      const agreementScoreSourcefree = toAgreementScore(
        avgOrNull(perPromptMSourcefree),
        agreementCeilingChrfSourcefree,
      );

      return {
        name,
        approach: approachLabel(c.kind, c.versionLabel),
        n: c.scores.length,
        nClean: cleanScores.length,
        nLikeForLike,
        emptyOutputs: c.emptyOutputs,
        strippedChrfAll,
        strippedChrfClean,
        agreementScore,
        agreementCiLow: hasAgreementCi
          ? toAgreementScore(mCi.ciLow, agreementCeilingChrf)
          : null,
        agreementCiHigh: hasAgreementCi
          ? toAgreementScore(mCi.ciHigh, agreementCeilingChrf)
          : null,
        agreementUnderpowered: mCi.underpowered,
        agreementScoreLegacy,
        speakerRank: speakerRankMean !== null ? speakerRankMean * 100 : null,
        speakerRankCiLow: hasRankCi ? rankCi.ciLow * 100 : null,
        speakerRankCiHigh: hasRankCi ? rankCi.ciHigh * 100 : null,
        speakerRankUnderpowered: rankCi.underpowered,
        agreementScoreToneInsensitive,
        strippedChrfCleanToneInsensitive,
        agreementScoreSourcefree,
      };
    })
    .sort(
      (a, b) =>
        (b.strippedChrfClean ?? Number.NEGATIVE_INFINITY) -
        (a.strippedChrfClean ?? Number.NEGATIVE_INFINITY),
    );

  return {
    computedAt: new Date().toISOString(),
    corpus: {
      goldAnswers,
      pairwiseComparisons,
      pairwiseBothInadequate,
      poolComparisons,
      poolBothInadequate,
      poolDecided,
      parallelPairs,
      lexEntries,
      annotators,
    },
    benchmark: {
      frozenPrompts: frozen.length,
      promptsWithGold: goldBySlug.size,
      leakedPrompts: new Set(hits.map((h) => h.promptId)).size,
      leakFreePrompts: clean.length,
    },
    ceilings: {
      asShipped,
      onePerAnnotator: honest,
    },
    agreementCeilingChrf,
    likeForLikePrompts,
    agreementCeilingChrfToneInsensitive,
    nSourcefreePrompts,
    agreementCeilingChrfSourcefree,
    candidates,
  };
}
