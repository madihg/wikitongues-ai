import { describe, it, expect } from "vitest";
import {
  AXES_BLOCK_LABEL,
  AXES_SETS,
  AXES_VERSION,
  LYDIA_AXES,
  LYDIA_RUBRIC_READY,
  PROVISIONAL_AXES,
  SPEECH_AXES,
  activeAxesSet,
  axesSetFor,
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
      expect(a.hint).not.toMatch(/\u2014|\u2013/);
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

describe("the axes version mechanism", () => {
  it("keeps the provisional set active while the Lydia rubric is not ready", () => {
    expect(LYDIA_RUBRIC_READY).toBe(false);
    expect(AXES_VERSION).toBe("provisional-1");
    expect(SPEECH_AXES).toBe(PROVISIONAL_AXES.axes);
  });
  it("switches the active set on the guard constant alone", () => {
    expect(activeAxesSet(false)).toBe(PROVISIONAL_AXES);
    expect(activeAxesSet(true)).toBe(LYDIA_AXES);
    expect(LYDIA_AXES.version).toBe("lydia-1");
  });
  it("knows every version a stored judgment may carry, and no other", () => {
    expect(Object.keys(AXES_SETS).sort()).toEqual(["lydia-1", "provisional-1"]);
    expect(axesSetFor("provisional-1")).toBe(PROVISIONAL_AXES);
    expect(axesSetFor("lydia-1")).toBe(LYDIA_AXES);
    expect(axesSetFor("lydia-2")).toBeNull();
    expect(axesSetFor("__proto__")).toBeNull();
  });
  it("scores against the named version and stamps it, so old rows keep theirs", () => {
    expect(sanitizeAxes({ tone: 4 }, "a", "provisional-1")).toMatchObject({ version: "provisional-1" });
    expect(sanitizeAxes({ rubric_slot: 2 }, "a", "lydia-1")).toMatchObject({
      version: "lydia-1",
      scores: { rubric_slot: 2 },
    });
    // a key from one set is not valid in the other
    expect(sanitizeAxes({ tone: 4 }, "a", "lydia-1")).toBe("invalid");
    expect(sanitizeAxes({ rubric_slot: 2 }, "a", "provisional-1")).toBe("invalid");
    expect(sanitizeAxes({ tone: 4 }, "a", "nope")).toBe("invalid");
  });
  it("the default is the active version", () => {
    expect(sanitizeAxes({ tone: 4 }, "a")).toMatchObject({ version: AXES_VERSION });
  });
});
