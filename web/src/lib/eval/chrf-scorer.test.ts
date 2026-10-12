import { describe, it, expect, vi } from "vitest";
import {
  CHRF_DEFAULTS,
  CHRFPP_DEFAULTS,
  chrfFromProfiles,
  chrfMulti,
  chrfProfile,
  chrfSingle,
  chrfppSingle,
  createChrfScorer,
  type ChrfOptions,
} from "./chrf";
import { charSequence, tokenize } from "./normalize";

/**
 * chrF was split into "count one text's n-grams" (chrfProfile) and "score two
 * counted texts" (chrfFromProfiles) so a scoreboard can count each string
 * once (createChrfScorer). The metric must not have moved by a single bit:
 * every published number goes through it.
 *
 * The oracle below is chrfSingle exactly as it stood before that split
 * (commit e2f02ab), kept here so the claim "same number" is checked against
 * the old code and not against the new code's own idea of itself.
 *
 * All text is generated from z, q, x and v plus the orthography's marks: no
 * corpus text is in this file (the repository is public).
 */

// ─── the oracle: chrfSingle before the split ────────────────────────────────

function ngramCountsBefore(units: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  if (units.length < n) return counts;
  for (let i = 0; i + n <= units.length; i++) {
    const key = units.slice(i, i + n).join("\u0000");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function orderStatBefore(hypUnits: string[], refUnits: string[], n: number) {
  const hyp = ngramCountsBefore(hypUnits, n);
  const ref = ngramCountsBefore(refUnits, n);
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

function chrfSingleBefore(
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
  const stats = [];
  for (let n = 1; n <= charOrder; n++) {
    stats.push(orderStatBefore(hypChars, refChars, n));
  }
  for (let n = 1; n <= wordOrder; n++) {
    stats.push(orderStatBefore(hypWords, refWords, n));
  }
  const factor = beta * beta;
  let sum = 0;
  let effectiveOrders = 0;
  for (const s of stats) {
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

// ─── generated text ─────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const ONSETS = ["z", "q", "x", "v"];
const VOWELS = ["a", "e", "i", "o", "u", "ẹ", "ọ"];
/** None, grave, acute, macron, and a decomposed dot-below so precomposed and
 * combining spellings both occur. */
const MARKS = ["", "", "̀", "́", "̄", "̣"];
const JOINS = [" ", " ", "  ", ", ", ". ", "\n", "-", "'"];

function makeTexts(count: number): string[] {
  const r = rng(20261010);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const word = () => {
    let w = "";
    const syllables = 1 + Math.floor(r() * 3);
    for (let i = 0; i < syllables; i++) w += pick(ONSETS) + pick(VOWELS) + pick(MARKS);
    return r() < 0.15 ? w.toUpperCase() : w;
  };
  // The degenerate inputs first: empty, blank, one character, one mark.
  const texts = ["", "   ", "\n\t", "z", "́", "zz", "z z z z z z z"];
  const vocabulary = Array.from({ length: 40 }, word);
  while (texts.length < count) {
    // Mostly one word (the bank's median answer), sometimes a sentence or a
    // paragraph, drawn from a small vocabulary so n-grams really do repeat.
    const roll = r();
    const n = roll < 0.5 ? 1 : roll < 0.8 ? 2 + Math.floor(r() * 6) : 20 + Math.floor(r() * 60);
    let t = "";
    for (let i = 0; i < n; i++) t += (i ? pick(JOINS) : "") + pick(vocabulary);
    texts.push(r() < 0.1 ? ` ${t} ` : t);
  }
  return texts;
}

const TEXTS = makeTexts(45);
const OPTION_SETS: { label: string; options: ChrfOptions }[] = [
  { label: "chrF (defaults)", options: {} },
  { label: "chrF, beta 1", options: { beta: 1 } },
  { label: "chrF++", options: CHRFPP_DEFAULTS },
  { label: "char order 3", options: { charOrder: 3 } },
];

/** Every ordered pair, both roles: chrF is not symmetric at beta 2. */
function forEveryPair(fn: (h: string, r: string) => void) {
  for (const h of TEXTS) for (const r of TEXTS) fn(h, r);
}

describe("chrfSingle after the profile split", () => {
  it.each(OPTION_SETS)(
    "returns the same number as before, bit for bit - $label",
    ({ options }) => {
      let compared = 0;
      const moved: string[] = [];
      forEveryPair((h, r) => {
        compared++;
        const now = chrfSingle(h, r, options);
        const before = chrfSingleBefore(h, r, options);
        if (!Object.is(now, before)) moved.push(`${now} vs ${before}`);
      });
      expect(compared).toBe(TEXTS.length * TEXTS.length);
      expect(moved).toEqual([]);
    },
  );

  it("the generated texts cover the range of scores, not just 0 and 1", () => {
    const seen = new Set<number>();
    forEveryPair((h, r) => seen.add(chrfSingle(h, r)));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(1)).toBe(true);
    expect(seen.size).toBeGreaterThan(500);
  });
});

describe("chrfProfile + chrfFromProfiles", () => {
  it.each(OPTION_SETS)(
    "profiles counted once and reused in both roles give the same numbers - $label",
    ({ options }) => {
      const profiles = new Map(TEXTS.map((t) => [t, chrfProfile(t, options)]));
      const moved: string[] = [];
      forEveryPair((h, r) => {
        const reused = chrfFromProfiles(profiles.get(h)!, profiles.get(r)!, options);
        const before = chrfSingleBefore(h, r, options);
        if (!Object.is(reused, before)) moved.push(`${reused} vs ${before}`);
      });
      expect(moved).toEqual([]);
    },
  );

  it("does not tokenize words when no word order is asked for", () => {
    expect(chrfProfile("za qe xi").orders).toHaveLength(CHRF_DEFAULTS.charOrder);
    expect(chrfProfile("za qe xi", CHRFPP_DEFAULTS).orders).toHaveLength(
      CHRFPP_DEFAULTS.charOrder + CHRFPP_DEFAULTS.wordOrder,
    );
  });

  it("refuses to score two profiles counted at different orders", () => {
    const plain = chrfProfile("za qe xi");
    expect(() => chrfFromProfiles(plain, chrfProfile("za qe xi", CHRFPP_DEFAULTS))).toThrow(
      /different n-gram orders/,
    );
    expect(() => chrfFromProfiles(chrfProfile("za qe xi", { charOrder: 3 }), plain)).toThrow(
      /different n-gram orders/,
    );
  });
});

describe("createChrfScorer", () => {
  it.each(OPTION_SETS)(
    "single() is chrfSingle and multi() is chrfMulti, bit for bit - $label",
    ({ options }) => {
      const scorer = createChrfScorer(options);
      const moved: string[] = [];
      forEveryPair((h, r) => {
        if (!Object.is(scorer.single(h, r), chrfSingleBefore(h, r, options))) moved.push("single");
      });
      // Reference sets of every size, with repeats, including the empty set.
      const r = rng(7);
      for (let i = 0; i < 300; i++) {
        const h = TEXTS[Math.floor(r() * TEXTS.length)];
        const refs = Array.from({ length: Math.floor(r() * 6) }, () => TEXTS[Math.floor(r() * TEXTS.length)]);
        const a = scorer.multi(h, refs);
        const b = chrfMulti(h, refs, options);
        if (
          !Object.is(a.best, b.best) ||
          !Object.is(a.mean, b.mean) ||
          a.bestIndex !== b.bestIndex ||
          a.perReference.length !== b.perReference.length ||
          a.perReference.some((s, k) => !Object.is(s, b.perReference[k]))
        ) {
          moved.push("multi");
        }
      }
      expect(moved).toEqual([]);
    },
  );

  it("keeps the empty-reference rule: zeros and index -1, never a throw", () => {
    expect(createChrfScorer().multi("za", [])).toEqual({
      best: 0,
      mean: 0,
      bestIndex: -1,
      perReference: [],
    });
  });

  it("a chrF++ scorer scores as chrF++", () => {
    const scorer = createChrfScorer(CHRFPP_DEFAULTS);
    const h = "za qe xi vo";
    const r = "za xi qe vo";
    expect(Object.is(scorer.single(h, r), chrfppSingle(h, r))).toBe(true);
    expect(scorer.single(h, r)).not.toBe(createChrfScorer().single(h, r));
  });

  it("does no text processing at all for strings it has already counted", () => {
    // The whole point of the scorer. Every text is normalised exactly once on
    // its way to being counted (charSequence), so the number of normalize()
    // calls is a direct count of how many times text was processed.
    const a = TEXTS[TEXTS.length - 1];
    const b = TEXTS[TEXTS.length - 2];
    const c = TEXTS[TEXTS.length - 3];
    const spy = vi.spyOn(String.prototype, "normalize");
    try {
      const scorer = createChrfScorer();
      scorer.single(a, b);
      scorer.single(a, c);
      const afterFirstUse = spy.mock.calls.length;
      expect(afterFirstUse).toBeGreaterThan(0);

      // The same pairs again, the pairs with roles swapped (new pairs, old
      // strings), and the leave-one-out shape the scoreboard uses.
      for (let i = 0; i < 50; i++) {
        scorer.single(a, b);
        scorer.single(b, a);
        scorer.single(c, b);
        scorer.multi(a, [b, c]);
        scorer.multi(a, [c]);
        scorer.multi(a, [b]);
      }
      expect(spy.mock.calls.length).toBe(afterFirstUse);

      // The plain function has no memory, by contrast - which is what the
      // scoreboard used to pay for, 44,470 times per request.
      chrfSingle(a, b);
      expect(spy.mock.calls.length).toBeGreaterThan(afterFirstUse);
    } finally {
      spy.mockRestore();
    }
  });

  it("two scorers share nothing", () => {
    const first = createChrfScorer();
    const second = createChrfScorer({ beta: 1 });
    const h = "za qe xi";
    const r = "za xi";
    expect(Object.is(first.single(h, r), chrfSingle(h, r))).toBe(true);
    expect(Object.is(second.single(h, r), chrfSingle(h, r, { beta: 1 }))).toBe(true);
    expect(Object.is(first.single(h, r), chrfSingle(h, r))).toBe(true);
  });
});
