import { describe, it, expect } from "vitest";
import {
  EDIT_REASON_TAGS,
  EDIT_REASON_TAG_KEYS,
  FAILURE_TAGS,
  FAILURE_TAG_KEYS,
  editReasonTagLabel,
  failureTagLabel,
  failureTagSides,
  failureTagsSatisfy,
  isFailureTag,
  missingFailureTagSides,
  sanitizeEditReasonTags,
  sanitizeFailureTags,
} from "./failure-tags";

describe("FAILURE_TAGS config", () => {
  it("has unique keys", () => {
    expect(new Set(FAILURE_TAG_KEYS).size).toBe(FAILURE_TAG_KEYS.length);
  });

  it("covers the diagnostic set agreed with the linguistics lead", () => {
    expect(FAILURE_TAG_KEYS).toEqual([
      "not_igala",
      "wrong_language",
      "wrong_word",
      "tone_marks",
      "invented",
      "grammar",
      "cultural",
      "english_mixed",
    ]);
  });

  it("gives every tag a non-empty plain-English label and hint", () => {
    for (const t of FAILURE_TAGS) {
      expect(t.label.trim().length).toBeGreaterThan(0);
      expect(t.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("writes labels without em dashes (house style)", () => {
    for (const t of FAILURE_TAGS) {
      expect(t.label).not.toContain("—");
      expect(t.hint).not.toContain("—");
    }
  });
});

describe("isFailureTag", () => {
  it("accepts every configured key", () => {
    for (const k of FAILURE_TAG_KEYS) expect(isFailureTag(k)).toBe(true);
  });

  it("rejects unknown keys and non-strings", () => {
    for (const v of [
      "not_a_tag",
      "",
      "NOT_IGALA",
      " not_igala",
      null,
      undefined,
      42,
      {},
      ["not_igala"],
    ]) {
      expect(isFailureTag(v)).toBe(false);
    }
  });
});

describe("sanitizeFailureTags", () => {
  it("keeps only known tags", () => {
    expect(sanitizeFailureTags(["not_igala", "bogus", "grammar"])).toEqual([
      "not_igala",
      "grammar",
    ]);
  });

  it("de-duplicates", () => {
    expect(sanitizeFailureTags(["grammar", "grammar", "grammar"])).toEqual([
      "grammar",
    ]);
  });

  it("normalizes to config order regardless of input order", () => {
    const a = sanitizeFailureTags(["english_mixed", "not_igala", "wrong_word"]);
    const b = sanitizeFailureTags(["wrong_word", "english_mixed", "not_igala"]);
    expect(a).toEqual(b);
    expect(a).toEqual(["not_igala", "wrong_word", "english_mixed"]);
  });

  it("returns an empty array for every malformed shape (never throws)", () => {
    for (const v of [
      null,
      undefined,
      "not_igala",
      42,
      {},
      { 0: "not_igala" },
      true,
    ]) {
      expect(sanitizeFailureTags(v)).toEqual([]);
    }
  });

  it("drops non-string members without discarding the valid ones", () => {
    expect(
      sanitizeFailureTags([null, "grammar", 7, undefined, { key: "invented" }]),
    ).toEqual(["grammar"]);
  });

  it("round-trips the full tag set", () => {
    expect(sanitizeFailureTags(FAILURE_TAG_KEYS)).toEqual(FAILURE_TAG_KEYS);
  });
});

describe("failureTagLabel", () => {
  it("resolves known keys to their plain-English label", () => {
    expect(failureTagLabel("not_igala")).toBe("Not Igala at all");
    expect(failureTagLabel("english_mixed")).toBe(
      "Mixed English into the answer",
    );
  });

  it("falls back to the raw key for a retired tag, so old rows still render", () => {
    expect(failureTagLabel("some_retired_tag")).toBe("some_retired_tag");
  });
});

describe("failureTagSides", () => {
  it("offers both sides when nothing was adequate", () => {
    expect(failureTagSides("both_inadequate")).toEqual({ a: true, b: true });
  });

  it("offers only the losing side when a winner is picked", () => {
    expect(failureTagSides("a")).toEqual({ a: false, b: true });
    expect(failureTagSides("b")).toEqual({ a: true, b: false });
  });

  it("offers neither on a tie - both were judged adequate", () => {
    expect(failureTagSides("tie")).toEqual({ a: false, b: false });
  });

  it("offers neither before a pick is made, or on garbage input", () => {
    for (const v of [null, undefined, "", "whatever"]) {
      expect(failureTagSides(v)).toEqual({ a: false, b: false });
    }
  });

  it("never offers tags on the winning side", () => {
    expect(failureTagSides("a").a).toBe(false);
    expect(failureTagSides("b").b).toBe(false);
  });
});

describe("missingFailureTagSides / failureTagsSatisfy (the required WHY, 2026-08-28 rework)", () => {
  it("winner a: the losing side B must carry at least one tag", () => {
    expect(missingFailureTagSides("a", [], [])).toEqual({ a: false, b: true });
    expect(missingFailureTagSides("a", [], ["wrong_language"])).toEqual({
      a: false,
      b: false,
    });
    expect(failureTagsSatisfy("a", [], [])).toBe(false);
    expect(failureTagsSatisfy("a", [], ["wrong_language"])).toBe(true);
  });

  it("winner b: the losing side A must carry at least one tag", () => {
    expect(missingFailureTagSides("b", [], [])).toEqual({ a: true, b: false });
    expect(failureTagsSatisfy("b", ["grammar"], [])).toBe(true);
    expect(failureTagsSatisfy("b", [], ["grammar"])).toBe(false); // wrong side
  });

  it("both_inadequate: BOTH sides must carry at least one tag each", () => {
    expect(missingFailureTagSides("both_inadequate", [], [])).toEqual({
      a: true,
      b: true,
    });
    expect(
      missingFailureTagSides("both_inadequate", ["not_igala"], []),
    ).toEqual({ a: false, b: true });
    expect(
      failureTagsSatisfy("both_inadequate", ["not_igala"], ["grammar"]),
    ).toBe(true);
    expect(failureTagsSatisfy("both_inadequate", ["not_igala"], [])).toBe(
      false,
    );
  });

  it("tie and no-pick require nothing - there is no rejected output to diagnose", () => {
    expect(missingFailureTagSides("tie", [], [])).toEqual({
      a: false,
      b: false,
    });
    expect(failureTagsSatisfy("tie", [], [])).toBe(true);
    expect(failureTagsSatisfy(null, [], [])).toBe(true);
    expect(failureTagsSatisfy(undefined, [], [])).toBe(true);
  });

  it("tags on a non-required side never satisfy a missing required side", () => {
    // The winner's own (stale) chips can't stand in for the loser's diagnosis.
    expect(failureTagsSatisfy("a", ["grammar", "not_igala"], [])).toBe(false);
  });

  it("agrees with failureTagSides: required sides are exactly the offered sides", () => {
    for (const winner of ["a", "b", "tie", "both_inadequate", null]) {
      const offered = failureTagSides(winner);
      const missing = missingFailureTagSides(winner, [], []);
      expect(missing).toEqual(offered); // no tags at all -> missing == offered
    }
  });
});

describe("EDIT_REASON_TAGS config (the editing ground)", () => {
  it("is the pairwise taxonomy plus the two edit-only entries, one vocabulary", () => {
    expect(EDIT_REASON_TAG_KEYS.slice(0, FAILURE_TAG_KEYS.length)).toEqual(
      FAILURE_TAG_KEYS,
    );
    expect(EDIT_REASON_TAG_KEYS).toContain("unsure");
    expect(EDIT_REASON_TAG_KEYS).toContain("other");
    expect(EDIT_REASON_TAGS.length).toBe(FAILURE_TAGS.length + 2);
  });

  it("has unique keys and a label + hint on every entry", () => {
    expect(new Set(EDIT_REASON_TAG_KEYS).size).toBe(EDIT_REASON_TAGS.length);
    for (const tag of EDIT_REASON_TAGS) {
      expect(tag.label.length).toBeGreaterThan(0);
      expect(tag.hint.length).toBeGreaterThan(0);
    }
  });

  it("editReasonTagLabel resolves edit-only keys and falls back to the raw key", () => {
    expect(editReasonTagLabel("unsure")).toBe("Not sure - please check");
    expect(editReasonTagLabel("tone_marks")).toBe(
      failureTagLabel("tone_marks"),
    );
    expect(editReasonTagLabel("retired_key")).toBe("retired_key");
  });
});

describe("sanitizeEditReasonTags", () => {
  it("accepts the edit-only keys the pairwise sanitizer would drop", () => {
    expect(sanitizeEditReasonTags(["unsure", "other"])).toEqual([
      "unsure",
      "other",
    ]);
    expect(sanitizeFailureTags(["unsure"])).toEqual([]); // vocabularies stay distinct
  });

  it("drops unknown keys and non-strings, de-duplicates, preserves config order", () => {
    expect(
      sanitizeEditReasonTags(["other", "tone_marks", "zzz", 7, "tone_marks"]),
    ).toEqual(["tone_marks", "other"]);
  });

  it("never throws on garbage - degrades to no tags", () => {
    for (const garbage of [null, undefined, "x", 42, {}, [{}], [null]]) {
      expect(() => sanitizeEditReasonTags(garbage)).not.toThrow();
    }
    expect(sanitizeEditReasonTags("not an array")).toEqual([]);
  });
});
