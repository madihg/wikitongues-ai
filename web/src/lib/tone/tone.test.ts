import { describe, it, expect } from "vitest";
import {
  clusters,
  isToneOnlyChange,
  projectToneOnto,
  stripTone,
  storedTone,
  toneLabels,
  toneState,
  toneStats,
  wordsOf,
} from "./tone";

/**
 * Tone marks, precisely. Every sample is an invented non-word written with
 * explicit escapes, so the combining marks are visible in this file:
 *   \u0301 acute (High)   \u0300 grave (Low)   \u0304 macron (Mid)
 *   \u030C caron (rising) \u0302 circumflex (falling)
 *   \u0323 dot below (vowel quality, NOT tone)
 */

const ACUTE = "\u0301";
const GRAVE = "\u0300";
const MACRON = "\u0304";
const CARON = "\u030C";
const DOT = "\u0323";

describe("which marks are tone", () => {
  it("acute, grave, macron, caron and circumflex on a vowel are tone; the dot below is not", () => {
    const text = `ba${ACUTE} be${GRAVE} bi${MACRON} bo${CARON} bu\u0302 be${DOT}`;
    expect(stripTone(text)).toBe(`ba be bi bo bu be${DOT}`.normalize("NFC"));
  });

  it("a dotted vowel keeps its dot and loses only its tone, in either mark order", () => {
    const dotThenTone = `ke${DOT}${ACUTE}`;
    const toneThenDot = `ke${ACUTE}${DOT}`;
    const precomposed = `k\u1EB9${ACUTE}`; // e with dot below, precomposed
    for (const t of [dotThenTone, toneThenDot, precomposed]) {
      expect(stripTone(t)).toBe("k\u1EB9");
    }
  });

  it("precomposed and combining spellings are the same text", () => {
    const precomposed = "b\u00E1"; // a with acute, one code point
    const combining = `ba${ACUTE}`;
    expect(stripTone(precomposed)).toBe("ba");
    expect(storedTone(combining)).toBe(precomposed);
    expect(isToneOnlyChange(precomposed, combining)).toBe(true);
  });

  it("a tone on a syllabic nasal is tone; a tilde or macron on n is a letter and stays", () => {
    expect(stripTone(`n${ACUTE}da`)).toBe("nda");
    expect(stripTone(`n${GRAVE}`)).toBe("n");
    const engma = "\u00F1"; // n with tilde
    expect(stripTone(`a${engma}a`)).toBe(`a${engma}a`);
    expect(stripTone(`an${MACRON}a`)).toBe(`an${MACRON}a`.normalize("NFC"));
  });

  it("case, spacing, punctuation and apostrophes are untouched", () => {
    const text = `Ba${ACUTE}  k'o${GRAVE}, Du${ACUTE}!`;
    expect(stripTone(text)).toBe("Ba  k'o, Du!");
  });
});

describe("labels per tone-bearing unit", () => {
  it("every vowel has a label, U when unmarked: unmarked is never Mid", () => {
    const labels = [...toneLabels(`ba${ACUTE}be bi${MACRON}`).values()];
    expect(labels).toEqual(["H", "U", "M"]);
  });

  it("two texts that differ only in tone line up by position", () => {
    const one = toneLabels(`ba${ACUTE}be${GRAVE}`);
    const two = toneLabels(`babe${GRAVE}`);
    expect([...one.keys()]).toEqual([...two.keys()]);
    expect([...one.values()]).toEqual(["H", "L"]);
    expect([...two.values()]).toEqual(["U", "L"]);
  });

  it("contours and stacked marks have their own labels", () => {
    expect([...toneLabels(`bo${CARON}bu\u0302`).values()]).toEqual(["R", "F"]);
    expect([...toneLabels(`ba${ACUTE}${GRAVE}`).values()]).toEqual(["X"]);
  });

  it("a nasal is counted only when it carries a tone", () => {
    expect(toneLabels("nda").size).toBe(1);
    const marked = toneLabels(`n${ACUTE}da`);
    expect([...marked.values()]).toEqual(["H", "U"]);
  });

  it("clusters keep non-tone marks apart from tone marks", () => {
    const [, e] = clusters(`ke${DOT}${ACUTE}`);
    expect(e.base).toBe("e");
    expect(e.marks).toEqual(["\u0323"]);
    expect(e.tone).toEqual(["\u0301"]);
  });
});

describe("how much of a text is marked", () => {
  it("counts syllables, marked units and dotted vowels", () => {
    const s = toneStats(`ba${ACUTE}be ke${DOT} bo`);
    expect(s).toEqual({
      syllables: 4,
      marked: 1,
      share: 0.25,
      hasTone: true,
      dotted: true,
    });
  });

  it("no vowels, no division by zero", () => {
    expect(toneStats("...").share).toBe(0);
  });

  it("untoned, partly, toned", () => {
    expect(toneState("babe")).toBe("untoned");
    expect(toneState(`ba${ACUTE}be`)).toBe("partly");
    expect(toneState(`ba${ACUTE}be${GRAVE}`)).toBe("toned");
  });
});

describe("the tone-only guard", () => {
  const pass1 = `Babe ke${DOT} du`;

  it("adding, changing or removing tone marks is a tone-only change", () => {
    expect(
      isToneOnlyChange(pass1, `Ba${ACUTE}be${GRAVE} ke${DOT}${ACUTE} du`),
    ).toBe(true);
    expect(isToneOnlyChange(`ba${ACUTE}be`, `ba${GRAVE}be`)).toBe(true);
    expect(isToneOnlyChange(`ba${ACUTE}be`, "babe")).toBe(true);
  });

  it("NFD input against NFC input is no change at all", () => {
    expect(
      isToneOnlyChange(pass1.normalize("NFC"), pass1.normalize("NFD")),
    ).toBe(true);
  });

  it("removing or adding a dot below is NOT tone-only", () => {
    expect(isToneOnlyChange(pass1, "Babe ke du")).toBe(false);
    expect(isToneOnlyChange("Babe ke du", pass1)).toBe(false);
  });

  it("a changed letter, word, space inside, or punctuation is NOT tone-only", () => {
    expect(isToneOnlyChange(pass1, `Bebe ke${DOT} du`)).toBe(false);
    expect(isToneOnlyChange(pass1, `Babe ke${DOT}`)).toBe(false);
    expect(isToneOnlyChange(pass1, `Babe  ke${DOT} du`)).toBe(false);
    expect(isToneOnlyChange(pass1, `Babe ke${DOT} du.`)).toBe(false);
    expect(isToneOnlyChange(pass1, `babe ke${DOT} du`)).toBe(false);
  });

  it("outer whitespace does not count", () => {
    expect(isToneOnlyChange(pass1, `  ${pass1}\n`)).toBe(true);
  });
});

describe("undo the other changes", () => {
  const pass1 = `babe ke${DOT} du`;

  it("keeps the new tone marks and puts back a changed word", () => {
    const edited = `ba${ACUTE}be ko du${GRAVE}`; // "ke." became "ko"
    const out = projectToneOnto(pass1, edited);
    expect(out).toBe(`ba${ACUTE}be ke${DOT} du${GRAVE}`.normalize("NFC"));
    expect(isToneOnlyChange(pass1, out)).toBe(true);
  });

  it("an added word is dropped and a removed word comes back, the rest keeps its marks", () => {
    const added = projectToneOnto(
      pass1,
      `ba${ACUTE}be extra ke${DOT} du${GRAVE}`,
    );
    expect(added).toBe(`ba${ACUTE}be ke${DOT} du${GRAVE}`.normalize("NFC"));
    const removed = projectToneOnto(pass1, `ba${ACUTE}be du${GRAVE}`);
    expect(removed).toBe(`ba${ACUTE}be ke${DOT} du${GRAVE}`.normalize("NFC"));
  });

  it("is the text itself when the change was tone-only, and always passes the guard", () => {
    const toneOnly = `ba${ACUTE}be ke${DOT}${GRAVE} du`;
    expect(projectToneOnto(pass1, toneOnly)).toBe(toneOnly.normalize("NFC"));
    for (const wild of ["", "zzz", `${pass1} ${pass1}`, "BABE KE DU"]) {
      expect(isToneOnlyChange(pass1, projectToneOnto(pass1, wild))).toBe(true);
    }
  });
});

describe("words", () => {
  it("splits on whitespace, NFC", () => {
    expect(wordsOf(`  ba${ACUTE}be   du `)).toEqual(["b\u00E1be", "du"]);
  });
});
