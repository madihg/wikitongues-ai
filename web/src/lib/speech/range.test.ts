import { describe, it, expect } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("returns null without a usable single range", () => {
    expect(parseRange(null, 10)).toBeNull();
    expect(parseRange("items=0-1", 10)).toBeNull();
    expect(parseRange("bytes=-", 10)).toBeNull();
    expect(parseRange("bytes=0-1,3-4", 10)).toBeNull();
  });
  it("parses a-b, a- and -n, clamped to the file", () => {
    expect(parseRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseRange("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=2-999", 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange("bytes=-99", 10)).toEqual({ start: 0, end: 9 });
  });
  it("is unsatisfiable past the end or backwards", () => {
    expect(parseRange("bytes=10-", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 10)).toBe("unsatisfiable");
  });
});
