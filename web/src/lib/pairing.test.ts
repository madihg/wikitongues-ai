import { describe, it, expect } from "vitest";
import { firstPairs, MAX_SHOWS_PER_PROMPT } from "./pairing";

describe("firstPairs", () => {
  it("caps 3 outputs at 2 pairs and still covers all three models", () => {
    const pairs = firstPairs(3, MAX_SHOWS_PER_PROMPT);
    expect(pairs).toEqual([
      [0, 1],
      [0, 2],
    ]);
    // every output index appears at least once
    const covered = new Set(pairs.flat());
    expect([...covered].sort()).toEqual([0, 1, 2]);
  });

  it("yields a single comparison for 2 outputs", () => {
    expect(firstPairs(2, MAX_SHOWS_PER_PROMPT)).toEqual([[0, 1]]);
  });

  it("returns nothing when there is fewer than one pair", () => {
    expect(firstPairs(1, 2)).toEqual([]);
    expect(firstPairs(0, 2)).toEqual([]);
  });

  it("never returns more than `max` pairs even with many outputs", () => {
    expect(firstPairs(5, 2)).toHaveLength(2);
    expect(firstPairs(5, 2)).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it("returns all C(n,2) pairs when max is not binding", () => {
    expect(firstPairs(3, 10)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });
});
