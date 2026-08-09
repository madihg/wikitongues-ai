import { describe, it, expect } from "vitest";
import {
  chrfSingle,
  chrfMulti,
  chrfppSingle,
  chrfppMulti,
  CHRF_DEFAULTS,
  CHRFPP_DEFAULTS,
} from "./chrf";

describe("chrfSingle - hand-computed reference values", () => {
  // hyp "ab" vs ref "abc", char order 2, no word n-grams.
  //   order 1: hyp {a,b} = 2, ref {a,b,c} = 3, matches 2
  //            P = 2/2 = 1, R = 2/3
  //   order 2: hyp {ab} = 1, ref {ab,bc} = 2, matches 1
  //            P = 1/1 = 1, R = 1/2
  it("matches the F1 (beta=1) value computed by hand", () => {
    // order1 F1 = 2*1*(2/3)/(1+2/3)   = 0.8
    // order2 F1 = 2*1*0.5/(1+0.5)     = 0.666666...
    // mean over 2 effective orders    = 0.733333...
    const score = chrfSingle("ab", "abc", {
      charOrder: 2,
      wordOrder: 0,
      beta: 1,
    });
    expect(score).toBeCloseTo(0.7333333, 6);
  });

  it("matches the F2 (beta=2, Popovic default) value computed by hand", () => {
    // factor = 4
    // order1: (5 * 1 * 2/3) / (4*1 + 2/3) = 3.33333 / 4.66667 = 0.7142857
    // order2: (5 * 1 * 0.5) / (4*1 + 0.5) = 2.5     / 4.5     = 0.5555556
    // mean                                                     = 0.6349206
    const score = chrfSingle("ab", "abc", {
      charOrder: 2,
      wordOrder: 0,
      beta: 2,
    });
    expect(score).toBeCloseTo(0.6349206, 6);
  });
});

describe("chrfSingle - properties", () => {
  it("scores identical strings 1", () => {
    expect(chrfSingle("ọ̀dudu", "ọ̀dudu")).toBeCloseTo(1, 10);
  });

  it("scores fully disjoint strings 0", () => {
    expect(chrfSingle("xxxx", "qqqq")).toBe(0);
  });

  it("defines two empty strings as identical and one empty as 0", () => {
    expect(chrfSingle("", "")).toBe(1);
    expect(chrfSingle("", "abc")).toBe(0);
    expect(chrfSingle("abc", "")).toBe(0);
  });

  it("is symmetric at beta=1 and asymmetric at beta=2", () => {
    const opts = { charOrder: 6, wordOrder: 0 };
    const f1a = chrfSingle("abcd", "abcdef", { ...opts, beta: 1 });
    const f1b = chrfSingle("abcdef", "abcd", { ...opts, beta: 1 });
    expect(f1a).toBeCloseTo(f1b, 10);

    // beta=2 weights RECALL, so the short hypothesis (which misses reference
    // material) must score lower than the long one (which covers it all).
    const short = chrfSingle("abcd", "abcdef", { ...opts, beta: 2 });
    const long = chrfSingle("abcdef", "abcd", { ...opts, beta: 2 });
    expect(short).toBeLessThan(long);
  });

  it("ignores whitespace when building character n-grams", () => {
    expect(chrfSingle("a b c", "abc")).toBeCloseTo(1, 10);
  });

  it("clips matches so repeating a character cannot inflate precision", () => {
    const honest = chrfSingle("aaa", "aaa", { charOrder: 1, wordOrder: 0 });
    const padded = chrfSingle("aaaaaaaaa", "aaa", {
      charOrder: 1,
      wordOrder: 0,
    });
    expect(honest).toBe(1);
    expect(padded).toBeLessThan(1);
  });

  it("skips orders where either side has no n-grams (short strings)", () => {
    // "ab" has no char 6-grams; without effective-order handling this would be
    // dragged toward 0 rather than scoring a clean 1 against itself.
    expect(chrfSingle("ab", "ab", CHRF_DEFAULTS)).toBeCloseTo(1, 10);
  });

  it("treats a tone-mark difference as a NEAR miss, not a total miss", () => {
    // ẹ́gẹ vs ẹgẹ - the dominant near-miss class in this corpus.
    const near = chrfSingle("ẹ́gẹ", "ẹgẹ");
    const far = chrfSingle("mmmm", "ẹgẹ");
    expect(far).toBe(0);
    expect(near).toBeGreaterThan(0.4);
  });

  it("DOCUMENTS the cost of a tone mark on a short word (a known limitation)", () => {
    // A combining tone mark is its own character unit, so on a 3-letter word a
    // single extra mark costs roughly half the chrF. Pinned deliberately: this
    // is why exact/tone-insensitive match rates are reported ALONGSIDE chrF,
    // and why chrF alone must not be read as "how correct is the Igala".
    expect(chrfSingle("ẹ́gẹ", "ẹgẹ")).toBeCloseTo(0.464015, 5);
    // The same mark on a longer string costs far less.
    expect(chrfSingle("ọ́ma lẹ a jẹ ñwu", "ọma lẹ a jẹ ñwu")).toBeGreaterThan(
      0.85,
    );
  });
});

describe("chrf++ (word n-grams)", () => {
  it("scores identical text 1, like chrF", () => {
    expect(chrfppSingle("iye lẹ a jẹ", "iye lẹ a jẹ")).toBeCloseTo(1, 10);
  });

  it("punishes wrong word segmentation, which chrF alone cannot see", () => {
    // Same characters, different word boundaries. chrF strips whitespace so it
    // is blind to this; chrF++'s word n-grams are not. This is the whole reason
    // to carry chrF++ alongside chrF for multi-word Igala answers.
    const plain = chrfSingle("iyelea jẹ", "iye lẹ a jẹ", CHRF_DEFAULTS);
    const plusplus = chrfppSingle("iyelea jẹ", "iye lẹ a jẹ");
    expect(plusplus).toBeLessThan(plain);
  });

  it("rewards recovering word order over scrambling it", () => {
    const ordered = chrfppSingle("iye lẹ a jẹ", "iye lẹ a jẹ ñwu");
    const scrambled = chrfppSingle("jẹ a lẹ iye", "iye lẹ a jẹ ñwu");
    expect(ordered).toBeGreaterThan(scrambled);
  });

  it("uses the documented defaults", () => {
    expect(CHRF_DEFAULTS).toEqual({ charOrder: 6, wordOrder: 0, beta: 2 });
    expect(CHRFPP_DEFAULTS).toEqual({ charOrder: 6, wordOrder: 2, beta: 2 });
  });
});

describe("chrfMulti", () => {
  const refs = ["ọdudu", "ódùdù", "wọla ọdudu"];

  it("returns the best matching reference and its index", () => {
    const r = chrfMulti("ọdudu", refs);
    expect(r.bestIndex).toBe(0);
    expect(r.best).toBeCloseTo(1, 10);
  });

  it("reports a mean that is never above the best", () => {
    const r = chrfMulti("ọdudu", refs);
    expect(r.mean).toBeLessThanOrEqual(r.best);
    expect(r.perReference).toHaveLength(3);
  });

  it("returns zeros for an empty reference set rather than throwing", () => {
    const r = chrfMulti("anything", []);
    expect(r).toEqual({ best: 0, mean: 0, bestIndex: -1, perReference: [] });
    expect(chrfppMulti("anything", []).best).toBe(0);
  });
});
