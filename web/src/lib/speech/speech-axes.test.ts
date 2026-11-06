import { describe, it, expect } from "vitest";
import {
  AXES_BLOCK_LABEL,
  AXES_VERSION,
  SPEECH_AXES,
  readStoredAxes,
  sanitizeAxes,
  takesAxes,
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

describe("takesAxes", () => {
  it("a, b and tie take axes on both clips; both unusable and unknown take none", () => {
    expect(takesAxes("a")).toBe(true);
    expect(takesAxes("b")).toBe(true);
    expect(takesAxes("tie")).toBe(true);
    expect(takesAxes("both_unusable")).toBe(false);
    expect(takesAxes("x")).toBe(false);
  });
});

describe("sanitizeAxes", () => {
  it("is null when absent or both sides are empty", () => {
    expect(sanitizeAxes(undefined, "a")).toBeNull();
    expect(sanitizeAxes(null, "a")).toBeNull();
    expect(sanitizeAxes({}, "a")).toBeNull();
    expect(sanitizeAxes({ a: {}, b: {} }, "tie")).toBeNull();
  });
  it("keeps both sides, 0 to 5 and na, whatever the verdict", () => {
    const raw = {
      a: { tone: 0, pace: 5, naturalness: "na" },
      b: { tone: 2, intelligibility: 4 },
    };
    for (const winner of ["a", "b", "tie"]) {
      expect(sanitizeAxes(raw, winner)).toEqual({
        version: AXES_VERSION,
        scores: raw,
      });
    }
  });
  it("stores no target on new rows", () => {
    const out = sanitizeAxes({ a: { tone: 3 }, b: { tone: 1 } }, "a");
    expect(out).not.toHaveProperty("target");
  });
  it("accepts one side only, filling the other with an empty set", () => {
    expect(sanitizeAxes({ b: { pace: 1 } }, "a")).toEqual({
      version: AXES_VERSION,
      scores: { a: {}, b: { pace: 1 } },
    });
    expect(sanitizeAxes({ a: { pace: "na" }, b: {} }, "b")).toEqual({
      version: AXES_VERSION,
      scores: { a: { pace: "na" }, b: {} },
    });
  });
  it("is invalid for a malformed value or key on either side", () => {
    for (const side of [
      { tone: 6 },
      { tone: -1 },
      { tone: 1.5 },
      { tone: "3" },
      { tone: null },
      { loudness: 2 },
      [1],
      "x",
      5,
      null,
    ]) {
      expect(sanitizeAxes({ a: side }, "a"), JSON.stringify(side)).toBe(
        "invalid",
      );
      expect(
        sanitizeAxes({ a: { tone: 3 }, b: side }, "tie"),
        JSON.stringify(side),
      ).toBe("invalid");
    }
    expect(sanitizeAxes({ a: {}, c: { tone: 3 } }, "a")).toBe("invalid");
    for (const raw of [[1], "x", 5]) {
      expect(sanitizeAxes(raw, "a"), JSON.stringify(raw)).toBe("invalid");
    }
  });
  it("refuses the flat legacy shape now that the screen sends both sides", () => {
    expect(sanitizeAxes({ tone: 3 }, "a")).toBe("invalid");
    expect(sanitizeAxes({ tone: 3, pace: "na" }, "tie")).toBe("invalid");
  });
  it("a both-unusable verdict takes no axes", () => {
    expect(sanitizeAxes({ a: { tone: 3 } }, "both_unusable")).toBe("invalid");
    expect(sanitizeAxes({ b: { pace: "na" } }, "both_unusable")).toBe(
      "invalid",
    );
    expect(sanitizeAxes(undefined, "both_unusable")).toBeNull();
    expect(sanitizeAxes({ a: {}, b: {} }, "both_unusable")).toBeNull();
  });
});

describe("readStoredAxes", () => {
  it("reads the new two-sided shape as stored", () => {
    const row = {
      version: AXES_VERSION,
      scores: { a: { tone: 3 }, b: { tone: "na" } },
    };
    expect(readStoredAxes(row)).toEqual(row);
  });
  it("reads an old provisional-1 row onto the side it described", () => {
    const scores = { tone: 4, pace: "na" };
    expect(readStoredAxes({ version: "provisional-1", target: "a", scores }))
      .toEqual({ version: "provisional-1", scores: { a: scores, b: {} } });
    expect(readStoredAxes({ version: "provisional-1", target: "b", scores }))
      .toEqual({ version: "provisional-1", scores: { a: {}, b: scores } });
    expect(
      readStoredAxes({ version: "provisional-1", target: "both", scores }),
    ).toEqual({ version: "provisional-1", scores: { a: scores, b: scores } });
  });
  it("is null for an empty column or anything unreadable", () => {
    for (const raw of [
      null,
      undefined,
      "x",
      [1],
      {},
      { version: "provisional-1" },
      { version: "provisional-1", target: "c", scores: { tone: 1 } },
      { version: "provisional-1", scores: { a: { tone: 9 }, b: {} } },
      { scores: { a: {}, b: {} } },
    ]) {
      expect(readStoredAxes(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});
