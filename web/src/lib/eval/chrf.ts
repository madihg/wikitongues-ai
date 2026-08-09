/**
 * chrF and chrF++ - character n-gram F-score.
 *
 * METRIC DEFINITION (cited, not invented):
 *   Popović, Maja. "chrF: character n-gram F-score for automatic MT
 *   evaluation." Proceedings of the Tenth Workshop on Statistical Machine
 *   Translation (WMT), 2015, pp. 392-395.
 *   Popović, Maja. "chrF++: words helping character n-grams." WMT 2017,
 *   pp. 612-618.
 *
 *   chrF_beta = (1 + beta^2) * chrP * chrR / (beta^2 * chrP + chrR)
 *
 *   where chrP is the percentage of character n-grams in the HYPOTHESIS that
 *   also occur in the REFERENCE, chrR the percentage of character n-grams in
 *   the reference that also occur in the hypothesis, and beta weights recall
 *   beta times as much as precision. Popović's default, which we use, is
 *   n = 6 character orders and beta = 2. chrF++ adds word n-grams up to order
 *   2 to the same average.
 *
 * WHY THIS METRIC HERE. Word-level BLEU is close to useless for Igala: gold
 * answers in our bank have a median length of ~5 characters (single words and
 * short phrases), so a 4-gram word metric scores 0 almost everywhere, and any
 * word-level metric treats "ẹ́gẹ" vs "ẹgẹ" (same word, different tone practice)
 * as a total miss rather than a near miss. Character n-grams degrade
 * gracefully on both counts, which is why chrF is the standard for
 * low-resource MT.
 *
 * IMPLEMENTATION NOTES. This follows the algorithm sacrebleu's CHRF documents,
 * so the conventions below are the ones published chrF numbers assume:
 *   - whitespace is removed before extracting CHARACTER n-grams;
 *   - matches are CLIPPED (min of hypothesis and reference counts);
 *   - an F-score is computed PER ORDER and then averaged over the "effective"
 *     orders - those where both sides have at least one n-gram of that order -
 *     rather than averaging precision and recall first;
 *   - with multiple references, the score is the MAX over references.
 *
 * WHAT HAS AND HAS NOT BEEN VERIFIED - do not upgrade this claim without doing
 * the work. The implementation is checked against values computed BY HAND in
 * chrf.test.ts (both the beta=1 and beta=2 cases are worked through digit by
 * digit in the test comments), plus the usual identity/disjoint/symmetry
 * properties. It has NOT been diffed against an actual sacrebleu run, and this
 * repo has no Python toolchain to do so. So: "implements the documented
 * sacrebleu algorithm", NOT "verified byte-identical to sacrebleu". If someone
 * needs the stronger claim - e.g. before putting a chrF figure in a paper
 * alongside numbers from other systems - the closing step is to run sacrebleu
 * over the same hypothesis/reference pairs and diff, and to record the
 * sacrebleu version when doing it, since this convention is a property of that
 * tool's current implementation rather than of the 2015 paper.
 *
 * SCALE: this module returns [0, 1]. The literature and sacrebleu report
 * chrF x 100; multiply at the display layer, never inside the maths.
 */

import { charSequence, tokenize } from "./normalize";

export interface ChrfOptions {
  /** Highest character n-gram order. Popović default 6. */
  charOrder?: number;
  /** Highest word n-gram order. 0 = chrF, 2 = chrF++. */
  wordOrder?: number;
  /** Recall weight. Popović default 2. */
  beta?: number;
}

export const CHRF_DEFAULTS: Required<ChrfOptions> = {
  charOrder: 6,
  wordOrder: 0,
  beta: 2,
};

export const CHRFPP_DEFAULTS: Required<ChrfOptions> = {
  charOrder: 6,
  wordOrder: 2,
  beta: 2,
};

/** Counts of every n-gram of exactly length `n` in `units`. */
function ngramCounts(units: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  if (units.length < n) return counts;
  for (let i = 0; i + n <= units.length; i++) {
    // U+0000 can never appear in normalised text, so it is a safe joiner.
    const key = units.slice(i, i + n).join("\u0000");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

interface OrderStat {
  hyp: number;
  ref: number;
  match: number;
}

function orderStat(
  hypUnits: string[],
  refUnits: string[],
  n: number,
): OrderStat {
  const hyp = ngramCounts(hypUnits, n);
  const ref = ngramCounts(refUnits, n);
  let total = 0;
  let refTotal = 0;
  let match = 0;
  for (const c of hyp.values()) total += c;
  for (const c of ref.values()) refTotal += c;
  for (const [key, c] of hyp) {
    const r = ref.get(key);
    if (r !== undefined) match += Math.min(c, r);
  }
  return { hyp: total, ref: refTotal, match };
}

/**
 * chrF against a SINGLE reference. Returns [0, 1].
 *
 * Degenerate inputs are defined rather than thrown: two empty strings score 1
 * (identical), and one empty against one non-empty scores 0.
 */
export function chrfSingle(
  hypothesis: string,
  reference: string,
  options: ChrfOptions = {},
): number {
  const { charOrder, wordOrder, beta } = { ...CHRF_DEFAULTS, ...options };

  const hypChars = charSequence(hypothesis);
  const refChars = charSequence(reference);
  if (hypChars.length === 0 && refChars.length === 0) return 1;
  if (hypChars.length === 0 || refChars.length === 0) return 0;

  const hypWords = tokenize(hypothesis);
  const refWords = tokenize(reference);

  const stats: OrderStat[] = [];
  for (let n = 1; n <= charOrder; n++) {
    stats.push(orderStat(hypChars, refChars, n));
  }
  for (let n = 1; n <= wordOrder; n++) {
    stats.push(orderStat(hypWords, refWords, n));
  }

  const factor = beta * beta;
  let sum = 0;
  let effectiveOrders = 0;
  for (const s of stats) {
    // An order where either side has no n-grams at all carries no information
    // (e.g. char 6-grams of a 3-character word); sacrebleu skips it rather than
    // scoring it 0, so short strings are not unfairly punished.
    if (s.hyp === 0 || s.ref === 0) continue;
    effectiveOrders++;
    const precision = s.match / s.hyp;
    const recall = s.match / s.ref;
    const denom = factor * precision + recall;
    sum += denom > 0 ? ((1 + factor) * precision * recall) / denom : 0;
  }
  if (effectiveOrders === 0) return 0;
  return sum / effectiveOrders;
}

export interface ChrfMultiResult {
  /** Best score over all references - the standard multi-reference rule. */
  best: number;
  /** Mean over all references - how well the hypothesis matches the SPREAD. */
  mean: number;
  /** Index of the reference that produced `best`. -1 when there are none. */
  bestIndex: number;
  /** Per-reference scores, in input order. */
  perReference: number[];
}

/**
 * chrF against MULTIPLE references. Returns both `best` (sacrebleu's rule: a
 * hypothesis matching any one annotator is correct) and `mean` (how central it
 * is among all annotators). Reporting only `best` would flatter a model that
 * happens to copy one idiosyncratic annotator, so we always carry both.
 */
export function chrfMulti(
  hypothesis: string,
  references: string[],
  options: ChrfOptions = {},
): ChrfMultiResult {
  if (references.length === 0) {
    return { best: 0, mean: 0, bestIndex: -1, perReference: [] };
  }
  const perReference = references.map((r) =>
    chrfSingle(hypothesis, r, options),
  );
  let best = -1;
  let bestIndex = -1;
  let sum = 0;
  perReference.forEach((s, i) => {
    sum += s;
    if (s > best) {
      best = s;
      bestIndex = i;
    }
  });
  return {
    best,
    mean: sum / perReference.length,
    bestIndex,
    perReference,
  };
}

/** chrF++ (char order 6 + word order 2, beta 2). Returns [0, 1]. */
export function chrfppSingle(hypothesis: string, reference: string): number {
  return chrfSingle(hypothesis, reference, CHRFPP_DEFAULTS);
}

/** chrF++ against multiple references. */
export function chrfppMulti(
  hypothesis: string,
  references: string[],
): ChrfMultiResult {
  return chrfMulti(hypothesis, references, CHRFPP_DEFAULTS);
}
