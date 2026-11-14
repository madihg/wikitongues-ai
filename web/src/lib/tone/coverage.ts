import {
  clusters,
  DOT_BELOW,
  stripTone,
  toneLabels,
  toneState,
  wordsOf,
  type ToneLabel,
} from "@/lib/tone/tone";

/**
 * WHAT A REPRESENTATIVE TONE SET MUST COVER (tone-mark pass 2, step 2).
 *
 * An answer is described by the coverage cells it fills: which tones it
 * writes on which vowels, which tone sequences, nasals, digraphs, elision,
 * the grammatical monosyllables, its length, its prompt bucket, its writer
 * and dialect. The set is the smallest group of answers that fills every
 * cell found in the data, padded so each thin cell has at least three.
 *
 * Pure. The words of homograph families are never written in this file:
 * they are found in the data (a spelling that carries two or more different
 * tone or dot patterns across answers) and passed in.
 */

const VOWEL_KEY: Record<string, string> = {
  a: "a",
  e: "e",
  i: "i",
  o: "o",
  u: "u",
};
const DIGRAPHS = ["kp", "gb", "ny", "nw", "ch", "gw", "kw", "ng"] as const;
/** Grammatical monosyllables that carry most of the tone marks people do
 *  write (tasks/igala-grammar-deduced.md, R8.3), folded to bare letters. */
const MONOSYLLABLES = ["ki", "chi", "ka", "du", "mi"] as const;
const LEVELS: ToneLabel[] = ["H", "L", "M"];

/** A word with tone, dots and every other mark removed, lower case, letters
 *  only: the key two spellings of one word share. */
export function foldWord(word: string): string {
  return clusters(word)
    .map((c) => c.base)
    .join("")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const LOAN_HINT = /[qxvz]|th|sh|ph|tion$|ity$|ology$/;

export interface CoverageMeta {
  bucket?: string | null;
  dialect?: string | null;
  /** An anonymous label for the writer ("W1"), never a name. */
  writer?: string | null;
  /** Folded stems of homograph families found in the data. */
  homographs?: ReadonlySet<string>;
}

/** The coverage cells one answer fills. */
export function coverageCells(text: string, meta: CoverageMeta = {}): string[] {
  const cells = new Set<string>();
  const words = wordsOf(text);

  for (const c of clusters(text)) {
    if (c.vowel && c.tone.length === 1) {
      const label = [...toneLabels(c.base + c.tone[0]).values()][0];
      const key =
        VOWEL_KEY[c.base.toLowerCase()] +
        (c.marks.includes(DOT_BELOW) ? "-dot" : "");
      if (LEVELS.includes(label)) cells.add(`tone:${label}:${key}`);
      if (label === "R" || label === "F") cells.add(`contour:${label}`);
    }
    if (!c.vowel && c.tone.length > 0) cells.add("nasal:syllabic");
    // The engma: n with a tilde, a dot above or a macron.
    if (
      c.base.toLowerCase() === "n" &&
      c.marks.some((m) => m === "\u0303" || m === "\u0307" || m === "\u0304")
    ) {
      cells.add("nasal:engma");
    }
  }

  for (const w of words) {
    const folded = foldWord(w);
    if (!folded) continue;
    const labels = [...toneLabels(w).values()];
    const marked = labels.every((l) => l !== "U");
    if (marked && labels.length === 2) cells.add(`seq2:${labels.join("")}`);
    if (marked && labels.length === 3) cells.add("seq3:fully-marked");
    for (const d of DIGRAPHS) if (folded.includes(d)) cells.add(`digraph:${d}`);
    if (/\p{L}['\u2019]\p{L}/u.test(w)) cells.add("elision");
    // The clause-final negation nasal, written attached ("-n") or alone.
    const bare = stripTone(w)
      .toLowerCase()
      .replace(/[.,;:!?"]+$/, "");
    if (/-n$/.test(bare) || bare === "n") cells.add("nasal:final");
    if ((MONOSYLLABLES as readonly string[]).includes(folded)) {
      cells.add(`mono:${folded}`);
    }
    if (meta.homographs?.has(folded)) cells.add(`homograph:${folded}`);
    if (folded.length >= 6 && LOAN_HINT.test(folded)) cells.add("loanword");
  }

  cells.add(
    words.length <= 1
      ? "length:word"
      : words.length <= 8
        ? "length:short"
        : "length:long",
  );
  cells.add(`state:${toneState(text)}`);
  if (meta.bucket) cells.add(`bucket:${meta.bucket}`);
  cells.add(`dialect:${meta.dialect || "none"}`);
  if (meta.writer) cells.add(`writer:${meta.writer}`);
  return [...cells].sort();
}

/**
 * Homograph families in the data: a folded word that is written with two or
 * more different tone or dot patterns across the answers, in at least
 * `minAnswers` answers. The most varied come first.
 */
export function findHomographs(
  texts: string[],
  options: { minAnswers?: number; minSpellings?: number; max?: number } = {},
): { stem: string; spellings: number; answers: number }[] {
  const { minAnswers = 3, minSpellings = 2, max = 12 } = options;
  const spellings = new Map<string, Set<string>>();
  const answers = new Map<string, number>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const w of wordsOf(text)) {
      const folded = foldWord(w);
      if (folded.length < 2) continue;
      // The spelling as written, without case or punctuation.
      const spelling = w
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}]/gu, "");
      // A bare spelling says nothing about tone or dots: it is not a variant.
      if (spelling === folded) {
        seen.add(folded);
        continue;
      }
      spellings.set(folded, (spellings.get(folded) ?? new Set()).add(spelling));
      seen.add(folded);
    }
    for (const f of seen) answers.set(f, (answers.get(f) ?? 0) + 1);
  }
  return [...spellings.entries()]
    .map(([stem, set]) => ({
      stem,
      spellings: set.size,
      answers: answers.get(stem) ?? 0,
    }))
    .filter((h) => h.spellings >= minSpellings && h.answers >= minAnswers)
    .sort(
      (a, b) =>
        b.spellings - a.spellings ||
        b.answers - a.answers ||
        a.stem.localeCompare(b.stem),
    )
    .slice(0, max);
}

export interface Candidate {
  id: string;
  cells: string[];
  /** "untoned" and "partly" are preferred: they have the most to gain. */
  state: "untoned" | "partly" | "toned";
}

export interface ChosenSet {
  ids: string[];
  /** The same ids in the order they were picked: the first N fill the most
   *  cells N answers can, which is what a first batch should be. */
  order: string[];
  /** For each cell: how many chosen answers fill it, how many exist. */
  cells: {
    cell: string;
    chosen: number;
    available: number;
    examples: string[];
  }[];
  /** Cells with fewer than `minPerCell` answers in the whole data. */
  thin: string[];
}

const STATE_RANK = { untoned: 0, partly: 1, toned: 2 } as const;

/**
 * The smallest set that fills every cell (greedy set cover), then padded so
 * every cell has at least `minPerCell` answers where the data has them.
 * Ties go to the answer with less tone written, then to the lower id, so the
 * same data always gives the same set.
 */
export function chooseSet(candidates: Candidate[], minPerCell = 3): ChosenSet {
  const byCell = new Map<string, Candidate[]>();
  for (const c of candidates) {
    for (const cell of c.cells) {
      byCell.set(cell, [...(byCell.get(cell) ?? []), c]);
    }
  }
  const order = (a: Candidate, b: Candidate) =>
    STATE_RANK[a.state] - STATE_RANK[b.state] || a.id.localeCompare(b.id);
  const chosen = new Map<string, Candidate>();
  const count = new Map<string, number>();
  const take = (c: Candidate) => {
    if (chosen.has(c.id)) return;
    chosen.set(c.id, c);
    for (const cell of c.cells) count.set(cell, (count.get(cell) ?? 0) + 1);
  };

  // 1. Cover: always the answer that fills the most cells still empty.
  const uncovered = new Set(byCell.keys());
  while (uncovered.size > 0) {
    let best: Candidate | null = null;
    let bestGain = 0;
    for (const c of candidates) {
      if (chosen.has(c.id)) continue;
      const gain = c.cells.filter((cell) => uncovered.has(cell)).length;
      if (
        gain > bestGain ||
        (gain === bestGain && gain > 0 && best && order(c, best) < 0)
      ) {
        best = c;
        bestGain = gain;
      }
    }
    if (!best) break;
    take(best);
    for (const cell of best.cells) uncovered.delete(cell);
  }

  // 2. Pad: each cell up to the minimum, thinnest cells first.
  const cells = [...byCell.keys()].sort(
    (a, b) =>
      (byCell.get(a)?.length ?? 0) - (byCell.get(b)?.length ?? 0) ||
      a.localeCompare(b),
  );
  for (const cell of cells) {
    const pool = [...(byCell.get(cell) ?? [])].sort(order);
    for (const c of pool) {
      if ((count.get(cell) ?? 0) >= minPerCell) break;
      take(c);
    }
  }

  return {
    ids: [...chosen.keys()].sort(),
    order: [...chosen.keys()],
    cells: [...byCell.keys()].sort().map((cell) => ({
      cell,
      chosen: count.get(cell) ?? 0,
      available: byCell.get(cell)?.length ?? 0,
      examples: (byCell.get(cell) ?? [])
        .filter((c) => chosen.has(c.id))
        .sort(order)
        .slice(0, 3)
        .map((c) => c.id),
    })),
    thin: [...byCell.entries()]
      .filter(([, list]) => list.length < minPerCell)
      .map(([cell]) => cell)
      .sort(),
  };
}

/** Every cell the brief asks for that can be named ahead of the data. Used
 *  to report the cells that are EMPTY in the data. */
export const EXPECTED_CELLS: string[] = [
  ...LEVELS.flatMap((l) =>
    ["a", "e", "e-dot", "i", "o", "o-dot", "u"].map((v) => `tone:${l}:${v}`),
  ),
  "contour:R",
  "contour:F",
  "seq2:HH",
  "seq2:HL",
  "seq2:LH",
  "seq2:LL",
  "seq3:fully-marked",
  "nasal:engma",
  "nasal:syllabic",
  "nasal:final",
  ...DIGRAPHS.map((d) => `digraph:${d}`),
  "elision",
  ...MONOSYLLABLES.map((m) => `mono:${m}`),
  "loanword",
  "length:word",
  "length:short",
  "length:long",
];
