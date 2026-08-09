import { describe, it, expect } from "vitest";
import {
  mean,
  percentile,
  bootstrapMean,
  pairedBootstrapDelta,
  wilsonInterval,
  pearson,
  mulberry32,
  MIN_BOOTSTRAP_N,
} from "./stats";

describe("mean / percentile", () => {
  it("handles empty input without NaN", () => {
    expect(mean([])).toBe(0);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("interpolates percentiles", () => {
    expect(percentile([0, 1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([0, 10], 0.25)).toBeCloseTo(2.5, 10);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("bootstrapMean", () => {
  it("refuses to invent an interval below the minimum n", () => {
    const r = bootstrapMean([0.1, 0.2, 0.3]);
    expect(r.n).toBe(3);
    expect(r.underpowered).toBe(true);
    expect(r.ciLow).toBe(r.mean);
    expect(r.ciHigh).toBe(r.mean);
    expect(MIN_BOOTSTRAP_N).toBeGreaterThan(3);
  });

  it("brackets the point estimate and is reproducible", () => {
    const xs = Array.from({ length: 40 }, (_, i) => i / 40);
    const a = bootstrapMean(xs);
    const b = bootstrapMean(xs);
    expect(a).toEqual(b);
    expect(a.underpowered).toBe(false);
    expect(a.ciLow).toBeLessThanOrEqual(a.mean);
    expect(a.ciHigh).toBeGreaterThanOrEqual(a.mean);
  });

  it("gives a zero-width interval for a constant sample", () => {
    const r = bootstrapMean(new Array(30).fill(0.5));
    expect(r.mean).toBeCloseTo(0.5, 10);
    expect(r.ciHigh - r.ciLow).toBeCloseTo(0, 10);
  });

  it("narrows as n grows", () => {
    const rand = mulberry32(7);
    const small = Array.from({ length: 20 }, () => rand());
    const big = Array.from({ length: 2000 }, () => rand());
    const w = (xs: number[]) => {
      const r = bootstrapMean(xs);
      return r.ciHigh - r.ciLow;
    };
    expect(w(big)).toBeLessThan(w(small));
  });
});

describe("pairedBootstrapDelta", () => {
  it("throws on unaligned inputs rather than silently truncating", () => {
    expect(() => pairedBootstrapDelta([1, 2, 3], [1, 2])).toThrow(/unaligned/);
  });

  it("calls a large consistent gap distinguishable", () => {
    const a = Array.from({ length: 40 }, (_, i) => 0.8 + (i % 5) * 0.01);
    const b = Array.from({ length: 40 }, (_, i) => 0.2 + (i % 5) * 0.01);
    const r = pairedBootstrapDelta(a, b);
    expect(r.distinguishable).toBe(true);
    expect(r.mean).toBeCloseTo(0.6, 6);
    expect(r.ciLow).toBeGreaterThan(0);
  });

  it("calls a noisy zero-mean difference NOT distinguishable", () => {
    const rand = mulberry32(11);
    const a = Array.from({ length: 43 }, () => rand());
    const b = Array.from({ length: 43 }, () => rand());
    const r = pairedBootstrapDelta(a, b);
    expect(r.distinguishable).toBe(false);
    expect(r.ciLow).toBeLessThan(0);
    expect(r.ciHigh).toBeGreaterThan(0);
  });

  it("is never distinguishable when n is below the bootstrap minimum", () => {
    const r = pairedBootstrapDelta([1, 1, 1], [0, 0, 0]);
    expect(r.underpowered).toBe(true);
    expect(r.distinguishable).toBe(false);
  });

  it("reports both group means", () => {
    const r = pairedBootstrapDelta([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]);
    expect(r.meanA).toBe(1);
    expect(r.meanB).toBe(0);
  });
});

describe("wilsonInterval", () => {
  it("returns the full range for n = 0", () => {
    const r = wilsonInterval(0, 0);
    expect(r).toMatchObject({ ciLow: 0, ciHigh: 1, n: 0, underpowered: true });
  });

  it("stays inside [0, 1] even at the extremes", () => {
    const r = wilsonInterval(5, 5);
    expect(r.ciLow).toBeGreaterThan(0);
    expect(r.ciHigh).toBeLessThanOrEqual(1);
  });

  it("is very wide at n = 5 - the honesty case", () => {
    // The whole reason the autorater report refuses to quote an accuracy from
    // 5 decided comparisons.
    const r = wilsonInterval(4, 5);
    expect(r.ciHigh - r.ciLow).toBeGreaterThan(0.4);
    expect(r.underpowered).toBe(true);
  });

  it("matches the textbook value for 50/100", () => {
    const r = wilsonInterval(50, 100);
    expect(r.mean).toBe(0.5);
    expect(r.ciLow).toBeCloseTo(0.4038, 3);
    expect(r.ciHigh).toBeCloseTo(0.5962, 3);
    expect(r.underpowered).toBe(false);
  });
});

describe("pearson", () => {
  it("is 1 / -1 for perfect relationships and 0 for degenerate input", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(pearson([1], [1])).toBe(0);
  });
});
