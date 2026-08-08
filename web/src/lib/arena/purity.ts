/**
 * Cheap automated purity proxies for Igala generations.
 *
 * These are the two metrics Rung A used (tasks/rung-a-results.json) and the only
 * ones comparable against the stored baselines, so their definitions are frozen
 * here verbatim rather than re-invented per run:
 *
 *   englishFnWordShare - share of outputs whose FIRST 8 WORDS contain any common
 *     English function word. Catches the classic failure of answering in English
 *     ("The Igala word for water is...") or wrapping Igala in English framing.
 *     LOWER is better.
 *
 *   toneShare - share of outputs carrying any Igala diacritic: a combining tone
 *     mark (acute / grave / macron) or a dotted vowel (combining dot below),
 *     detected after NFD so precomposed and decomposed spellings both count.
 *     HIGHER is better.
 *
 * Both are PROXIES, not quality. Rung A found them saturated at the frontier
 * baseline (0.000 / 1.000), and native gold is often UNDER-tone-marked relative
 * to models, so toneShare measures presence, never correctness. They exist to
 * catch gross regressions - a fine-tune that starts answering in English, or one
 * that strips diacritics - not to decide which model is better. Native human
 * judgment on the frozen bank does that.
 */

/** Frozen Rung A word list. Do not extend: it would break comparability. */
export const ENGLISH_FUNCTION_WORDS = [
  "the",
  "is",
  "are",
  "you",
  "would",
  "for",
  "to",
] as const;

const FIRST_N_WORDS = 8;

/**
 * Combining grave (U+0300), acute (U+0301), macron (U+0304) and dot-below
 * (U+0323, which is what makes the dotted vowels e-dot / o-dot). Written as
 * escapes because bare combining marks in source are invisible to review.
 */
const DIACRITIC_RE = /[\u0300\u0301\u0304\u0323]/;

/** True when any of the first 8 words is a common English function word. */
export function hasEnglishFunctionWord(text: string): boolean {
  const words = (text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, FIRST_N_WORDS)
    // Strip punctuation so "The," and "to." still match.
    .map((w) => w.replace(/[^\p{L}\p{M}']/gu, ""));
  return words.some((w) =>
    (ENGLISH_FUNCTION_WORDS as readonly string[]).includes(w),
  );
}

/** True when the text carries any Igala tone mark or dotted vowel. */
export function hasToneMark(text: string): boolean {
  return DIACRITIC_RE.test((text ?? "").normalize("NFD"));
}

export interface PurityMetrics {
  n: number;
  englishFnWordShare: number;
  toneShare: number;
  meanChars: number;
  meanWords: number;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Aggregate the purity proxies over a set of generations. */
export function purityMetrics(texts: string[]): PurityMetrics {
  const n = texts.length;
  if (n === 0) {
    return {
      n: 0,
      englishFnWordShare: 0,
      toneShare: 0,
      meanChars: 0,
      meanWords: 0,
    };
  }
  let english = 0;
  let tone = 0;
  let chars = 0;
  let words = 0;
  for (const raw of texts) {
    const t = raw ?? "";
    if (hasEnglishFunctionWord(t)) english++;
    if (hasToneMark(t)) tone++;
    chars += t.length;
    words += t.split(/\s+/).filter(Boolean).length;
  }
  return {
    n,
    englishFnWordShare: round3(english / n),
    toneShare: round3(tone / n),
    meanChars: round3(chars / n),
    meanWords: round3(words / n),
  };
}
