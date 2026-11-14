import { describe, it, expect } from "vitest";
import {
  ORTHOGRAPHY_VERSION,
  normaliseForScoring,
  toneStrip,
} from "./normalise";
import orthography from "./orthography.json";

/**
 * Synthetic strings only: nonsense syllables and English glosses. Combining
 * marks are built from code points, never typed, because a bare combining
 * mark is invisible in review (and in some editors, silently lost).
 */
const ACUTE = String.fromCharCode(0x301);
const GRAVE = String.fromCharCode(0x300);
const MACRON = String.fromCharCode(0x304);
const TILDE = String.fromCharCode(0x303);
const DOT = String.fromCharCode(0x323);

/** Code points of a string, for assertions that must see marks. */
const cps = (s: string) => Array.from(s, (c) => c.codePointAt(0)!.toString(16));

describe("toneStrip", () => {
  it("removes acute, grave and macron from plain vowels", () => {
    expect(toneStrip(`ba${ACUTE}da${GRAVE}do${MACRON}`)).toBe("badado");
  });

  it("is a no-op on unmarked text", () => {
    expect(toneStrip("bado")).toBe("bado");
    expect(toneStrip("")).toBe("");
  });

  it("never strips a dot-below vowel (it is a letter), even under a tone mark", () => {
    const dottedO = `o${DOT}`;
    // base + dot + acute: the dot stays, the acute goes.
    const out = toneStrip(`${dottedO}${ACUTE}`);
    expect(out).toBe(dottedO.normalize("NFC"));
    expect(cps(out)).toEqual(["1ecd"]); // the precomposed dotted o
    // Unmarked dotted vowels pass through unchanged.
    expect(toneStrip(dottedO)).toBe(dottedO.normalize("NFC"));
  });

  it("never strips the dotted n", () => {
    const dottedN = `n${DOT}`;
    expect(toneStrip(dottedN)).toBe(dottedN.normalize("NFC"));
    expect(toneStrip(`${dottedN}${ACUTE}`)).toBe(dottedN.normalize("NFC"));
    expect(toneStrip(dottedN)).not.toBe("n");
  });

  it("keeps n with a tilde (a letter) but strips a tilde on a vowel", () => {
    const nTilde = `n${TILDE}`;
    expect(toneStrip(nTilde)).toBe(nTilde.normalize("NFC"));
    expect(toneStrip(`a${TILDE}`)).toBe("a");
  });

  it("treats precomposed and decomposed spellings identically", () => {
    const decomposed = `e${DOT}${ACUTE}ga`;
    const precomposed = "\u1eb9\u0301ga";
    expect(toneStrip(decomposed)).toBe(toneStrip(precomposed));
    expect(cps(toneStrip(decomposed))).toEqual(["1eb9", "67", "61"]);
  });

  it("returns NFC", () => {
    const out = toneStrip(`a${GRAVE}e${DOT}`);
    expect(out).toBe(out.normalize("NFC"));
  });
});

describe("normaliseForScoring", () => {
  it("applies NFC, lower case, punctuation removal and whitespace collapse", () => {
    expect(normaliseForScoring("  Hello,   WORLD!  ")).toBe("hello world");
    expect(normaliseForScoring("a.b?c;d")).toBe("a b c d");
    expect(normaliseForScoring("\tone\ntwo  three ")).toBe("one two three");
  });

  it("lower-cases dotted capitals without losing the dot", () => {
    const upper = "O" + DOT;
    const lower = "o" + DOT;
    expect(normaliseForScoring(upper)).toBe(lower.normalize("NFC"));
  });

  it("keeps tone marks by default and strips them on request", () => {
    const toned = `Ba${ACUTE}do${GRAVE}`;
    expect(normaliseForScoring(toned)).toBe(
      `ba${ACUTE}do${GRAVE}`.normalize("NFC"),
    );
    expect(normaliseForScoring(toned, { tones: "strip" })).toBe("bado");
  });

  it("never strips dotted letters in either view", () => {
    const text = `O${DOT}${ACUTE}ba n${DOT}a`;
    const kept = normaliseForScoring(text);
    const stripped = normaliseForScoring(text, { tones: "strip" });
    expect(stripped).toBe(`o${DOT}ba n${DOT}a`.normalize("NFC"));
    expect(kept.normalize("NFD")).toContain(DOT);
    expect(stripped.normalize("NFD")).toContain(DOT);
  });

  it("keeps inner apostrophes and hyphens, drops edge ones, folds curly quotes", () => {
    expect(normaliseForScoring("ab'cd")).toBe("ab'cd");
    expect(normaliseForScoring("ab\u2019cd")).toBe("ab'cd");
    expect(normaliseForScoring("ab-cd")).toBe("ab-cd");
    expect(normaliseForScoring("-ab- 'cd'")).toBe("ab cd");
  });

  it("is idempotent", () => {
    const once = normaliseForScoring(`Ba${ACUTE}, do${DOT}  Ke!`);
    expect(normaliseForScoring(once)).toBe(once);
  });

  it("handles empty and null-ish input", () => {
    expect(normaliseForScoring("")).toBe("");
    expect(normaliseForScoring(undefined as unknown as string)).toBe("");
  });
});

describe("the contraction table", () => {
  it("ships empty, and the normaliser passes text through untouched", () => {
    expect(orthography.contractions).toEqual({});
    expect(normaliseForScoring("it is not a contraction")).toBe(
      "it is not a contraction",
    );
  });

  it("carries a version string and a pointer to the pending ruling", () => {
    expect(ORTHOGRAPHY_VERSION).toBe(orthography.version);
    expect(ORTHOGRAPHY_VERSION.length).toBeGreaterThan(0);
    expect(orthography._comment).toMatch(/Salem and Lydia/);
  });

  it("applies a supplied table word by word, after normalisation", () => {
    const table = { cant: "can not", wont: "will not" };
    expect(
      normaliseForScoring("I CANT, you wont", { contractions: table }),
    ).toBe("i can not you will not");
  });

  it("matches table keys across tone marks when scoring tone-stripped", () => {
    const table = { [`ka${ACUTE}ta`]: "kata-full" };
    expect(
      normaliseForScoring("kata", { tones: "strip", contractions: table }),
    ).toBe("kata-full");
    // Tone-retained: the bare spelling is a different word, so no match.
    expect(normaliseForScoring("kata", { contractions: table })).toBe("kata");
  });

  it("does not touch words the table does not name", () => {
    expect(
      normaliseForScoring("one two", { contractions: { three: "3" } }),
    ).toBe("one two");
  });
});
