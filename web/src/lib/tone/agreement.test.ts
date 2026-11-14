import { describe, it, expect } from "vitest";
import {
  cohenKappa,
  exactMatch,
  fleissKappa,
  itemOutcome,
  summarise,
  syllableAgreement,
  syllableRows,
} from "./agreement";

/**
 * Agreement maths on hand-built fixtures, each small enough to check with a
 * pencil. Samples are invented non-words; tone marks are explicit escapes
 * (\u0301 acute High, \u0300 grave Low).
 */

const H = "\u0301";
const L = "\u0300";

describe("per item: exact match after NFC", () => {
  it("the same marks in two Unicode forms match", () => {
    const precomposed = "b\u00E1be"; // a with acute, one code point
    expect(exactMatch([precomposed, `ba${H}be`])).toBe(true);
    expect(exactMatch([precomposed, ` ba${H}be `])).toBe(true);
  });

  it("a different mark on one syllable does not", () => {
    expect(exactMatch([`ba${H}be`, `ba${L}be`])).toBe(false);
    expect(exactMatch([`ba${H}be`, "babe"])).toBe(false);
    expect(exactMatch([])).toBe(false);
  });
});

describe("where an item stands", () => {
  const a = `ba${H}be`;
  const b = `ba${L}be`;
  const c = `babe${H}`;

  it("waits until it has the versions it asks for", () => {
    expect(itemOutcome([a]).status).toBe("waiting");
    expect(itemOutcome([a, a], 3).status).toBe("waiting");
  });

  it("two the same: agreed, exact", () => {
    expect(itemOutcome([a, a])).toEqual({
      status: "agreed_exact",
      agreedText: a.normalize("NFC"),
      method: "exact",
    });
  });

  it("two that differ: a third marker is needed", () => {
    expect(itemOutcome([a, b]).status).toBe("needs_third");
  });

  it("three with two the same: agreed by majority, on the majority's text", () => {
    expect(itemOutcome([a, b, a])).toEqual({
      status: "agreed_majority",
      agreedText: a.normalize("NFC"),
      method: "majority",
    });
  });

  it("three all different: the adjudicator decides", () => {
    expect(itemOutcome([a, b, c]).status).toBe("needs_adjudication");
  });

  it("four split two and two is not a majority", () => {
    expect(itemOutcome([a, a, b, b]).status).toBe("needs_adjudication");
  });
});

describe("per syllable", () => {
  it("lines the versions up and says where they differ; unmarked is its own label", () => {
    const rows = syllableRows([
      { annotatorId: "x", text: `ba${H}be${L}bi` },
      { annotatorId: "y", text: `ba${H}bebi` },
    ]);
    expect(rows.map((r) => r.labels)).toEqual([
      ["H", "H"],
      ["L", "U"],
      ["U", "U"],
    ]);
    expect(rows.map((r) => r.agreed)).toEqual([true, false, true]);
  });

  it("the share of syllables agreed", () => {
    expect(
      syllableAgreement([
        { annotatorId: "x", text: `ba${H}be${L}bi` },
        { annotatorId: "y", text: `ba${H}bebi` },
      ]),
    ).toEqual({ agreed: 2, total: 3, share: 2 / 3 });
  });

  it("a nasal toned by one marker only counts as unmarked for the other", () => {
    const rows = syllableRows([
      { annotatorId: "x", text: `n${H}da` },
      { annotatorId: "y", text: "nda" },
    ]);
    expect(rows.map((r) => r.labels)).toEqual([
      ["H", "U"],
      ["U", "U"],
    ]);
  });
});

describe("Cohen's kappa", () => {
  it("is 1 for perfect agreement over more than one label", () => {
    expect(
      cohenKappa([
        ["H", "H"],
        ["L", "L"],
        ["U", "U"],
      ]),
    ).toBeCloseTo(1, 10);
  });

  it("matches a hand-worked 2x2 table", () => {
    // 10 syllables. Both H: 4, both L: 3, x H and y L: 2, x L and y H: 1.
    // po = 7/10. x: H 6, L 4. y: H 5, L 5. pe = .6*.5 + .4*.5 = .5
    // kappa = (.7 - .5) / (1 - .5) = .4
    const pairs: [string, string][] = [
      ...Array<[string, string]>(4).fill(["H", "H"]),
      ...Array<[string, string]>(3).fill(["L", "L"]),
      ...Array<[string, string]>(2).fill(["H", "L"]),
      ...Array<[string, string]>(1).fill(["L", "H"]),
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(0.4, 10);
  });

  it("is undefined, not zero, when both used one label for everything", () => {
    expect(
      cohenKappa([
        ["U", "U"],
        ["U", "U"],
      ]),
    ).toBeNull();
    expect(cohenKappa([])).toBeNull();
  });
});

describe("Fleiss' kappa", () => {
  it("is 1 when every unit is unanimous across more than one label", () => {
    expect(
      fleissKappa([
        ["H", "H", "H"],
        ["L", "L", "L"],
      ]),
    ).toBeCloseTo(1, 10);
  });

  it("matches a hand-worked table with three raters", () => {
    // 4 syllables, 3 markers each.
    //   1: H H H   P = 1
    //   2: H H L   P = (4 + 1 - 3) / 6 = 1/3
    //   3: L L L   P = 1
    //   4: H L U   P = (1 + 1 + 1 - 3) / 6 = 0
    // P bar = (1 + 1/3 + 1 + 0) / 4 = 7/12
    // 12 ratings: H 6, L 5, U 1. pe = (36 + 25 + 1) / 144 = 62/144
    // kappa = (7/12 - 62/144) / (1 - 62/144) = (84 - 62) / 82 = 22/82
    expect(
      fleissKappa([
        ["H", "H", "H"],
        ["H", "H", "L"],
        ["L", "L", "L"],
        ["H", "L", "U"],
      ]),
    ).toBeCloseTo(22 / 82, 10);
  });

  it("with two raters and two labels equals the pooled-margin formula", () => {
    // 4 units: HH, LL, HL, LH. P bar = (1 + 1 + 0 + 0) / 4 = .5
    // 8 ratings, H 4, L 4. pe = .5. kappa = 0.
    expect(
      fleissKappa([
        ["H", "H"],
        ["L", "L"],
        ["H", "L"],
        ["L", "H"],
      ]),
    ).toBeCloseTo(0, 10);
  });

  it("ignores units with one rating, and is undefined with nothing to compare", () => {
    expect(fleissKappa([["H"], ["L"]])).toBeNull();
    expect(
      fleissKappa([
        ["U", "U"],
        ["U", "U"],
      ]),
    ).toBeNull();
    expect(fleissKappa([["H"], ["H", "H"], ["L", "L"]])).toBeCloseTo(1, 10);
  });
});

describe("the summary the admin view shows", () => {
  const items = [
    {
      itemId: "i1",
      cells: ["bucket:orthography", "mono:ki"],
      required: 2,
      versions: [
        { annotatorId: "x", text: `ba${H}be${L}` },
        { annotatorId: "y", text: `ba${H}be${L}` },
      ],
    },
    {
      itemId: "i2",
      cells: ["bucket:orthography"],
      required: 2,
      versions: [
        { annotatorId: "x", text: `ba${H}be` },
        { annotatorId: "y", text: `ba${L}be` },
      ],
    },
    {
      itemId: "i3",
      cells: ["homograph:zzz"],
      required: 3,
      versions: [{ annotatorId: "x", text: "bo" }],
    },
  ];
  const s = summarise(items);

  it("counts items by where they stand", () => {
    expect(s.items).toBe(3);
    expect(s.compared).toBe(2);
    expect(s.exact).toBe(1);
    expect(s.byStatus).toEqual({
      waiting: 1,
      agreed_exact: 1,
      agreed_majority: 0,
      needs_third: 1,
      needs_adjudication: 0,
    });
  });

  it("counts items done per marker", () => {
    expect(s.perAnnotator).toEqual([
      { annotatorId: "x", done: 3 },
      { annotatorId: "y", done: 2 },
    ]);
  });

  it("gives each pair its items, exact matches, syllables and kappa", () => {
    expect(s.pairs).toHaveLength(1);
    // 4 syllables: HH, LL, HL, UU. po = 3/4.
    // x: H 2, L 1, U 1. y: H 1, L 2, U 1. pe = (2*1 + 1*2 + 1*1) / 16 = 5/16
    // kappa = (12/16 - 5/16) / (11/16) = 7/11
    expect(s.pairs[0]).toMatchObject({
      a: "x",
      b: "y",
      items: 2,
      exact: 1,
      syllables: 4,
    });
    expect(s.pairs[0].kappa).toBeCloseTo(7 / 11, 10);
    expect(s.syllables).toBe(4);
    expect(s.syllablesAgreed).toBe(3);
  });

  it("gives each coverage cell its own counts", () => {
    expect(s.perCell).toEqual([
      {
        cell: "bucket:orthography",
        items: 2,
        compared: 2,
        exact: 1,
        syllables: 4,
        syllablesAgreed: 3,
      },
      {
        cell: "homograph:zzz",
        items: 1,
        compared: 0,
        exact: 0,
        syllables: 0,
        syllablesAgreed: 0,
      },
      {
        cell: "mono:ki",
        items: 1,
        compared: 1,
        exact: 1,
        syllables: 2,
        syllablesAgreed: 2,
      },
    ]);
  });
});
