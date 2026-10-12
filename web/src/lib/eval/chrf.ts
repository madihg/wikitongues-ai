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

/** Every n-gram of exactly length `n` in `units`, counted, with the total. */
interface NgramOrder {
  counts: Map<string, number>;
  /** Number of n-grams of this order (repeats included). 0 when the text is
   * shorter than the order. */
  total: number;
}

function ngramOrder(units: string[], n: number): NgramOrder {
  const counts = new Map<string, number>();
  if (units.length < n) return { counts, total: 0 };
  let total = 0;
  for (let i = 0; i + n <= units.length; i++) {
    // U+0000 can never appear in normalised text, so it is a safe joiner.
    const key = units.slice(i, i + n).join("\u0000");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  return { counts, total };
}

/**
 * One side of a chrF comparison with its n-grams already counted.
 *
 * Counting n-grams is nearly all of chrF's cost and depends on ONE string,
 * not on the pair, so a caller that scores the same text against many others
 * (a model answer against every reference, a reference against every model)
 * can count each text once and reuse it. chrfSingle is defined as
 * chrfFromProfiles over two fresh profiles, so there is one implementation of
 * the metric and a score from reused profiles is the same number bit for bit.
 */
export interface ChrfProfile {
  /** The orders the n-grams were counted at; both sides of a score must
   * have been counted at the same orders. */
  charOrder: number;
  wordOrder: number;
  /** No characters at all once whitespace is removed. */
  empty: boolean;
  /** Character orders 1..charOrder, then word orders 1..wordOrder. */
  orders: NgramOrder[];
}

/** Count one text's n-grams for chrF. Role-free: the same profile serves as
 * a hypothesis or as a reference. `beta` plays no part here. */
export function chrfProfile(
  text: string,
  options: ChrfOptions = {},
): ChrfProfile {
  const { charOrder, wordOrder } = { ...CHRF_DEFAULTS, ...options };
  const chars = charSequence(text);
  const orders: NgramOrder[] = [];
  for (let n = 1; n <= charOrder; n++) orders.push(ngramOrder(chars, n));
  if (wordOrder > 0) {
    const words = tokenize(text);
    for (let n = 1; n <= wordOrder; n++) orders.push(ngramOrder(words, n));
  }
  return { charOrder, wordOrder, empty: chars.length === 0, orders };
}

/** Clipped matches between two n-gram count maps: for every n-gram both
 * sides have, the smaller of the two counts. Symmetric, so the smaller map is
 * the one walked. */
function clippedMatches(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let match = 0;
  for (const [key, c] of small) {
    const o = large.get(key);
    if (o !== undefined) match += Math.min(c, o);
  }
  return match;
}

/**
 * chrF from two counted profiles. Returns [0, 1]. Only `beta` is read from
 * `options`; the n-gram orders are the profiles' own, and two profiles
 * counted at different orders throw rather than score.
 */
export function chrfFromProfiles(
  hypothesis: ChrfProfile,
  reference: ChrfProfile,
  options: ChrfOptions = {},
): number {
  if (
    hypothesis.charOrder !== reference.charOrder ||
    hypothesis.wordOrder !== reference.wordOrder
  ) {
    throw new Error(
      "chrfFromProfiles: profiles were counted at different n-gram orders",
    );
  }
  if (hypothesis.empty && reference.empty) return 1;
  if (hypothesis.empty || reference.empty) return 0;

  const { beta } = { ...CHRF_DEFAULTS, ...options };
  const factor = beta * beta;
  let sum = 0;
  let effectiveOrders = 0;
  for (let i = 0; i < hypothesis.orders.length; i++) {
    const hyp = hypothesis.orders[i];
    const ref = reference.orders[i];
    // An order where either side has no n-grams at all carries no information
    // (e.g. char 6-grams of a 3-character word); sacrebleu skips it rather than
    // scoring it 0, so short strings are not unfairly punished.
    if (hyp.total === 0 || ref.total === 0) continue;
    effectiveOrders++;
    const match = clippedMatches(hyp.counts, ref.counts);
    const precision = match / hyp.total;
    const recall = match / ref.total;
    const denom = factor * precision + recall;
    sum += denom > 0 ? ((1 + factor) * precision * recall) / denom : 0;
  }
  if (effectiveOrders === 0) return 0;
  return sum / effectiveOrders;
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
  return chrfFromProfiles(
    chrfProfile(hypothesis, options),
    chrfProfile(reference, options),
    options,
  );
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
  return aggregateReferences(
    references.map((r) => chrfSingle(hypothesis, r, options)),
  );
}

/** The multi-reference rule over already-computed per-reference scores. */
function aggregateReferences(perReference: number[]): ChrfMultiResult {
  if (perReference.length === 0) {
    return { best: 0, mean: 0, bestIndex: -1, perReference: [] };
  }
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

/**
 * chrfSingle and chrfMulti with a memory, for one batch of scoring.
 *
 * A scoreboard scores the same few hundred strings against each other tens
 * of thousands of times (every model answer against every reference, under
 * several leave-one-out constructions). A scorer counts each distinct
 * string's n-grams once and scores each distinct (hypothesis, reference)
 * pair once; everything after that is a lookup. The values are the ones
 * chrfSingle and chrfMulti return, bit for bit, because all three run
 * chrfFromProfiles over chrfProfile.
 *
 * The memory lives in the scorer, not in this module: create one per batch
 * and let it go, so nothing accumulates across requests.
 */
export interface ChrfScorer {
  /** Same value as chrfSingle(hypothesis, reference, options). */
  single(hypothesis: string, reference: string): number;
  /** Same result as chrfMulti(hypothesis, references, options). */
  multi(hypothesis: string, references: string[]): ChrfMultiResult;
}

export function createChrfScorer(options: ChrfOptions = {}): ChrfScorer {
  const profiles = new Map<string, ChrfProfile>();
  const profileOf = (text: string): ChrfProfile => {
    let profile = profiles.get(text);
    if (profile === undefined) {
      profile = chrfProfile(text, options);
      profiles.set(text, profile);
    }
    return profile;
  };
  const scores = new Map<string, Map<string, number>>();
  const single = (hypothesis: string, reference: string): number => {
    let byReference = scores.get(hypothesis);
    if (byReference === undefined) {
      byReference = new Map();
      scores.set(hypothesis, byReference);
    }
    let score = byReference.get(reference);
    if (score === undefined) {
      score = chrfFromProfiles(
        profileOf(hypothesis),
        profileOf(reference),
        options,
      );
      byReference.set(reference, score);
    }
    return score;
  };
  return {
    single,
    multi: (hypothesis, references) =>
      aggregateReferences(references.map((r) => single(hypothesis, r))),
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
