import { describe, it, expect } from "vitest";
import {
  buildArenaMatrix,
  aggregateRubric,
  type PairwiseRow,
  type RubricRow,
} from "./aggregate";

describe("aggregateRubric (axis-keyed, rubric v2)", () => {
  it("averages each axis per candidate, overall and per bucket", () => {
    const rows: RubricRow[] = [
      {
        candidateId: "c1",
        bucket: "orthography",
        axis: "diacritics",
        score: 4,
      },
      {
        candidateId: "c1",
        bucket: "orthography",
        axis: "diacritics",
        score: 2,
      },
      { candidateId: "c1", bucket: "orthography", axis: "spelling", score: 5 },
    ];
    const r = aggregateRubric(rows);
    expect(r.c1.orthography.axes.diacritics).toBe(3); // (4+2)/2
    expect(r.c1.orthography.axes.spelling).toBe(5);
    expect(r.c1.orthography.n).toBe(3);
    // overall = mean of axis means, not of raw rows: (3+5)/2
    expect(r.c1.orthography.overall).toBe(4);
    expect(r.c1.__overall__.overall).toBe(4);
  });

  it("a rarely-scored axis is not drowned out by a frequent one", () => {
    const rows: RubricRow[] = [
      { candidateId: "c1", bucket: null, axis: "syntax", score: 5 },
      { candidateId: "c1", bucket: null, axis: "syntax", score: 5 },
      { candidateId: "c1", bucket: null, axis: "syntax", score: 5 },
      { candidateId: "c1", bucket: null, axis: "contamination", score: 1 },
    ];
    const r = aggregateRubric(rows);
    // Axis means: syntax 5, contamination 1 -> overall (5+1)/2 = 3,
    // NOT the row mean (5+5+5+1)/4 = 4.
    expect(r.c1.__overall__.overall).toBe(3);
  });

  it("scores of 0 (completely wrong) pull the mean down", () => {
    const rows: RubricRow[] = [
      { candidateId: "c1", bucket: null, axis: "lexicon", score: 0 },
      { candidateId: "c1", bucket: null, axis: "lexicon", score: 4 },
    ];
    const r = aggregateRubric(rows);
    expect(r.c1.__overall__.axes.lexicon).toBe(2);
  });
});

describe("buildArenaMatrix", () => {
  it("produces a per-bucket ranking plus overall and rubric means", () => {
    const pairwise: PairwiseRow[] = [];
    // In the orthography bucket, A beats B decisively.
    for (let i = 0; i < 16; i++)
      pairwise.push({
        candidateA: "A",
        candidateB: "B",
        winner: "a",
        bucket: "orthography",
      });
    for (let i = 0; i < 4; i++)
      pairwise.push({
        candidateA: "A",
        candidateB: "B",
        winner: "b",
        bucket: "orthography",
      });

    const rubric: RubricRow[] = [
      { candidateId: "A", bucket: "orthography", axis: "diacritics", score: 5 },
    ];

    const matrix = buildArenaMatrix(pairwise, rubric);
    expect(matrix.candidateIds.sort()).toEqual(["A", "B"]);
    expect(matrix.byBucket.orthography.candidates[0].id).toBe("A");
    expect(matrix.byBucket.orthography.distinguishable).toBe(true);
    // A bucket with no data is present but empty.
    expect(matrix.byBucket.cultural_values.candidates).toHaveLength(0);
    expect(matrix.rubric.A.orthography.axes.diacritics).toBe(5);
  });
});
