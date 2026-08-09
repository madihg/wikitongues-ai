/**
 * Diacritic-aware string similarity for Igala.
 *
 * Three deliberately different strictness levels, because "wrong" in Igala has
 * three different shapes and collapsing them hides the interesting one:
 *
 *   exactMatch          - identical after NFC + whitespace + case folding.
 *                         Tone marks and dotted vowels must match exactly.
 *   toneVariantMatch    - identical once TONE marks are removed but dotted
 *                         vowels (ẹ / ọ) are kept. This is "the right word,
 *                         written with different tone practice" - the single
 *                         most common near-miss in this corpus, and the one a
 *                         naive exact-match metric would score as a total
 *                         failure. Community gold is systematically
 *                         under-tone-marked relative to frontier models, so
 *                         this class is large and must be reported separately.
 *   foldedMatch         - identical once EVERY diacritic is stripped. Loosest;
 *                         it also folds away the ẹ/e contrast, which is a real
 *                         phonemic distinction, so it OVERSTATES correctness.
 *                         Reported only as an upper bound.
 *
 * Plus a token-level edit distance normalised by length, for the multi-word
 * answers where a single-token match rate says nothing.
 */

import { normalizeText, toneFold, fullFold, tokenize } from "./normalize";

/** Case-insensitive, whitespace-normalised, diacritic-EXACT equality. */
export function exactMatch(a: string, b: string): boolean {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

/** Equal once tone marks are removed; dotted vowels ẹ / ọ still count. */
export function toneInsensitiveMatch(a: string, b: string): boolean {
  return toneFold(a) === toneFold(b);
}

/**
 * The interesting class: SAME word, DIFFERENT tone marking. True only when the
 * strings differ under exact comparison but agree once tone is folded away.
 */
export function toneVariantMatch(a: string, b: string): boolean {
  return !exactMatch(a, b) && toneInsensitiveMatch(a, b);
}

/** Equal once every diacritic is stripped. Loosest; overstates correctness. */
export function foldedMatch(a: string, b: string): boolean {
  return fullFold(a) === fullFold(b);
}

/** Levenshtein distance over an arbitrary unit array. O(n*m) time, O(m) space. */
export function editDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}

/**
 * Token-level edit distance normalised by the longer token sequence, returned
 * as a SIMILARITY in [0, 1] (1 = identical token sequences). Two empty strings
 * are defined as identical.
 */
export function tokenEditSimilarity(a: string, b: string): number {
  const ta = tokenize(a).map((t) => t.toLowerCase());
  const tb = tokenize(b).map((t) => t.toLowerCase());
  if (ta.length === 0 && tb.length === 0) return 1;
  const denom = Math.max(ta.length, tb.length);
  if (denom === 0) return 0;
  return 1 - editDistance(ta, tb) / denom;
}

/** Same, but tone-blind: measures word-order/word-choice agreement only. */
export function tokenEditSimilarityToneBlind(a: string, b: string): number {
  return tokenEditSimilarity(toneFold(a), toneFold(b));
}

export interface MatchKind {
  exact: boolean;
  toneVariant: boolean;
  folded: boolean;
}

/** All three strictness levels at once, for one hypothesis/reference pair. */
export function matchKinds(hypothesis: string, reference: string): MatchKind {
  const exact = exactMatch(hypothesis, reference);
  return {
    exact,
    toneVariant: !exact && toneInsensitiveMatch(hypothesis, reference),
    folded: foldedMatch(hypothesis, reference),
  };
}
