import { normaliseForScoring } from "./normalise";

/**
 * Speech scores: CER, WER (tone-stripped and tone-retained) and TER. One
 * definition for the whole programme (PRD US-018). The Python port in
 * worker/igala_speech/metrics.py gives the same numbers on the shared
 * fixture, metrics.fixtures.json; change the two together.
 *
 * Every text goes through normaliseForScoring first: NFC, lower case,
 * punctuation removed, contraction table applied. Then:
 *
 *   cer             character edit distance / reference characters, on
 *                   tone-stripped text. Spaces count as characters.
 *   wer             word edit distance / reference words, tone-stripped.
 *   werToneRetained the same, with tone marks kept: a word whose mark differs
 *                   is a wrong word.
 *   toneErrorRate   Take the tone-retained texts and split each into letters
 *                   (a base character with its combining marks). Line up the
 *                   reference and hypothesis letters ignoring tone marks, by
 *                   edit-distance alignment. Look at every reference vowel
 *                   (a e i o u, dotted ones included) that carries a tone
 *                   mark. It is right when the aligned hypothesis letter is
 *                   the same vowel with the same tone mark. It is wrong when
 *                   the mark differs, is missing, or the vowel was deleted
 *                   or replaced. TER is wrong / marked. A reference with no
 *                   marked vowel scores 0.
 *
 * Edge rules: an empty reference scores 0 against an empty hypothesis and 1
 * against anything else. Scores are not clamped, so a hypothesis with many
 * insertions can score above 1. English words the speaker keeps as English
 * are scored as written, never corrected.
 */

const TONE_MARKS_NO_TILDE = new Set([
  "̀",
  "́",
  "̂",
  "̄",
  "̆",
  "̉",
  "̌",
]);
const TILDE = "̃";
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export interface Scores {
  cer: number;
  werStripped: number;
  werRetained: number;
  ter: number;
}

/** Levenshtein distance between two sequences, two rows of memory. */
function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        prev[j] + 1,
        cur[j - 1] + 1,
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function rate(ref: string[], hyp: string[]): number {
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

const chars = (s: string) => Array.from(s);
const words = (s: string) => (s === "" ? [] : s.split(" "));

export function cer(ref: string, hyp: string): number {
  const opt = { tones: "strip" } as const;
  return rate(
    chars(normaliseForScoring(ref, opt)),
    chars(normaliseForScoring(hyp, opt)),
  );
}

export function wer(ref: string, hyp: string): number {
  const opt = { tones: "strip" } as const;
  return rate(
    words(normaliseForScoring(ref, opt)),
    words(normaliseForScoring(hyp, opt)),
  );
}

export function werToneRetained(ref: string, hyp: string): number {
  return rate(
    words(normaliseForScoring(ref)),
    words(normaliseForScoring(hyp)),
  );
}

interface Unit {
  /** Base character plus its letter marks (dot below, tilde on n). */
  key: string;
  /** Tone marks on this character, sorted. */
  tone: string;
}

function units(text: string): Unit[] {
  const out: { key: string; tone: string }[] = [];
  for (const ch of text.normalize("NFD")) {
    const isMark = /\p{M}/u.test(ch);
    const last = out[out.length - 1];
    if (!isMark || !last) {
      out.push({ key: ch, tone: "" });
    } else if (
      TONE_MARKS_NO_TILDE.has(ch) ||
      (ch === TILDE && !/^[nN]/.test(last.key))
    ) {
      last.tone += ch;
    } else {
      last.key += ch;
    }
  }
  return out.map((u) => ({ key: u.key, tone: [...u.tone].sort().join("") }));
}

/**
 * Levenshtein alignment. For each reference index, the matching hypothesis
 * index, or -1 when that unit was deleted or substituted. Ties go to the
 * diagonal, then deletion, then insertion (the Python port does the same).
 */
function align(ref: string[], hyp: string[]): number[] {
  const n = ref.length;
  const m = hyp.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      );
    }
  }
  const match = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = ref[i - 1] === hyp[j - 1];
      if (d[i][j] === d[i - 1][j - 1] + (same ? 0 : 1)) {
        if (same) match[i - 1] = j - 1;
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return match;
}

export function toneErrorRate(ref: string, hyp: string): number {
  const r = units(normaliseForScoring(ref));
  const h = units(normaliseForScoring(hyp));
  const match = align(
    r.map((u) => u.key),
    h.map((u) => u.key),
  );
  let marked = 0;
  let wrong = 0;
  r.forEach((u, i) => {
    if (!VOWELS.has(u.key[0]) || u.tone === "") return;
    marked++;
    if (match[i] < 0 || h[match[i]].tone !== u.tone) wrong++;
  });
  return marked === 0 ? 0 : wrong / marked;
}

export function scoreAll(ref: string, hyp: string): Scores {
  return {
    cer: cer(ref, hyp),
    werStripped: wer(ref, hyp),
    werRetained: werToneRetained(ref, hyp),
    ter: toneErrorRate(ref, hyp),
  };
}
