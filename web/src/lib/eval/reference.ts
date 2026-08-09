/**
 * Reference-based scoring against COMMUNITY GOLD, and the human ceiling.
 *
 * Every frozen prompt in this bank carries between 1 and 20 gold answers, each
 * written cold (source-free) by a different Igala speaker. That is a gift and a
 * trap:
 *
 *   THE GIFT - multiple references make chrF far more robust than a single
 *   reference would be, because a model is not punished for choosing a
 *   legitimate variant.
 *
 *   THE TRAP - the annotators DISAGREE with each other. On an open prompt
 *   ("write a short natural blessing") two native speakers can share almost no
 *   characters. If we report a model's chrF without also reporting how well the
 *   HUMANS match each other, a score of 0.35 looks like failure when the human
 *   ceiling might be 0.30. So this module always computes both.
 *
 * THE CEILING, defined: for a prompt with k >= 2 golds, hold out each gold in
 * turn, treat it as if it were a system output, and score it against the
 * remaining k-1 golds with exactly the rules used for a model. Average over the
 * k held-out golds. This is deliberately CONSERVATIVE in one direction - the
 * held-out human is scored against k-1 references while a model is scored
 * against k - which makes the true ceiling slightly HIGHER than reported, never
 * lower. We prefer a ceiling we cannot be accused of inflating.
 *
 * A model score above the ceiling does NOT mean superhuman: it means the model
 * is closer to the centroid of the reference set than a typical individual
 * speaker is, which for short lexical prompts is easy and meaningless. Read the
 * ceiling as "the resolution limit of the metric", not as a target.
 */

import { chrfMulti, chrfppMulti, type ChrfMultiResult } from "./chrf";
import {
  exactMatch,
  toneInsensitiveMatch,
  foldedMatch,
  tokenEditSimilarity,
} from "./similarity";
import { mean } from "./stats";

/** The metric keys this module produces, in report order. */
export const REFERENCE_METRICS = [
  "chrf",
  "chrfpp",
  "exactMatch",
  "toneInsensitiveMatch",
  "foldedMatch",
  "tokenEditSimilarity",
] as const;

export type ReferenceMetric = (typeof REFERENCE_METRICS)[number];

export const METRIC_LABELS: Record<ReferenceMetric, string> = {
  chrf: "chrF",
  chrfpp: "chrF++",
  exactMatch: "Exact match",
  toneInsensitiveMatch: "Match ignoring tone",
  foldedMatch: "Match ignoring all diacritics",
  tokenEditSimilarity: "Token edit similarity",
};

export interface ReferenceScore {
  /** Best over references - the standard multi-reference rule. */
  best: Record<ReferenceMetric, number>;
  /** Mean over references - how central the hypothesis is in the gold spread. */
  meanOverRefs: Record<ReferenceMetric, number>;
  /** Number of references used. 0 means the prompt had no gold. */
  nReferences: number;
  /**
   * True when the hypothesis matched some reference only after tone marks were
   * folded away: the right word, different tone practice. Counted separately
   * because it is the dominant near-miss class in this corpus.
   */
  toneVariantOnly: boolean;
}

const ZERO: Record<ReferenceMetric, number> = {
  chrf: 0,
  chrfpp: 0,
  exactMatch: 0,
  toneInsensitiveMatch: 0,
  foldedMatch: 0,
  tokenEditSimilarity: 0,
};

function boolStats(
  hypothesis: string,
  references: string[],
  predicate: (a: string, b: string) => boolean,
): { best: number; mean: number } {
  const hits = references.map((r) => (predicate(hypothesis, r) ? 1 : 0));
  return { best: Math.max(0, ...hits), mean: mean(hits) };
}

/** Score one hypothesis against every gold answer for its prompt. */
export function scoreAgainstReferences(
  hypothesis: string,
  references: string[],
): ReferenceScore {
  if (references.length === 0) {
    return {
      best: { ...ZERO },
      meanOverRefs: { ...ZERO },
      nReferences: 0,
      toneVariantOnly: false,
    };
  }

  const chrf: ChrfMultiResult = chrfMulti(hypothesis, references);
  const chrfpp: ChrfMultiResult = chrfppMulti(hypothesis, references);
  const em = boolStats(hypothesis, references, exactMatch);
  const tim = boolStats(hypothesis, references, toneInsensitiveMatch);
  const fm = boolStats(hypothesis, references, foldedMatch);
  const editScores = references.map((r) => tokenEditSimilarity(hypothesis, r));

  return {
    best: {
      chrf: chrf.best,
      chrfpp: chrfpp.best,
      exactMatch: em.best,
      toneInsensitiveMatch: tim.best,
      foldedMatch: fm.best,
      tokenEditSimilarity: Math.max(0, ...editScores),
    },
    meanOverRefs: {
      chrf: chrf.mean,
      chrfpp: chrfpp.mean,
      exactMatch: em.mean,
      toneInsensitiveMatch: tim.mean,
      foldedMatch: fm.mean,
      tokenEditSimilarity: mean(editScores),
    },
    nReferences: references.length,
    toneVariantOnly: em.best === 0 && tim.best === 1,
  };
}

export interface GoldCeiling {
  /** Per-metric leave-one-out human-vs-human score (best-of-remaining rule). */
  best: Record<ReferenceMetric, number>;
  /** Per-metric leave-one-out mean-over-remaining score. */
  meanOverRefs: Record<ReferenceMetric, number>;
  /** How many golds were held out (= number of golds, when k >= 2). */
  nGolds: number;
  /** False when the prompt has fewer than 2 golds: no ceiling is computable. */
  computable: boolean;
  /** Per-held-out-gold chrF (best rule), for distribution work / thresholds. */
  perGoldChrf: number[];
}

const EMPTY_CEILING: GoldCeiling = {
  best: { ...ZERO },
  meanOverRefs: { ...ZERO },
  nGolds: 0,
  computable: false,
  perGoldChrf: [],
};

/**
 * How much the humans differ from each other on ONE prompt - the ceiling any
 * automatic reference-based metric could reach on that prompt.
 */
export function interGoldAgreement(golds: string[]): GoldCeiling {
  if (golds.length < 2) {
    return { ...EMPTY_CEILING, nGolds: golds.length, perGoldChrf: [] };
  }
  const bestAcc: Record<string, number[]> = {};
  const meanAcc: Record<string, number[]> = {};
  for (const m of REFERENCE_METRICS) {
    bestAcc[m] = [];
    meanAcc[m] = [];
  }
  for (let i = 0; i < golds.length; i++) {
    const held = golds[i];
    const rest = golds.filter((_, j) => j !== i);
    const s = scoreAgainstReferences(held, rest);
    for (const m of REFERENCE_METRICS) {
      bestAcc[m].push(s.best[m]);
      meanAcc[m].push(s.meanOverRefs[m]);
    }
  }
  const best = { ...ZERO };
  const meanOverRefs = { ...ZERO };
  for (const m of REFERENCE_METRICS) {
    best[m] = mean(bestAcc[m]);
    meanOverRefs[m] = mean(meanAcc[m]);
  }
  return {
    best,
    meanOverRefs,
    nGolds: golds.length,
    computable: true,
    perGoldChrf: bestAcc.chrf,
  };
}
