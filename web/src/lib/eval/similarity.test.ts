import { describe, it, expect } from "vitest";
import {
  exactMatch,
  toneInsensitiveMatch,
  toneVariantMatch,
  foldedMatch,
  editDistance,
  tokenEditSimilarity,
  tokenEditSimilarityToneBlind,
  matchKinds,
} from "./similarity";

describe("exactMatch", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(exactMatch("  Ọkuku ", "ọkuku")).toBe(true);
  });

  it("treats precomposed and decomposed spellings as equal", () => {
    expect(exactMatch("á", "á")).toBe(true);
  });

  it("does NOT ignore a tone mark", () => {
    expect(exactMatch("ẹ́gẹ", "ẹgẹ")).toBe(false);
  });

  it("does NOT ignore the dotted vowel", () => {
    expect(exactMatch("ọkuku", "okuku")).toBe(false);
  });
});

describe("toneInsensitiveMatch / toneVariantMatch", () => {
  it("folds tone spellings of the same word together", () => {
    expect(toneInsensitiveMatch("ẹ́gẹ", "ẹgẹ")).toBe(true);
  });

  it("keeps the dotted/undotted contrast", () => {
    expect(toneInsensitiveMatch("ọkuku", "okuku")).toBe(false);
  });

  it("toneVariantMatch fires ONLY on the near-miss, not on an exact match", () => {
    expect(toneVariantMatch("ẹ́gẹ", "ẹgẹ")).toBe(true);
    expect(toneVariantMatch("ẹgẹ", "ẹgẹ")).toBe(false);
    expect(toneVariantMatch("ẹgẹ", "ege")).toBe(false);
  });
});

describe("foldedMatch", () => {
  it("is the loosest level and folds the dotted vowel away too", () => {
    expect(foldedMatch("ọ́kuku", "okuku")).toBe(true);
    // ... which is exactly why it OVERSTATES correctness and is reported as an
    // upper bound only.
    expect(exactMatch("ọ́kuku", "okuku")).toBe(false);
  });
});

describe("editDistance", () => {
  it("handles the classic cases", () => {
    expect(editDistance([], [])).toBe(0);
    expect(editDistance(["a"], [])).toBe(1);
    expect(editDistance([], ["a", "b"])).toBe(2);
    expect(editDistance(["a", "b", "c"], ["a", "b", "c"])).toBe(0);
    expect(editDistance(["a", "b", "c"], ["a", "x", "c"])).toBe(1);
    expect(
      editDistance(
        ["k", "i", "t", "t", "e", "n"],
        ["s", "i", "t", "t", "i", "n", "g"],
      ),
    ).toBe(3);
  });

  it("is symmetric", () => {
    const a = ["ọwa", "lẹ", "a", "jẹ"];
    const b = ["ige", "lẹ", "a", "jẹ", "ñwu"];
    expect(editDistance(a, b)).toBe(editDistance(b, a));
  });
});

describe("tokenEditSimilarity", () => {
  it("is 1 for identical token sequences and 0 for fully disjoint ones", () => {
    expect(tokenEditSimilarity("ọwa lẹ a jẹ", "ọwa lẹ a jẹ")).toBe(1);
    expect(tokenEditSimilarity("x y", "p q")).toBe(0);
  });

  it("normalises by the LONGER sequence so length differences cost", () => {
    // 4 tokens vs 5, one substitution + one insertion -> 2/5 wrong.
    expect(tokenEditSimilarity("ọwa lẹ a jẹ", "ige lẹ a jẹ ñwu")).toBeCloseTo(
      1 - 2 / 5,
      10,
    );
  });

  it("defines two empty strings as identical", () => {
    expect(tokenEditSimilarity("", "")).toBe(1);
    expect(tokenEditSimilarity("", "abc")).toBe(0);
  });

  it("tone-blind variant forgives tone but not word choice", () => {
    expect(tokenEditSimilarity("ọ́wa lẹ", "ọwa lẹ")).toBeCloseTo(0.5, 10);
    expect(tokenEditSimilarityToneBlind("ọ́wa lẹ", "ọwa lẹ")).toBe(1);
    expect(tokenEditSimilarityToneBlind("ige lẹ", "ọwa lẹ")).toBeCloseTo(
      0.5,
      10,
    );
  });
});

describe("matchKinds", () => {
  it("reports all three strictness levels at once", () => {
    expect(matchKinds("ẹ́gẹ", "ẹgẹ")).toEqual({
      exact: false,
      toneVariant: true,
      folded: true,
    });
    expect(matchKinds("ọkuku", "ọkuku")).toEqual({
      exact: true,
      toneVariant: false,
      folded: true,
    });
    expect(matchKinds("imoto", "ọkuku")).toEqual({
      exact: false,
      toneVariant: false,
      folded: false,
    });
  });
});
