import { describe, it, expect } from "vitest";
import {
  FAILURE_TAGS,
  FAILURE_TAG_KEYS,
  failureTagLabel,
  failureTagSides,
  isFailureTag,
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
