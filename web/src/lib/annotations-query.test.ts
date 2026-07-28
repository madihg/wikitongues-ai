import { describe, it, expect } from "vitest";
import {
  parseAnnotationsQuery,
  excerpt,
  foldIgala,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
} from "./annotations-query";

function q(s: string): URLSearchParams {
  return new URLSearchParams(s);
}

describe("parseAnnotationsQuery", () => {
  it("returns safe defaults for an empty query", () => {
    expect(parseAnnotationsQuery(q(""))).toEqual({
      annotatorId: null,
      type: null,
      bucket: null,
      includeDemo: false,
      limit: DEFAULT_LIMIT,
      offset: 0,
      q: null,
    });
  });

  it("parses the deep-link contract params (annotator + type)", () => {
    const parsed = parseAnnotationsQuery(q("annotator=user_123&type=cold"));
    expect(parsed.annotatorId).toBe("user_123");
    expect(parsed.type).toBe("cold");
  });

  it("prefers annotatorId over the annotator alias", () => {
    const parsed = parseAnnotationsQuery(
      q("annotatorId=a&annotator=b&type=edit"),
    );
    expect(parsed.annotatorId).toBe("a");
    expect(parsed.type).toBe("edit");
  });

  it("drops unknown type and bucket rather than throwing", () => {
    const parsed = parseAnnotationsQuery(q("type=nonsense&bucket=nope"));
    expect(parsed.type).toBeNull();
    expect(parsed.bucket).toBeNull();
  });

  it("accepts a valid EvalBucket", () => {
    expect(parseAnnotationsQuery(q("bucket=orthography")).bucket).toBe(
      "orthography",
    );
  });

  it("treats demo as opt-in only", () => {
    expect(parseAnnotationsQuery(q("")).includeDemo).toBe(false);
    expect(parseAnnotationsQuery(q("includeDemo=true")).includeDemo).toBe(true);
    expect(parseAnnotationsQuery(q("includeDemo=1")).includeDemo).toBe(true);
    expect(parseAnnotationsQuery(q("includeDemo=false")).includeDemo).toBe(
      false,
    );
  });

  it("clamps limit within [1, MAX_LIMIT] and falls back on garbage", () => {
    expect(parseAnnotationsQuery(q("limit=10")).limit).toBe(10);
    expect(parseAnnotationsQuery(q("limit=0")).limit).toBe(1);
    expect(parseAnnotationsQuery(q("limit=9999")).limit).toBe(MAX_LIMIT);
    expect(parseAnnotationsQuery(q("limit=abc")).limit).toBe(DEFAULT_LIMIT);
  });

  it("reads offset, aliases cursor, and floors at 0", () => {
    expect(parseAnnotationsQuery(q("offset=50")).offset).toBe(50);
    expect(parseAnnotationsQuery(q("cursor=25")).offset).toBe(25);
    expect(parseAnnotationsQuery(q("offset=-5")).offset).toBe(0);
  });

  it("prefers offset over the cursor alias", () => {
    expect(parseAnnotationsQuery(q("offset=10&cursor=99")).offset).toBe(10);
  });

  it("returns null q when absent", () => {
    expect(parseAnnotationsQuery(q("")).q).toBeNull();
  });

  it("trims a search query", () => {
    expect(
      parseAnnotationsQuery(q("q=" + encodeURIComponent("  odudu  "))).q,
    ).toBe("odudu");
  });

  it("ignores a query shorter than MIN_QUERY_LENGTH after trim", () => {
    expect(parseAnnotationsQuery(q("q=a")).q).toBeNull();
    expect(
      parseAnnotationsQuery(q("q=" + encodeURIComponent(" a "))).q,
    ).toBeNull();
    expect(parseAnnotationsQuery(q("q=" + " ".repeat(5))).q).toBeNull();
  });

  it("keeps a query exactly MIN_QUERY_LENGTH chars long", () => {
    const raw = "x".repeat(MIN_QUERY_LENGTH);
    expect(parseAnnotationsQuery(q(`q=${raw}`)).q).toBe(raw);
  });

  it("caps a search query at MAX_QUERY_LENGTH chars", () => {
    const long = "x".repeat(150);
    const parsed = parseAnnotationsQuery(q(`q=${long}`));
    expect(parsed.q).toHaveLength(MAX_QUERY_LENGTH);
    expect(parsed.q).toBe("x".repeat(MAX_QUERY_LENGTH));
  });

  it("trims after capping, so trailing whitespace inside the cap is dropped", () => {
    // 98 x's + 2 spaces = 100 chars once capped; trimming then drops the
    // trailing spaces, leaving 98 chars rather than an off-by-one at 100.
    const raw = "x".repeat(98) + "  " + "y".repeat(20);
    const parsed = parseAnnotationsQuery(q(`q=${raw}`));
    expect(parsed.q).toBe("x".repeat(98));
  });
});

describe("excerpt", () => {
  it("returns short text unchanged", () => {
    expect(excerpt("short answer")).toBe("short answer");
  });

  it("collapses whitespace to single spaces", () => {
    expect(excerpt("a\n  b\t c")).toBe("a b c");
  });

  it("truncates to n chars with an ellipsis", () => {
    const long = "x".repeat(120);
    const out = excerpt(long, 80);
    expect(out).toHaveLength(81); // 80 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("foldIgala", () => {
  it("folds a precomposed dotted vowel + lowercases", () => {
    // "Ọ" (U+1ECD, LATIN CAPITAL LETTER O WITH DOT BELOW) - the shape most
    // Igala orthography in the data uses for this sound.
    expect(foldIgala("Ọdudu")).toBe("odudu");
  });

  it("folds precomposed tone marks", () => {
    // "ó" (U+00F3, o + acute) and "ù" (U+00F9, u + grave).
    expect(foldIgala("ódùdù")).toBe("odudu");
  });

  it("folds a mixed sequence: precomposed dot-below base + standalone combining mark", () => {
    // Production ColdAuthorAnswer rows store toned dotted vowels this way
    // (e.g. "ẹ́gẹ") because Unicode has no single precomposed codepoint for
    // "dot-below e + acute tone": "ẹ" (U+1EB9, precomposed dot-below e)
    // immediately followed by a bare combining acute (U+0301).
    expect(foldIgala("ẹ́gbe")).toBe("egbe");
    expect(foldIgala("ẹ́gẹ")).toBe("ege"); // "ẹ́gẹ" itself
  });

  it("leaves plain ASCII unchanged aside from case", () => {
    expect(foldIgala("hello world")).toBe("hello world");
  });
});
