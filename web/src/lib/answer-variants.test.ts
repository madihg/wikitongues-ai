import { describe, it, expect } from "vitest";
import {
  buildAnswerVariantGroups,
  classifyVariantKind,
  countByKind,
  describeDifference,
  normaliseSpacing,
  soundKey,
  spellingKey,
  toneKey,
  type AnswerRow,
} from "./answer-variants";

// Real shapes taken from the Igala gold answers: "morning" written three ways
// by three annotators, and one sentence written with different spacing and
// elision. Fixed inputs, exact expectations - every assertion is a
// re-computation of a pure function, never a statistical gamble.
const ODUDU = ["Ọdudu", "Òdúdú", "ódùdù"];
const CHILD_EATS = ["Ọma lẹ a jẹ ñwu", "Ọma lẹ aj'ẹñwu", "Ọma le a jẹñwu"];
// Same word, two Unicode shapes: precomposed U+1ECC vs plain O + combining
// dot below (U+0323). They look identical on screen.
const PRECOMPOSED = "\u1ECCdudu";
const DECOMPOSED = "O\u0323dudu";

function row(
  over: Partial<AnswerRow> & Pick<AnswerRow, "answerText">,
): AnswerRow {
  return {
    promptId: "p1",
    englishGloss: null,
    dialect: null,
    annotatorId: "ann_1",
    annotatorName: "Ann One",
    ...over,
  };
}

/** One row per text, each from its own annotator. */
function rowsFrom(texts: string[], promptId = "p1"): AnswerRow[] {
  return texts.map((answerText, i) =>
    row({
      promptId,
      answerText,
      annotatorId: `ann_${i + 1}`,
      annotatorName: `Ann ${i + 1}`,
    }),
  );
}

describe("comparison keys", () => {
  it("normaliseSpacing collapses runs of whitespace and trims", () => {
    expect(normaliseSpacing("  ẹnẹ   imoto  ")).toBe("ẹnẹ imoto");
    expect(normaliseSpacing("a\n\tb")).toBe("a b");
  });

  it("normaliseSpacing composes to NFC so identical-looking answers really are", () => {
    // Both render as "\u1ECCdudu". PRECOMPOSED uses the single codepoint
    // U+1ECC; DECOMPOSED is a plain O plus a combining dot below. Both shapes
    // turn up in the production answers, from different keyboards.
    expect(PRECOMPOSED).not.toBe(DECOMPOSED);
    expect(normaliseSpacing(PRECOMPOSED)).toBe(normaliseSpacing(DECOMPOSED));
    expect(normaliseSpacing(DECOMPOSED)).toBe(PRECOMPOSED);
  });

  it("spellingKey folds tone marks, dotted vowels and case but keeps spacing", () => {
    expect(ODUDU.map(spellingKey)).toEqual(["odudu", "odudu", "odudu"]);
    expect(spellingKey("Ọma lẹ a jẹ ñwu")).toBe("oma le a je nwu");
    // Spacing is preserved, so a differently-spaced sentence gets a different key.
    expect(spellingKey("Ọma lẹ aj'ẹñwu")).not.toBe(
      spellingKey("Ọma lẹ a jẹ ñwu"),
    );
  });

  it("toneKey keeps tone marks but strips spacing and elision apostrophes", () => {
    expect(toneKey("Ọma lẹ a jẹñwu")).toBe(toneKey("Ọma lẹ aj'ẹñwu"));
    // Straight, curly and modifier apostrophes are all treated as elision marks.
    expect(toneKey("aj'ẹ")).toBe(toneKey("aj’ẹ"));
    expect(toneKey("aj'ẹ")).toBe(toneKey("ajʼẹ"));
    // Tone marks still tell two spellings apart.
    expect(toneKey("Òdúdú")).not.toBe(toneKey("ódùdù"));
  });

  it("soundKey strips both, so every writing of one word collapses together", () => {
    expect(new Set(ODUDU.map(soundKey)).size).toBe(1);
    expect(new Set(CHILD_EATS.map(soundKey)).size).toBe(1);
    expect(soundKey("Ọdudu")).not.toBe(soundKey("Ọjọ"));
  });

  it("soundKey does not collapse genuinely different words", () => {
    const different = ["Baba ọ lo'dudu", "Mama ọlañẹ", "Edanyekwu ñwu ogijo"];
    expect(new Set(different.map(soundKey)).size).toBe(3);
  });
});

describe("describeDifference", () => {
  it("returns null for a single form", () => {
    expect(describeDifference(["Ọdudu"])).toBeNull();
  });

  it("calls tone marks and letter forms 'marks'", () => {
    expect(describeDifference(ODUDU)).toBe("marks");
    expect(describeDifference(["Ọdudu", "odudu"])).toBe("marks");
  });

  it("calls spacing and elision 'spacing' when the marks are identical", () => {
    expect(describeDifference(["Ọma lẹ a jẹñwu", "Ọma lẹ aj'ẹñwu"])).toBe(
      "spacing",
    );
  });

  it("calls it 'marks_and_spacing' when both differ", () => {
    expect(describeDifference(["Ọma lẹ a jẹ ñwu", "Ọma le aj'ẹñwu"])).toBe(
      "marks_and_spacing",
    );
  });
});

describe("classifyVariantKind", () => {
  const cluster = (...variantIndexes: number[]) => ({
    variantIndexes,
    difference: null,
  });

  it("is 'identical' below two distinct forms", () => {
    expect(classifyVariantKind([cluster(0)], 1)).toBe("identical");
    expect(classifyVariantKind([], 0)).toBe("identical");
  });

  it("is 'spelling' when every form is the same word", () => {
    expect(classifyVariantKind([cluster(0, 1, 2)], 3)).toBe("spelling");
  });

  it("is 'different' when no two forms are the same word", () => {
    expect(classifyVariantKind([cluster(0), cluster(1), cluster(2)], 3)).toBe(
      "different",
    );
  });

  it("is 'mixed' when both kinds of disagreement are present", () => {
    expect(classifyVariantKind([cluster(0, 1), cluster(2)], 3)).toBe("mixed");
  });
});

describe("buildAnswerVariantGroups", () => {
  it("classifies one word written three ways as a spelling group", () => {
    const [group] = buildAnswerVariantGroups(rowsFrom(ODUDU));
    expect(group.kind).toBe("spelling");
    expect(group.variants.map((v) => v.text)).toEqual(ODUDU);
    expect(group.clusters).toHaveLength(1);
    expect(group.clusters[0].variantIndexes).toEqual([0, 1, 2]);
    expect(group.clusters[0].difference).toBe("marks");
    expect(group.annotatorCount).toBe(3);
    expect(group.answerCount).toBe(3);
  });

  it("classifies one sentence spaced and elided differently as a spelling group", () => {
    const [group] = buildAnswerVariantGroups(rowsFrom(CHILD_EATS));
    expect(group.kind).toBe("spelling");
    expect(group.clusters).toHaveLength(1);
    expect(group.clusters[0].difference).toBe("marks_and_spacing");
  });

  it("classifies genuinely different answers as a different-words group", () => {
    const [group] = buildAnswerVariantGroups(
      rowsFrom(["Baba ọ lo'dudu", "Mama ọlañẹ"]),
    );
    expect(group.kind).toBe("different");
    expect(group.clusters).toHaveLength(2);
    expect(group.clusters.every((c) => c.difference === null)).toBe(true);
  });

  it("classifies a group holding both kinds as mixed", () => {
    const [group] = buildAnswerVariantGroups(
      rowsFrom(["Ọdudu", "ódùdù", "Mama ọlañẹ"]),
    );
    expect(group.kind).toBe("mixed");
    expect(group.clusters.map((c) => c.variantIndexes)).toEqual([[0, 1], [2]]);
  });

  it("leads a mixed group with its biggest same-word cluster", () => {
    const [group] = buildAnswerVariantGroups(
      rowsFrom(["Mama ọlañẹ", "Ọdudu", "ódùdù", "Òdúdú"]),
    );
    expect(group.kind).toBe("mixed");
    expect(group.clusters.map((c) => c.variantIndexes)).toEqual([
      [1, 2, 3],
      [0],
    ]);
    expect(group.clusters[0].difference).toBe("marks");
    expect(group.clusters[1].difference).toBeNull();
  });

  it("drops a prompt only one annotator answered, however many times", () => {
    const rows = [
      row({ answerText: "Ọdudu" }),
      row({ answerText: "Òdúdú" }),
      row({ answerText: "ódùdù" }),
    ];
    expect(buildAnswerVariantGroups(rows)).toEqual([]);
  });

  it("drops a prompt everybody wrote identically - agreement is not a disagreement", () => {
    const rows = rowsFrom(["Ọdudu", "Ọdudu", "Ọdudu"]);
    expect(buildAnswerVariantGroups(rows)).toEqual([]);
  });

  it("treats two Unicode shapes of the same letter as one wording", () => {
    // Otherwise the page shows two rival spellings that render identically.
    const rows = rowsFrom([PRECOMPOSED, DECOMPOSED]);
    expect(buildAnswerVariantGroups(rows)).toEqual([]);
  });

  it("treats a stray double space as the same wording, not a variant", () => {
    const rows = rowsFrom(["Ọdudu", "Ọdudu "]);
    expect(buildAnswerVariantGroups(rows)).toEqual([]);
  });

  it("collapses exact re-submissions but still counts every row", () => {
    const rows = [
      row({ answerText: "Ọdudu", annotatorId: "a", annotatorName: "A" }),
      row({ answerText: "Ọdudu", annotatorId: "a", annotatorName: "A" }),
      row({ answerText: "Òdúdú", annotatorId: "b", annotatorName: "B" }),
    ];
    const [group] = buildAnswerVariantGroups(rows);
    expect(group.variants).toHaveLength(2);
    expect(group.variants[0].writers.map((w) => w.name)).toEqual(["A"]);
    expect(group.answerCount).toBe(3);
    expect(group.annotatorCount).toBe(2);
  });

  it("lists every annotator who wrote a wording, and keeps their dialect", () => {
    const rows = [
      row({
        answerText: "Ọdudu",
        annotatorId: "a",
        annotatorName: "A",
        dialect: "ibaji",
      }),
      row({ answerText: "Ọdudu", annotatorId: "b", annotatorName: "B" }),
      row({ answerText: "Òdúdú", annotatorId: "c", annotatorName: "C" }),
    ];
    const [group] = buildAnswerVariantGroups(rows);
    expect(group.variants[0].writers).toEqual([
      { annotatorId: "a", name: "A", dialect: "ibaji" },
      { annotatorId: "b", name: "B", dialect: null },
    ]);
  });

  it("backfills a dialect that a later identical row carries", () => {
    const rows = [
      row({ answerText: "Ọdudu", annotatorId: "a", annotatorName: "A" }),
      row({
        answerText: "Ọdudu",
        annotatorId: "a",
        annotatorName: "A",
        dialect: "ankpa",
      }),
      row({ answerText: "Òdúdú", annotatorId: "b", annotatorName: "B" }),
    ];
    const [group] = buildAnswerVariantGroups(rows);
    expect(group.variants[0].writers[0].dialect).toBe("ankpa");
  });

  it("collects distinct English glosses per wording, ignoring blanks", () => {
    const rows = [
      row({
        answerText: "Ọdudu",
        annotatorId: "a",
        annotatorName: "A",
        englishGloss: "morning",
      }),
      row({
        answerText: "Ọdudu",
        annotatorId: "b",
        annotatorName: "B",
        englishGloss: "  morning  ",
      }),
      row({
        answerText: "Òdúdú",
        annotatorId: "c",
        annotatorName: "C",
        englishGloss: "   ",
      }),
    ];
    const [group] = buildAnswerVariantGroups(rows);
    expect(group.variants[0].glosses).toEqual(["morning"]);
    expect(group.variants[1].glosses).toEqual([]);
  });

  it("ignores empty answers rather than showing a blank variant", () => {
    const rows = [
      row({ answerText: "Ọdudu", annotatorId: "a", annotatorName: "A" }),
      row({ answerText: "   ", annotatorId: "b", annotatorName: "B" }),
      row({ answerText: "Òdúdú", annotatorId: "c", annotatorName: "C" }),
    ];
    const [group] = buildAnswerVariantGroups(rows);
    expect(group.variants.map((v) => v.text)).toEqual(["Ọdudu", "Òdúdú"]);
  });

  it("sorts spelling groups first, then mixed, then different words", () => {
    const groups = buildAnswerVariantGroups([
      ...rowsFrom(["Baba ọ lo'dudu", "Mama ọlañẹ"], "p_different"),
      ...rowsFrom(["Ọdudu", "ódùdù", "Mama ọlañẹ"], "p_mixed"),
      ...rowsFrom(ODUDU, "p_spelling"),
    ]);
    expect(groups.map((g) => g.promptId)).toEqual([
      "p_spelling",
      "p_mixed",
      "p_different",
    ]);
  });

  it("puts the most-answered prompt first inside a kind, tiebreaking on promptId", () => {
    const groups = buildAnswerVariantGroups([
      ...rowsFrom(["Ọdudu", "Òdúdú"], "p_b"),
      ...rowsFrom(["Ọdudu", "Òdúdú"], "p_a"),
      ...rowsFrom(ODUDU, "p_c"),
    ]);
    expect(groups.map((g) => g.promptId)).toEqual(["p_c", "p_a", "p_b"]);
  });
});

describe("countByKind", () => {
  it("counts each kind separately so the badges never double-count", () => {
    const groups = buildAnswerVariantGroups([
      ...rowsFrom(ODUDU, "p1"),
      ...rowsFrom(CHILD_EATS, "p2"),
      ...rowsFrom(["Ọdudu", "ódùdù", "Mama ọlañẹ"], "p3"),
      ...rowsFrom(["Baba ọ lo'dudu", "Mama ọlañẹ"], "p4"),
    ]);
    expect(countByKind(groups)).toEqual({
      spelling: 2,
      mixed: 1,
      different: 1,
      total: 4,
    });
  });

  it("is all zeroes when there is nothing to review", () => {
    expect(countByKind([])).toEqual({
      spelling: 0,
      mixed: 0,
      different: 0,
      total: 0,
    });
  });
});
