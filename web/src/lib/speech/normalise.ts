import orthography from "./orthography.json";

/**
 * One normaliser for every speech score (PRD US-005, FR-5): tone-stripped and
 * tone-retained numbers both come from here, so ASR and TTS results are
 * computed the same way. Pure, Unicode-safe, and independent of the text
 * eval layer so the lab can be removed without touching it.
 *
 * Igala carries two kinds of diacritic and they are NOT the same thing:
 *   - SEGMENTAL: dot-below (U+0323), as in the vowels with a dot below and
 *     the dotted n. These are LETTERS. They are never stripped.
 *   - TONAL: grave, acute, circumflex, macron, breve, hook above, caron.
 *     Stripped by toneStrip, kept by the tone-retained view.
 * The tilde (U+0303) is stripped as a tone mark EXCEPT on n/N, where
 * n + tilde is a letter in this orthography. Whether other tilde uses are
 * tone is part of the pending ruling; revisit with orthography.json.
 *
 * Marks are written as escapes because bare combining marks are invisible in
 * review.
 */

/** Tone marks: grave, acute, circumflex, macron, breve, hook above, caron. */
const TONE_MARKS_NO_TILDE = /[\u0300\u0301\u0302\u0304\u0306\u0309\u030C]/g;
/** Tilde, only when it does not sit directly on n or N (that is a letter). */
const TILDE_NOT_ON_N = /(?<![nN]\u0323?)\u0303/g;

/** The version string of the conventions in force; stored on new rows (FR-7). */
export const ORTHOGRAPHY_VERSION: string = orthography.version;

/** Variant spelling -> canonical spelling. Empty until the ruling lands. */
export type ContractionTable = Readonly<Record<string, string>>;

/**
 * Remove tone marks, keep every letter. Dot-below vowels and the dotted n
 * survive; everything else about the text is returned as NFC. Case,
 * punctuation and spacing are untouched (this is not the scoring form).
 */
export function toneStrip(text: string): string {
  // NFD first so precomposed toned letters (and toned dotted vowels, which
  // have no single codepoint) decompose to base + marks. Strip the tilde
  // before removing the other marks: a tilde on n must still see its n.
  return (text ?? "")
    .normalize("NFD")
    .replace(TILDE_NOT_ON_N, "")
    .replace(TONE_MARKS_NO_TILDE, "")
    .normalize("NFC");
}

export interface NormaliseOptions {
  /** "strip" removes tone marks (the tone-stripped score); default "keep". */
  tones?: "keep" | "strip";
  /** Override the contraction table (tests); default is orthography.json. */
  contractions?: ContractionTable;
}

/** Curly and modifier apostrophes folded to the plain one. */
const APOSTROPHES = /[\u2019\u2018\u02BC\u02BB]/g;
/** Punctuation and symbols, except the apostrophe and hyphen kept inside words. */
const PUNCT_EXCEPT_JOINERS = /(?!['-])[\p{P}\p{S}]/gu;
/** Apostrophes and hyphens left hanging at a word's edge. */
const EDGE_JOINERS = /^['-]+|['-]+$/g;

/** The same canonicalisation applied to table keys and to text tokens. */
function canon(text: string): string {
  return text
    .normalize("NFC")
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .normalize("NFC");
}

/**
 * The scoring form: NFC, lower case, punctuation removed, whitespace
 * collapsed, then the agreed contraction spellings applied word by word.
 * Inner apostrophes and hyphens stay (elisions and compounds use both), so a
 * word is never split by punctuation it owns. Letters, including dotted
 * vowels and the dotted n, are never altered; tone marks are kept unless
 * `tones: "strip"`. With an empty contraction table the result is the plain
 * normalised text, untouched by any spelling rule.
 */
export function normaliseForScoring(
  text: string,
  options: NormaliseOptions = {},
): string {
  const table =
    options.contractions ?? (orthography.contractions as ContractionTable);
  let t = canon(text ?? "");
  if (options.tones === "strip") t = toneStrip(t);
  t = t.replace(PUNCT_EXCEPT_JOINERS, " ");
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(EDGE_JOINERS, ""))
    .filter((w) => w.length > 0);

  const keys = Object.keys(table);
  if (keys.length === 0) return words.join(" ");

  // Keys and values go through the same canonicalisation (and tone strip when
  // scoring tone-stripped) so a table written with tone marks still matches.
  const map = new Map<string, string>();
  for (const k of keys) {
    let from = canon(k);
    let to = canon(table[k]);
    if (options.tones === "strip") {
      from = toneStrip(from);
      to = toneStrip(to);
    }
    map.set(from, to);
  }
  return words.map((w) => map.get(w) ?? w).join(" ");
}
