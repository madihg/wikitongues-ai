import { describe, it, expect } from "vitest";
import {
  buildPublicStats,
  PURITY_MILESTONE,
  type RawPublicStats,
} from "@/lib/public-stats";
import { BUCKETS } from "@/lib/buckets";

const FIXED_NOW = "2026-07-29T00:00:00.000Z";

function raw(overrides: Partial<RawPublicStats> = {}): RawPublicStats {
  return {
    totalPrompts: 300,
    heldOutBenchmark: 40,
    promptsByBucket: [
      { bucket: "orthography", count: 50 },
      { bucket: "grammar_tone", count: 40 },
    ],
    languages: ["igala"],
    coldAuthoredAnswers: 90,
    corrections: 50,
    pairwiseTotal: 140,
    bothInadequate: 139,
    decidedWinner: 1,
    activeAnnotators: 5,
    ...overrides,
  };
}

describe("buildPublicStats", () => {
  it("returns all eight categories in taxonomy order with labels, zero-filling missing buckets", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    expect(stats.prompts.byCategory).toHaveLength(BUCKETS.length);
    expect(stats.prompts.byCategory.map((c) => c.key)).toEqual(
      BUCKETS.map((b) => b.key),
    );
    // labels are the human-facing bucket labels, never the raw enum keys
    const ortho = stats.prompts.byCategory.find((c) => c.key === "orthography");
    expect(ortho?.label).toBe("Spelling & tone marks");
    expect(ortho?.count).toBe(50);
    // a bucket with no prompts is present with a 0, not omitted
    const dialect = stats.prompts.byCategory.find(
      (c) => c.key === "dialectal_fidelity",
    );
    expect(dialect?.count).toBe(0);
  });

  it("computes the both-inadequate rate and rounds to four decimals", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    // 139 / 140 = 0.992857... -> 0.9929
    expect(stats.judgments.bothInadequateRate).toBe(0.9929);
    expect(stats.judgments.decidedWinner).toBe(1);
    expect(stats.judgments.pairwiseTotal).toBe(140);
  });

  it("never divides by zero when there are no judgments yet", () => {
    const stats = buildPublicStats(
      raw({ pairwiseTotal: 0, bothInadequate: 0, decidedWinner: 0 }),
      FIXED_NOW,
    );
    expect(stats.judgments.bothInadequateRate).toBe(0);
  });

  it("sums gold answers from cold-authored answers and corrections", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    expect(stats.gold.coldAuthoredAnswers).toBe(90);
    expect(stats.gold.corrections).toBe(50);
    expect(stats.gold.total).toBe(140);
  });

  it("passes through held-out size, active-annotator count and languages", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    expect(stats.prompts.total).toBe(300);
    expect(stats.prompts.heldOutBenchmark).toBe(40);
    expect(stats.annotators.active).toBe(5);
    expect(stats.languages).toEqual(["igala"]);
  });

  it("falls back to igala when no languages are recorded, and dedupes", () => {
    expect(
      buildPublicStats(raw({ languages: [] }), FIXED_NOW).languages,
    ).toEqual(["igala"]);
    expect(
      buildPublicStats(raw({ languages: ["igala", "igala"] }), FIXED_NOW)
        .languages,
    ).toEqual(["igala"]);
  });

  it("embeds the hard-coded 41 -> 3.1 purity milestone with its date", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    expect(stats.modelOutputPurity).toBe(PURITY_MILESTONE);
    expect(stats.modelOutputPurity.before).toBe(41);
    expect(stats.modelOutputPurity.after).toBe(3.1);
    expect(stats.modelOutputPurity.measuredOn).toBe("2026-07-27");
  });

  it("exposes only aggregate keys - no names, emails, ids or raw text", () => {
    const stats = buildPublicStats(raw(), FIXED_NOW);
    const serialized = JSON.stringify(stats).toLowerCase();
    // guard against accidental PII leakage in the shape
    for (const forbidden of [
      "email",
      "name",
      "annotatorid",
      "answertext",
      "text",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(stats).sort()).toEqual(
      [
        "annotators",
        "gold",
        "generatedAt",
        "judgments",
        "languages",
        "modelOutputPurity",
        "prompts",
      ].sort(),
    );
  });
});
