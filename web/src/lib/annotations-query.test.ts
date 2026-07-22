import { describe, it, expect } from "vitest";
import {
  parseAnnotationsQuery,
  excerpt,
  DEFAULT_LIMIT,
  MAX_LIMIT,
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
