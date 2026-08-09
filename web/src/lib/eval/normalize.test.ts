import { describe, it, expect } from "vitest";
import {
  normalizeText,
  stripTones,
  toneFold,
  fullFold,
  hasTone,
  hasDotBelow,
  tokenize,
  charSequence,
  foldIgala,
} from "./normalize";

// Real shapes from production text. Written as escapes so the test asserts on
// codepoints, not on whatever the editor renders.
const E_DOT = "ẹ"; // ẹ  precomposed
const O_DOT = "ọ"; // ọ  precomposed
const ACUTE = "́";
const GRAVE = "̀";
const E_DOT_ACUTE = `${E_DOT}${ACUTE}`; // ẹ́ - no single precomposed codepoint

describe("normalizeText", () => {
  it("collapses whitespace and trims but keeps every diacritic", () => {
    expect(normalizeText(`  ${E_DOT_ACUTE}g${E_DOT}   n  `)).toBe(
      `${E_DOT_ACUTE}g${E_DOT} n`,
    );
  });

  it("makes precomposed and decomposed spellings compare equal", () => {
    const precomposed = "á"; // á
    const decomposed = `a${ACUTE}`;
    expect(normalizeText(precomposed)).toBe(normalizeText(decomposed));
  });
});

describe("stripTones / toneFold", () => {
  it("removes tone marks but keeps the dotted vowel", () => {
    expect(stripTones(`${E_DOT_ACUTE}g${E_DOT}`)).toBe(`${E_DOT}g${E_DOT}`);
  });

  it("folds two tone spellings of the same word together", () => {
    expect(toneFold(`${E_DOT_ACUTE}g${E_DOT}`)).toBe(
      toneFold(`${E_DOT}g${E_DOT}${GRAVE}`),
    );
  });

  it("does NOT fold the dotted/undotted vowel contrast", () => {
    expect(toneFold(`${E_DOT}g${E_DOT}`)).not.toBe(toneFold("ege"));
  });

  it("is case-insensitive", () => {
    expect(toneFold(`${O_DOT}dudu`)).toBe(toneFold(`Ọ` + "dudu"));
  });
});

describe("fullFold", () => {
  it("strips every diacritic including the dot below", () => {
    expect(fullFold(`${E_DOT_ACUTE}g${E_DOT}`)).toBe("ege");
  });

  it("agrees with foldIgala, the shared search folding", () => {
    const sample = `${O_DOT}ma l${E_DOT} a j${E_DOT} ñwu`;
    expect(fullFold(sample)).toBe(foldIgala(sample).replace(/\s+/g, " "));
  });
});

describe("hasTone / hasDotBelow", () => {
  it("detects a combining tone mark on a dotted vowel", () => {
    expect(hasTone(E_DOT_ACUTE)).toBe(true);
    expect(hasDotBelow(E_DOT_ACUTE)).toBe(true);
  });

  it("does not confuse the dot below with a tone mark", () => {
    expect(hasTone(E_DOT)).toBe(false);
    expect(hasDotBelow(E_DOT)).toBe(true);
  });

  it("is stateless across repeated calls (no lastIndex leak)", () => {
    expect(hasTone("á")).toBe(true);
    expect(hasTone("á")).toBe(true);
    expect(hasTone("á")).toBe(true);
  });
});

describe("tokenize", () => {
  it("strips edge punctuation but keeps inner apostrophes and marks", () => {
    expect(tokenize(`${O_DOT} lo’dudu.`)).toEqual([O_DOT, "lo’dudu"]);
  });

  it("drops empty tokens", () => {
    expect(tokenize("   ...   ")).toEqual([]);
  });
});

describe("charSequence", () => {
  it("removes all whitespace, as sacrebleu's chrF does", () => {
    expect(charSequence("a b\tc")).toEqual(["a", "b", "c"]);
  });

  it("keeps combining marks as separate units", () => {
    // NFC keeps ẹ + acute as two codepoints (no precomposed form exists), so
    // the character n-gram sequence sees the tone mark as its own unit.
    expect(charSequence(E_DOT_ACUTE)).toEqual([E_DOT, ACUTE]);
  });
});
