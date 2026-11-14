import { describe, it, expect } from "vitest";
import {
  chooseSet,
  coverageCells,
  EXPECTED_CELLS,
  findHomographs,
  foldWord,
  type Candidate,
} from "./coverage";

/**
 * Coverage cells and the set chooser. Invented non-words; marks are explicit
 * escapes (\u0301 acute, \u0300 grave, \u0304 macron, \u030C caron,
 * \u0323 dot below, \u0303 tilde).
 */

const H = "\u0301";
const L = "\u0300";
const M = "\u0304";
const DOT = "\u0323";

describe("the cells one answer fills", () => {
  it("which tone on which vowel, dotted vowels apart", () => {
    const cells = coverageCells(`ba${H} be${DOT}${L} bi${M} bo`);
    expect(cells).toEqual(
      expect.arrayContaining(["tone:H:a", "tone:L:e-dot", "tone:M:i"]),
    );
    expect(cells.filter((c) => c.startsWith("tone:"))).toHaveLength(3);
  });

  it("tone sequences on fully marked two- and three-syllable words only", () => {
    expect(coverageCells(`ba${H}be${L}`)).toContain("seq2:HL");
    expect(coverageCells(`ba${H}be`)).not.toContain("seq2:HU");
    expect(
      coverageCells(`ba${H}be${L}bi${H}`).filter((c) => c.startsWith("seq")),
    ).toEqual(["seq3:fully-marked"]);
  });

  it("contours, nasals, digraphs, elision", () => {
    const cells = coverageCells(`bo\u030C n${H}da a\u00F1a kpagba k'obe zza-n`);
    expect(cells).toEqual(
      expect.arrayContaining([
        "contour:R",
        "nasal:syllabic",
        "nasal:engma",
        "digraph:kp",
        "digraph:gb",
        "elision",
        "nasal:final",
      ]),
    );
  });

  it("grammatical monosyllables are found whatever tone they carry", () => {
    expect(coverageCells(`ki${L} zzz du${H}`)).toEqual(
      expect.arrayContaining(["mono:ki", "mono:du"]),
    );
    expect(coverageCells("kizz").join(" ")).not.toContain("mono:");
  });

  it("length, how much tone is written, bucket, dialect and an anonymous writer", () => {
    const one = coverageCells("zzz", { bucket: "orthography", writer: "W1" });
    expect(one).toEqual(
      expect.arrayContaining([
        "length:word",
        "state:untoned",
        "bucket:orthography",
        "dialect:none",
        "writer:W1",
      ]),
    );
    expect(coverageCells("za zb zc zd ze zf zg zh zi")).toContain(
      "length:long",
    );
    expect(coverageCells(`za${H} zbe`, { dialect: "ankpa" })).toEqual(
      expect.arrayContaining(["length:short", "state:partly", "dialect:ankpa"]),
    );
  });

  it("a homograph family is a cell only when the data named it", () => {
    const family = new Set(["zaza"]);
    expect(coverageCells(`za${H}za${L}`, { homographs: family })).toContain(
      "homograph:zaza",
    );
    expect(coverageCells(`za${H}za${L}`).join(" ")).not.toContain("homograph:");
  });

  it("a loanword is a long word with a letter pattern Igala spelling does not use", () => {
    expect(coverageCells("za philosophy zb")).toContain("loanword");
    expect(coverageCells("bababa").join(" ")).not.toContain("loanword");
  });
});

describe("homograph families found in the data", () => {
  it("folds tone, dots and case away to find the shared word", () => {
    expect(foldWord(`Za${H}ze${DOT}${L},`)).toBe("zaze");
  });

  it("a word written with two or more patterns in three or more answers", () => {
    const texts = [
      `za${H}za${L} bb`,
      `za${L}za${L} cc`,
      `zaza dd`,
      `be${DOT}be ee`,
      `bebe ff`,
      `be${DOT}be gg`,
    ];
    expect(findHomographs(texts)).toEqual([
      { stem: "zaza", spellings: 2, answers: 3 },
    ]);
    // one marked spelling is not a family, however often it is written
    expect(findHomographs(texts).map((h) => h.stem)).not.toContain("bebe");
  });
});

describe("choosing the set", () => {
  const c = (
    id: string,
    cells: string[],
    state: Candidate["state"] = "untoned",
  ): Candidate => ({
    id,
    cells,
    state,
  });

  it("fills every cell with the fewest answers, then pads thin cells to three", () => {
    const candidates = [
      c("a1", ["x", "y", "z"]),
      c("a2", ["x"]),
      c("a3", ["y"]),
      c("a4", ["z"]),
      c("a5", ["x"]),
      c("a6", ["w"]),
    ];
    const cover = chooseSet(candidates, 1);
    expect(cover.ids).toEqual(["a1", "a6"]);
    // picked in the order that fills the most cells first
    expect(cover.order).toEqual(["a1", "a6"]);
    const padded = chooseSet(candidates, 3);
    const by = Object.fromEntries(padded.cells.map((x) => [x.cell, x]));
    expect(by.x.chosen).toBe(3);
    expect(by.y.chosen).toBe(2); // only two answers have it
    expect(by.w).toMatchObject({ chosen: 1, available: 1 });
    expect(padded.thin).toEqual(["w", "y", "z"]);
  });

  it("prefers an answer with less tone written, and is the same every time", () => {
    const candidates = [
      c("b1", ["x"], "toned"),
      c("b2", ["x"], "partly"),
      c("b3", ["x"], "untoned"),
      c("b4", ["x"], "toned"),
    ];
    expect(chooseSet(candidates, 1).ids).toEqual(["b3"]);
    expect(chooseSet(candidates, 2).ids).toEqual(["b2", "b3"]);
    expect(chooseSet([...candidates].reverse(), 2).ids).toEqual(["b2", "b3"]);
  });

  it("names its example ids, at most three per cell", () => {
    const set = chooseSet(
      [c("e1", ["x"]), c("e2", ["x"]), c("e3", ["x"]), c("e4", ["x"])],
      4,
    );
    expect(set.cells[0].examples).toEqual(["e1", "e2", "e3"]);
  });

  it("the inventory names every tone on every vowel, dotted ones too", () => {
    expect(EXPECTED_CELLS.filter((x) => x.startsWith("tone:"))).toHaveLength(
      21,
    );
    expect(EXPECTED_CELLS).toContain("tone:M:o-dot");
  });
});
