import { describe, it, expect } from "vitest";
import { krippendorffAlpha } from "./krippendorff";

/**
 * The worked example printed in the Wikipedia article on Krippendorff's
 * alpha: three coders, fifteen items, missing judgments throughout. Its
 * published results are 0.691 for nominal data and 0.811 for interval data.
 */
const M = null;
const A = [M, M, M, M, M, 3, 4, 1, 2, 1, 1, 3, 3, M, 3];
const B = [1, M, 2, 1, 3, 3, 4, 3, M, M, M, M, M, M, M];
const C = [M, M, 2, 1, 3, 4, 4, M, 2, 1, 1, 3, 3, M, 4];
const UNITS = A.map((_, i) =>
  [A[i], B[i], C[i]].filter((v): v is number => v !== null),
);

describe("krippendorffAlpha", () => {
  it("reproduces the published nominal value", () => {
    const r = krippendorffAlpha(UNITS, "nominal");
    expect(r.alpha).toBeCloseTo(0.691, 3);
    expect(r.units).toBe(12);
    expect(r.judgments).toBe(26);
  });

  it("reproduces the published interval value", () => {
    expect(krippendorffAlpha(UNITS, "interval").alpha).toBeCloseTo(0.811, 3);
  });

  it("is 1 when two judges agree on every item and the items vary", () => {
    const r = krippendorffAlpha(
      [
        ["model", "model"],
        ["person", "person"],
        ["tie", "tie"],
      ],
      "nominal",
    );
    expect(r.alpha).toBe(1);
  });

  it("is at or below zero when two judges never agree", () => {
    const r = krippendorffAlpha(
      [
        ["model", "person"],
        ["person", "model"],
        ["model", "person"],
      ],
      "nominal",
    );
    expect(r.alpha!).toBeLessThanOrEqual(0);
  });

  it("ignores items judged once, and says how many items carried information", () => {
    const r = krippendorffAlpha([["a"], ["a", "b"], [], ["b", "b"]], "nominal");
    expect(r.units).toBe(2);
    expect(r.judgments).toBe(4);
  });

  it("is null, not a made-up number, when nothing can be computed", () => {
    expect(krippendorffAlpha([], "nominal").alpha).toBeNull();
    expect(krippendorffAlpha([["a"], ["b"]], "nominal").alpha).toBeNull();
    // Total agreement on a single value: 0 over 0.
    expect(
      krippendorffAlpha(
        [
          ["a", "a"],
          ["a", "a"],
        ],
        "nominal",
      ).alpha,
    ).toBeNull();
  });
});
