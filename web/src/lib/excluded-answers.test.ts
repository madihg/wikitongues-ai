import { describe, it, expect } from "vitest";
import {
  EXCLUDED_COLD_ANSWER_IDS,
  isExcludedColdAnswer,
  usableColdAnswer,
} from "./excluded-answers";

describe("answers left out of training and benchmark reads", () => {
  it("lists ids only, and the where fragment leaves them out", () => {
    expect(EXCLUDED_COLD_ANSWER_IDS.length).toBe(6);
    for (const id of EXCLUDED_COLD_ANSWER_IDS) expect(id).toMatch(/^c[a-z0-9]{24}$/);
    expect(usableColdAnswer.id.notIn).toEqual([...EXCLUDED_COLD_ANSWER_IDS]);
  });

  it("knows an excluded id from any other", () => {
    expect(isExcludedColdAnswer(EXCLUDED_COLD_ANSWER_IDS[0])).toBe(true);
    expect(isExcludedColdAnswer("cmsomethingelse0000000000")).toBe(false);
    expect(isExcludedColdAnswer(null)).toBe(false);
  });
});
