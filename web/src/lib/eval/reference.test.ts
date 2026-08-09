import { describe, it, expect } from "vitest";
import {
  scoreAgainstReferences,
  interGoldAgreement,
  REFERENCE_METRICS,
  METRIC_LABELS,
} from "./reference";

/** Real multi-annotator gold for ig_bank_orth_012 ("hand"/"vehicle" family). */
const REAL_GOLD_TIGHT = ["Ọdudu", "ọdudu", "ódùdù", "Ọ lo’dudu", "Wọla ọdudu"];

/** Real gold for an OPEN prompt - the annotators genuinely disagree. */
const REAL_GOLD_OPEN = [
  "Agba du ba ñwu mi",
  "Agba ẹñwu choduwẹ",
  "Agba ọjọ ki pẹnẹ",
  "Agba, mẹ w'ọla eche",
  "Ámá má ká kìnì Ògìjò á wà, á mà dèdè ñwù",
];

describe("scoreAgainstReferences", () => {
  it("returns zeros (not NaN) when a prompt has no gold", () => {
    const s = scoreAgainstReferences("anything", []);
    expect(s.nReferences).toBe(0);
    for (const m of REFERENCE_METRICS) {
      expect(s.best[m]).toBe(0);
      expect(s.meanOverRefs[m]).toBe(0);
    }
  });

  it("scores an exact copy of one gold at the ceiling of every metric", () => {
    const s = scoreAgainstReferences("ọdudu", REAL_GOLD_TIGHT);
    expect(s.best.exactMatch).toBe(1);
    expect(s.best.chrf).toBeCloseTo(1, 10);
    expect(s.best.tokenEditSimilarity).toBe(1);
  });

  it("keeps best >= mean for every metric", () => {
    const s = scoreAgainstReferences("Ọ lo’dudu", REAL_GOLD_TIGHT);
    for (const m of REFERENCE_METRICS) {
      expect(s.best[m]).toBeGreaterThanOrEqual(s.meanOverRefs[m] - 1e-12);
    }
  });

  it("flags a tone-only miss as toneVariantOnly", () => {
    // ódùdù carries tone; ọdudu does not. A hypothesis that matches only after
    // tone folding must be reported as a near miss, not a match.
    const s = scoreAgainstReferences("odudu", ["ódùdù"]);
    expect(s.best.exactMatch).toBe(0);
    expect(s.best.toneInsensitiveMatch).toBe(1);
    expect(s.toneVariantOnly).toBe(true);
  });

  it("does not call it a tone variant when the dotted vowel differs", () => {
    const s = scoreAgainstReferences("odudu", ["ọdudu"]);
    expect(s.best.toneInsensitiveMatch).toBe(0);
    expect(s.toneVariantOnly).toBe(false);
    // ... but the loosest fold DOES match, which is why folded match is only
    // ever reported as an upper bound.
    expect(s.best.foldedMatch).toBe(1);
  });

  it("scores an English answer to an Igala prompt near zero", () => {
    const s = scoreAgainstReferences(
      "The Igala word for vehicle is a common everyday term.",
      REAL_GOLD_TIGHT,
    );
    expect(s.best.chrf).toBeLessThan(0.25);
    expect(s.best.exactMatch).toBe(0);
  });

  it("labels every metric it reports", () => {
    for (const m of REFERENCE_METRICS) {
      expect(METRIC_LABELS[m]).toBeTruthy();
    }
  });
});

describe("interGoldAgreement - the human ceiling", () => {
  it("is not computable from a single gold answer", () => {
    const c = interGoldAgreement(["ọdudu"]);
    expect(c.computable).toBe(false);
    expect(c.nGolds).toBe(1);
    expect(c.perGoldChrf).toEqual([]);
  });

  it("is not computable from no gold at all", () => {
    expect(interGoldAgreement([]).computable).toBe(false);
  });

  it("is 1 when every annotator wrote the same thing", () => {
    const c = interGoldAgreement(["ọdudu", "ọdudu", "ọdudu"]);
    expect(c.computable).toBe(true);
    expect(c.best.chrf).toBeCloseTo(1, 10);
    expect(c.best.exactMatch).toBe(1);
  });

  it("is well BELOW 1 on a real open prompt - the number that matters", () => {
    // Five native speakers, five different blessings. No model can beat this
    // under a character-overlap metric, so a model chrF of ~0.3 here is not a
    // failure - it is the metric's resolution limit.
    const c = interGoldAgreement(REAL_GOLD_OPEN);
    expect(c.computable).toBe(true);
    expect(c.best.chrf).toBeLessThan(0.6);
    expect(c.best.exactMatch).toBe(0);
    expect(c.perGoldChrf).toHaveLength(REAL_GOLD_OPEN.length);
  });

  it("is higher on a tight lexical prompt than on an open one", () => {
    const tight = interGoldAgreement(REAL_GOLD_TIGHT);
    const open = interGoldAgreement(REAL_GOLD_OPEN);
    expect(tight.best.chrf).toBeGreaterThan(open.best.chrf);
  });

  it("scores each held-out gold against the REMAINING golds only", () => {
    // If it did not hold out, a duplicated answer would trivially score 1 for
    // every gold. Two distinct answers must not.
    const c = interGoldAgreement(["aaaa", "bbbb"]);
    expect(c.best.chrf).toBe(0);
    expect(c.perGoldChrf).toEqual([0, 0]);
  });
});
