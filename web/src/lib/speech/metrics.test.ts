import { describe, it, expect } from "vitest";
import fixture from "./metrics.fixtures.json";
import {
  cer,
  wer,
  werToneRetained,
  toneErrorRate,
  scoreAll,
} from "./metrics";

const round4 = (n: number) => Math.round(n * 10000) / 10000;

describe("metrics fixture (shared with worker/tests/test_metrics.py)", () => {
  it("has at least 12 cases", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(12);
  });

  for (const c of fixture.cases) {
    it(`${c.id}: ${c.note}`, () => {
      expect(round4(cer(c.ref, c.hyp))).toBe(c.cer);
      expect(round4(wer(c.ref, c.hyp))).toBe(c.werStripped);
      expect(round4(werToneRetained(c.ref, c.hyp))).toBe(c.werRetained);
      expect(round4(toneErrorRate(c.ref, c.hyp))).toBe(c.ter);
      const all = scoreAll(c.ref, c.hyp);
      expect(round4(all.cer)).toBe(c.cer);
      expect(round4(all.werStripped)).toBe(c.werStripped);
      expect(round4(all.werRetained)).toBe(c.werRetained);
      expect(round4(all.ter)).toBe(c.ter);
    });
  }
});

describe("metrics definitions", () => {
  it("scoreAll returns exactly the four numbers", () => {
    expect(Object.keys(scoreAll("tava", "tava")).sort()).toEqual([
      "cer",
      "ter",
      "werRetained",
      "werStripped",
    ]);
  });

  it("CER and WER ignore tone marks, werToneRetained does not", () => {
    expect(cer("táva", "tava")).toBe(0);
    expect(wer("táva", "tava")).toBe(0);
    expect(werToneRetained("táva", "tava")).toBe(1);
  });

  it("TER is zero when the reference carries no tone marks", () => {
    expect(toneErrorRate("tava lime", "táva lime")).toBe(0);
  });

  it("composed and decomposed spellings score as identical", () => {
    expect(scoreAll("á", "á")).toEqual({
      cer: 0,
      werStripped: 0,
      werRetained: 0,
      ter: 0,
    });
  });
});
