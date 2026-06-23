import { describe, it, expect } from "vitest";
import {
  buildArenaMatrix,
  aggregateRubric,
  type PairwiseRow,
  type RubricRow,
} from "./aggregate";

describe("aggregateRubric", () => {
  it("averages each axis per candidate, overall and per bucket", () => {
    const rows: RubricRow[] = [
      {
        candidateId: "c1",
        bucket: "orthography",
        culturalAccuracy: 4,
        linguisticAuthenticity: 5,
        culturalNormAdherence: 3,
        factualCorrectness: 4,
      },
      {
        candidateId: "c1",
        bucket: "orthography",
        culturalAccuracy: 2,
        linguisticAuthenticity: 3,
        culturalNormAdherence: 1,
        factualCorrectness: 2,
      },
    ];
    const r = aggregateRubric(rows);
    expect(r.c1.orthography.culturalAccuracy).toBe(3); // (4+2)/2
    expect(r.c1.orthography.linguisticAuthenticity).toBe(4); // (5+3)/2
    expect(r.c1.orthography.n).toBe(2);
    expect(r.c1.__overall__.overall).toBeCloseTo((3 + 4 + 2 + 3) / 4, 5);
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
      {
        candidateId: "A",
        bucket: "orthography",
        culturalAccuracy: 5,
        linguisticAuthenticity: 5,
        culturalNormAdherence: 4,
        factualCorrectness: 5,
      },
    ];

    const matrix = buildArenaMatrix(pairwise, rubric);
    expect(matrix.candidateIds.sort()).toEqual(["A", "B"]);
    expect(matrix.byBucket.orthography.candidates[0].id).toBe("A");
    expect(matrix.byBucket.orthography.distinguishable).toBe(true);
    // A bucket with no data is present but empty.
    expect(matrix.byBucket.cultural_values.candidates).toHaveLength(0);
    expect(matrix.rubric.A.orthography.culturalAccuracy).toBe(5);
  });
});
