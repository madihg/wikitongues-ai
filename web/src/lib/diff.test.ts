import { describe, it, expect } from "vitest";
import { wordDiff } from "./diff";

describe("wordDiff", () => {
  it("returns all-same for identical strings", () => {
    const segs = wordDiff("ẹnẹ o", "ẹnẹ o");
    expect(segs.every((s) => s.type === "same")).toBe(true);
    expect(segs.map((s) => s.value).join("")).toBe("ẹnẹ o");
  });

  it("reconstructs the original from same+removed segments", () => {
    const original = "the child eats food";
    const corrected = "the child ate the food";
    const segs = wordDiff(original, corrected);
    const rebuiltOriginal = segs
      .filter((s) => s.type !== "added")
      .map((s) => s.value)
      .join("");
    const rebuiltCorrected = segs
      .filter((s) => s.type !== "removed")
      .map((s) => s.value)
      .join("");
    expect(rebuiltOriginal).toBe(original);
    expect(rebuiltCorrected).toBe(corrected);
  });

  it("does not strip diacritics — a tone change is an added/removed token", () => {
    // Same letters, different tone marks: must register as a change, not 'same'.
    const segs = wordDiff("ọmọ", "ọ́mọ́");
    expect(segs.some((s) => s.type === "added")).toBe(true);
    expect(segs.some((s) => s.type === "removed")).toBe(true);
  });

  it("treats pure insertion as added only", () => {
    const segs = wordDiff("good", "very good");
    expect(segs.some((s) => s.type === "removed")).toBe(false);
    expect(segs.some((s) => s.type === "added")).toBe(true);
    expect(
      segs
        .filter((s) => s.type !== "added")
        .map((s) => s.value)
        .join(""),
    ).toBe("good");
  });
});
