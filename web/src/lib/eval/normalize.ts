/**
 * Text normalisation for Igala evaluation.
 *
 * Igala is written with a Latin orthography carrying TWO independent kinds of
 * diacritic, and the difference matters for scoring:
 *
 *   SEGMENTAL  - the dot-below vowels ẹ / ọ (U+0323 combining dot below).
 *     These are different LETTERS, not accents. "ẹ" and "e" are distinct
 *     phonemes; folding them together loses real information.
 *
 *   TONAL      - acute (high), grave (low), macron (mid) and friends.
 *     Igala is a tone language, so these change meaning too, but community
 *     writing is systematically UNDER-marked for tone (see Context.md: the
 *     frozen-43 gold carries tone on 0.770 of answers while frontier baselines
 *     mark 1.000). A tone-blind comparison is therefore the honest way to ask
 *     "is this the same word, written with different tone practice?".
 *
 * Everything here is pure and Unicode-normalisation-safe: production text mixes
 * precomposed codepoints (ẹ = U+1EB9) with base+combining sequences (ẹ́ =
 * U+1EB9 + U+0301), because toned dotted vowels have no single precomposed
 * form. We always NFD first so both spellings behave identically.
 */

export { foldIgala } from "@/lib/annotations-query";

/**
 * Combining marks that encode TONE (and other non-segmental prosody) in
 * Igala/Yoruboid orthography. Written as escapes because bare combining marks
 * in source are invisible to review.
 *   U+0300 grave  U+0301 acute  U+0302 circumflex  U+0303 tilde
 *   U+0304 macron U+0306 breve  U+0309 hook above  U+030C caron
 */
const TONE_MARKS = /[̀́̂̃̄̆̉̌]/g;

/** Same class, non-global, for stateless `.test()` calls. */
const TONE_MARK_TEST = /[̀́̂̃̄̆̉̌]/;

/** U+0323 combining dot below - the SEGMENTAL mark that makes ẹ / ọ. */
const DOT_BELOW = "̣";

/** Every Unicode combining diacritical mark (U+0300-U+036F). */
const ALL_COMBINING = /[̀-ͯ]/g;

/**
 * Canonical form for comparison: NFC, whitespace collapsed, trimmed. Case is
 * preserved (callers lowercase when they want case-insensitivity) and every
 * diacritic is preserved. This is the "strictest" view of a string.
 */
export function normalizeText(text: string): string {
  return (text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Drop TONE marks but KEEP the dot-below vowels. Used for the "same word,
 * different tone marks" near-match: ẹ́gẹ and ẹgẹ fold together, but ẹgẹ and
 * ege do not.
 */
export function stripTones(text: string): string {
  return normalizeText(text)
    .normalize("NFD")
    .replace(TONE_MARKS, "")
    .normalize("NFC");
}

/** Tone-blind, case-blind comparison key. Dot-below vowels survive. */
export function toneFold(text: string): string {
  return stripTones(text).toLowerCase();
}

/**
 * Drop EVERY diacritic (tone and dot-below alike) and lowercase. Same folding
 * as `foldIgala` in src/lib/annotations-query.ts, restated here so the eval
 * layer names it for what it is: the loosest key, which deliberately throws
 * away real phonemic contrasts. Use only for coarse recall.
 */
export function fullFold(text: string): string {
  return normalizeText(text)
    .normalize("NFD")
    .replace(ALL_COMBINING, "")
    .toLowerCase();
}

/** True when the text carries at least one tone mark. */
export function hasTone(text: string): boolean {
  return TONE_MARK_TEST.test((text ?? "").normalize("NFD"));
}

/** True when the text carries at least one dot-below (ẹ / ọ) vowel. */
export function hasDotBelow(text: string): boolean {
  return (text ?? "").normalize("NFD").includes(DOT_BELOW);
}

/**
 * Word tokens: split on whitespace, strip leading/trailing punctuation but keep
 * letters, combining marks and inner apostrophes/hyphens (Igala compounds and
 * elisions use both). Empty tokens are dropped.
 */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 0);
}

/**
 * Character sequence used for chrF n-grams. sacrebleu's chrF removes ALL
 * whitespace before extracting character n-grams (so word boundaries never
 * produce spurious n-grams); we match that exactly for comparability with
 * published chrF numbers.
 */
export function charSequence(text: string): string[] {
  return Array.from(normalizeText(text).replace(/\s+/g, ""));
}
