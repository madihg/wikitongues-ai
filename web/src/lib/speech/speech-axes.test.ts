import { describe, it, expect } from "vitest";
import {
  AXES_BLOCK_LABEL,
  AXES_VERSION,
  SPEECH_AXES,
  axesTargetFor,
  sanitizeAxes,
} from "./speech-axes";

describe("speech axes config", () => {
  it("lists exactly the five provisional axes, in order", () => {
    expect(SPEECH_AXES.map((a) => a.key)).toEqual([
      "intelligibility",
      "pronunciation",
      "tone",
      "naturalness",
      "pace",
    ]);
    for (const a of SPEECH_AXES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint).not.toMatch(/—|–/);
    }
  });
  it("labels the block as provisional", () => {
    expect(AXES_BLOCK_LABEL).toBe(
      "Provisional speech axes, Lydia's rubric layer replaces these",
    );
  });
});

describe("axesTargetFor", () => {
  it("winner side, both on a tie, none when unusable or unknown", () => {
    expect(axesTargetFor("a")).toBe("a");
    expect(axesTargetFor("b")).toBe("b");
    expect(axesTargetFor("tie")).toBe("both");
    expect(axesTargetFor("both_unusable")).toBeNull();
    expect(axesTargetFor("x")).toBeNull();
  });
});

describe("sanitizeAxes", () => {
  it("is null when absent or empty", () => {
    expect(sanitizeAxes(undefined, "a")).toBeNull();
    expect(sanitizeAxes(null, "a")).toBeNull();
    expect(sanitizeAxes({}, "a")).toBeNull();
  });
  it("keeps 0 to 5 and na, tagged with version and target", () => {
    expect(sanitizeAxes({ tone: 0, pace: 5, naturalness: "na" }, "b")).toEqual({
      version: AXES_VERSION,
      target: "b",
      scores: { tone: 0, pace: 5, naturalness: "na" },
    });
    expect(sanitizeAxes({ tone: 3 }, "tie")).toMatchObject({ target: "both" });
  });
  it("is invalid for anything else", () => {
    for (const raw of [
      { tone: 6 },
      { tone: -1 },
      { tone: 1.5 },
      { tone: "3" },
      { tone: null },
      { loudness: 2 },
      [1],
      "x",
      5,
    ]) {
      expect(sanitizeAxes(raw, "a"), JSON.stringify(raw)).toBe("invalid");
    }
  });
  it("a both-unusable verdict takes no axes", () => {
    expect(sanitizeAxes({ tone: 3 }, "both_unusable")).toBe("invalid");
    expect(sanitizeAxes(undefined, "both_unusable")).toBeNull();
  });
});
