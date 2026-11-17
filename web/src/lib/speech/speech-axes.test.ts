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
  readStoredAxes,
  sanitizeAxes,
  takesAxes,
} from "./speech-axes";

describe("speech axes config", () => {
  it("lists exactly Lydia's six axes, in order", () => {
    expect(SPEECH_AXES.map((a) => a.key)).toEqual([
      "intelligibility",
      "pronunciation",
      "loanwords",
      "tone",
      "prosody",
      "flow",
    ]);
    for (const a of SPEECH_AXES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint).not.toMatch(/\u2014|\u2013/);
    }
  });
  it("labels the block as the speech rubric", () => {
    expect(AXES_BLOCK_LABEL).toBe(
      "Speech rubric",
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
      a: { tone: 0, flow: 5, prosody: "na" },
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
    expect(sanitizeAxes({ b: { flow: 1 } }, "a")).toEqual({
      version: AXES_VERSION,
      scores: { a: {}, b: { flow: 1 } },
    });
    expect(sanitizeAxes({ a: { flow: "na" }, b: {} }, "b")).toEqual({
      version: AXES_VERSION,
      scores: { a: { flow: "na" }, b: {} },
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
    expect(sanitizeAxes({ tone: 3, flow: "na" }, "tie")).toBe("invalid");
  });
  it("a both-unusable verdict takes no axes", () => {
    expect(sanitizeAxes({ a: { tone: 3 } }, "both_unusable")).toBe("invalid");
    expect(sanitizeAxes({ b: { flow: "na" } }, "both_unusable")).toBe(
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

describe("the axes version mechanism", () => {
  it("scores new judgments under Lydia's rubric since Nov 17 2026", () => {
    expect(LYDIA_RUBRIC_READY).toBe(true);
    expect(AXES_VERSION).toBe("lydia-1");
    expect(SPEECH_AXES).toBe(LYDIA_AXES.axes);
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
    expect(
      sanitizeAxes({ a: { tone: 4 } }, "a", "provisional-1"),
    ).toMatchObject({ version: "provisional-1" });
    expect(
      sanitizeAxes({ a: { loanwords: 2 }, b: {} }, "a", "lydia-1"),
    ).toEqual({
      version: "lydia-1",
      scores: { a: { loanwords: 2 }, b: {} },
    });
    // a key from one set is not valid in the other, on either side
    expect(sanitizeAxes({ a: { naturalness: 4 } }, "a", "lydia-1")).toBe("invalid");
    expect(sanitizeAxes({ b: { naturalness: 4 } }, "a", "lydia-1")).toBe("invalid");
    expect(sanitizeAxes({ a: { loanwords: 2 } }, "a", "provisional-1")).toBe(
      "invalid",
    );
    expect(sanitizeAxes({ a: { tone: 4 } }, "a", "nope")).toBe("invalid");
  });
  it("the default is the active version", () => {
    expect(sanitizeAxes({ a: { tone: 4 } }, "a")).toMatchObject({
      version: AXES_VERSION,
    });
  });
  it("reads a stored row against the rubric it was scored under", () => {
    const row = { version: "lydia-1", scores: { a: { loanwords: 1 }, b: {} } };
    expect(readStoredAxes(row)).toEqual(row);
    // a key only the stand-in set had is not a lydia-1 key, and an unknown
    // version is unreadable
    expect(
      readStoredAxes({ version: "lydia-1", scores: { a: { naturalness: 1 }, b: {} } }),
    ).toBeNull();
    expect(
      readStoredAxes({ version: "lydia-2", scores: { a: {}, b: {} } }),
    ).toBeNull();
  });
});
