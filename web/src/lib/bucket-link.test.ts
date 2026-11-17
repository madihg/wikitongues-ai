import { describe, expect, it } from "vitest";
import { bucketFromSearch } from "./buckets";

describe("a catalog link to one category", () => {
  it("reads a real category from the address", () => {
    expect(bucketFromSearch("?bucket=cultural_values")).toBe("cultural_values");
    expect(bucketFromSearch("?page=2&bucket=orthography")).toBe("orthography");
  });

  it("ignores a missing or made-up category", () => {
    expect(bucketFromSearch("")).toBe("");
    expect(bucketFromSearch("?bucket=")).toBe("");
    expect(bucketFromSearch("?bucket=not_a_bucket")).toBe("");
  });
});
