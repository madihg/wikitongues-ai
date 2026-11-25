/**
 * TONE MARKS, PRECISELY (tone-mark pass 2, Nov 2026).
 *
 * Igala writes tone with combining marks over a vowel (or over a syllabic
 * nasal). The dot below (U+0323) is vowel quality, not tone: it stays.
 * Detection always works on NFD (every mark is then its own code point);
 * storage is always NFC.
 *
 *   U+0301 acute       High
 *   U+0300 grave       Low
 *   U+0304 macron      Mid (when written; most writers leave Mid unmarked)
 *   U+030C caron       rising contour
 *   U+0302 circumflex  falling contour
 *   U+030B, U+030F     double acute, double grave (rare; kept as "other")
 *
 * An unmarked vowel is UNMARKED, never Mid: careful writers often write a
 * downstepped High as Mid, and most writers mark nothing at all
 * (tasks/igala-grammar-deduced.md, R8.3).
 *
 * Everything here is pure. Nothing reads or writes pass 1.
 */

export type ToneLabel = "H" | "L" | "M" | "R" | "F" | "X" | "U";

export const DOT_BELOW = "\u0323";

const TONE_OF: Record<string, ToneLabel> = {
  "\u0301": "H",
  "\u0300": "L",
  "\u0304": "M",
  "\u030C": "R",
  "\u0302": "F",
  "\u030B": "X",
  "\u030F": "X",
};

/** Every combining mark this module treats as a tone mark. */
export const TONE_MARKS: readonly string[] = Object.keys(TONE_OF);

const VOWELS = new Set("aeiouAEIOU".split(""));
const NASALS = new Set("nmNM".split(""));
// On a nasal only these are tone (a macron or a tilde on n is a letter
// variant of the engma, not a tone).
const NASAL_TONE = new Set(["\u0301", "\u0300", "\u030C", "\u0302"]);
const isMark = (ch: string) => /\p{M}/u.test(ch);

export interface Cluster {
  /** The base letter, as typed (case kept). */
  base: string;
  /** Combining marks that are not tone (the dot below, a tilde), in order. */
  marks: string[];
  /** Tone marks on this letter, in order. Empty when unmarked. */
  tone: string[];
  /** True for a vowel: a unit that always bears a tone. */
  vowel: boolean;
}

/** The text as letters with their marks, tone marks set apart. */
export function clusters(text: string): Cluster[] {
  const out: Cluster[] = [];
  for (const ch of text.normalize("NFD")) {
    const last = out[out.length - 1];
    if (isMark(ch) && last) {
      const toneBearing =
        last.vowel || (NASALS.has(last.base) && NASAL_TONE.has(ch));
      if (toneBearing && ch in TONE_OF) last.tone.push(ch);
      else last.marks.push(ch);
    } else {
      out.push({ base: ch, marks: [], tone: [], vowel: VOWELS.has(ch) });
    }
  }
  return out;
}

/** The text with its tone marks removed and everything else kept (the dot
 *  below, the engma, case, spacing, punctuation). NFC. */
export function stripTone(text: string): string {
  return clusters(text)
    .map((c) => c.base + c.marks.join(""))
    .join("")
    .normalize("NFC");
}

/** NFC, outer whitespace trimmed: the stored shape of a tone-marked text. */
export function storedTone(text: string): string {
  return text.normalize("NFC").trim();
}

function labelOf(tone: string[]): ToneLabel {
  if (tone.length === 0) return "U";
  if (tone.length > 1) return "X";
  return TONE_OF[tone[0]] ?? "X";
}

/**
 * The tone label of every tone-bearing unit, keyed by the unit's position
 * among the letters of the text. Two texts that differ only in tone marks
 * have the same letters at the same positions, so their labels line up by
 * key. Every vowel has an entry ("U" when unmarked); a nasal has one only
 * when it carries a tone mark.
 */
export function toneLabels(text: string): Map<number, ToneLabel> {
  const out = new Map<number, ToneLabel>();
  clusters(text).forEach((c, i) => {
    if (c.vowel || c.tone.length > 0) out.set(i, labelOf(c.tone));
  });
  return out;
}

export interface ToneStats {
  /** Vowels: the syllables that must bear a tone. */
  syllables: number;
  /** Tone-bearing units that carry a mark (vowels and syllabic nasals). */
  marked: number;
  /** marked / syllables, 0 when there is no vowel. Capped at 1. */
  share: number;
  hasTone: boolean;
  /** A dotted vowel is present (vowel quality is written). */
  dotted: boolean;
}

export function toneStats(text: string): ToneStats {
  let syllables = 0;
  let marked = 0;
  let dotted = false;
  for (const c of clusters(text)) {
    if (c.vowel) {
      syllables++;
      if (c.marks.includes(DOT_BELOW)) dotted = true;
    }
    if (c.tone.length > 0) marked++;
  }
  return {
    syllables,
    marked,
    share: syllables === 0 ? 0 : Math.min(1, marked / syllables),
    hasTone: marked > 0,
    dotted,
  };
}

/** "untoned" (no mark), "toned" (at least 9 syllables in 10 marked), or
 *  "partly" (anything between). */
export function toneState(text: string): "untoned" | "partly" | "toned" {
  const s = toneStats(text);
  if (!s.hasTone) return "untoned";
  return s.share >= 0.9 ? "toned" : "partly";
}

/**
 * THE TONE-ONLY GUARD. True when the second text differs from the first in
 * tone marks alone: with tone stripped from both (dot below kept), the two
 * are the same string. Unicode form never matters (precomposed or combining,
 * NFC or NFD), and neither does outer whitespace.
 */
export function isToneOnlyChange(pass1: string, pass2: string): boolean {
  return stripTone(pass1).trim() === stripTone(pass2).trim();
}

/**
 * True when the second text is the first with tone marks ADDED and nothing
 * else changed: the same letters (dot below included), every tone mark the
 * first text had still there on the same letter, and at least the same
 * marks. A mark changed or taken off is not an addition: in a tonal
 * language it can name another word. Used to keep a clip whose answer only
 * gained its tone marks after it was recorded (review of 2026-11-25).
 */
export function onlyAddsTone(before: string, after: string): boolean {
  if (!isToneOnlyChange(before, after)) return false;
  const a = clusters(before.normalize("NFC").trim());
  const b = clusters(after.normalize("NFC").trim());
  if (a.length !== b.length) return false;
  return a.every(
    (c, i) => c.tone.length === 0 || c.tone.join("") === b[i].tone.join(""),
  );
}

const tokens = (s: string) => s.split(/(\s+)/).filter((t) => t.length > 0);

/**
 * What the second text would be with every change that is NOT a tone mark
 * undone: the first text's words, carrying the second text's tone marks
 * wherever the word is otherwise the same. This is "Undo the other changes",
 * and it is what is stored as the tone text when a marker keeps a correction
 * (the correction itself is stored beside it, as a flag).
 *
 * Words are matched by a longest common subsequence over their tone-stripped
 * forms, so an inserted or deleted word does not shift the rest.
 */
export function projectToneOnto(pass1: string, pass2: string): string {
  const a = tokens(pass1.normalize("NFC").trim());
  const b = tokens(pass2.normalize("NFC").trim());
  const sa = a.map(stripTone);
  const sb = b.map(stripTone);
  // LCS table.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        sa[i] === sb[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [...a];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) {
      out[i] = b[j];
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return out.join("").normalize("NFC");
}

/** The words of a text, for "I am not sure about a word". */
export function wordsOf(text: string): string[] {
  return text.normalize("NFC").trim().split(/\s+/).filter(Boolean);
}
