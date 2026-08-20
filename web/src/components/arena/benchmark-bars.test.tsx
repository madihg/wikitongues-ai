import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkBars } from "./benchmark-bars";
import type { Approach, CandidateScore } from "@/lib/method-metrics";

/**
 * The chart is a drawing of numbers computed elsewhere, so what a test can
 * hold in place is exactly what a reader could be misled about: the 100 line
 * must be labeled as native speaker agreement, a score above 100 must render
 * as measured (never clamped), the best model must be the highlighted one,
 * an underpowered CI must not draw whiskers, and a missing ceiling must
 * produce an honest refusal rather than an empty axis.
 */

function cand(
  name: string,
  approach: Approach,
  score: number | null,
  ciLow: number | null = score,
  ciHigh: number | null = score,
  underpowered = false,
): CandidateScore {
  return {
    name,
    approach,
    n: 40,
    nClean: 28,
    strippedChrfAll: score === null ? null : score / 2,
    strippedChrfClean: score === null ? null : score / 2,
    agreementScore: score,
    agreementCiLow: ciLow,
    agreementCiHigh: ciHigh,
    agreementUnderpowered: underpowered,
  };
}

const field: CandidateScore[] = [
  cand("Model A + RAG v3", "retrieval v3", 104.2, 96.5, 111.9),
  cand("Model B + RAG v2", "retrieval v2", 88.4, 80.1, 95.2),
  cand("Model C fine-tune", "fine-tuned", 71.3, 71.3, 71.3, true),
  cand("Plain Model D", "untouched", 33.7, 28.9, 39.1),
];

function render(
  candidates: CandidateScore[],
  ceilingChrf: number | null = 46.3,
  topN?: number,
): string {
  return renderToStaticMarkup(
    <BenchmarkBars
      candidates={candidates}
      ceilingChrf={ceilingChrf}
      leakFreePrompts={28}
      topN={topN}
    />,
  );
}

describe("BenchmarkBars", () => {
  it("labels the 100 reference line as native speaker agreement", () => {
    const html = render(field);
    expect(html).toContain("native speaker agreement");
    expect(html).toContain(">100<");
    // The footnote names the raw chrF the line is anchored to and the subset.
    expect(html).toContain("46.3");
    expect(html).toContain("28 leak-free frozen questions");
  });

  it("renders a score above 100 as measured, never clamped", () => {
    const html = render(field);
    expect(html).toContain("104.2");
    expect(html).not.toContain("100.0*");
  });

  it("highlights the best model with the accent and every approach chip", () => {
    const html = render(field);
    expect(html).toContain('fill="var(--accent)"');
    // Best-first order is the metric module's contract; the chart preserves it.
    expect(html.indexOf("Model A + RAG v3")).toBeLessThan(
      html.indexOf("Model B + RAG v2"),
    );
    for (const chip of [
      "retrieval v3",
      "retrieval v2",
      "fine-tuned",
      "untouched",
    ]) {
      expect(html).toContain(chip);
    }
  });

  it("marks an underpowered CI with a star instead of drawing fake whiskers", () => {
    const html = render(field);
    expect(html).toContain("71.3*");
    expect(html).toContain("too few leak-free answers for an interval");
  });

  it("folds models beyond topN into a show-all details element", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      cand(`Model ${i}`, "untouched", 90 - i),
    );
    const html = render(many, 46.3);
    expect(html).toContain("<details");
    expect(html).toContain("Show all 11 models");
    // Default topN is 8; the 9th model renders inside the details block.
    expect(html.indexOf("Model 8")).toBeGreaterThan(html.indexOf("<details"));
  });

  it("renders no details toggle when everything fits above the fold", () => {
    expect(render(field)).not.toContain("<details");
  });

  it("refuses to draw a scale when the ceiling cannot be computed", () => {
    const html = render(field, null);
    expect(html).not.toContain("<svg");
    expect(html).toContain("cannot be drawn yet");

    const noScores = render([cand("Unscored", "other", null)], 46.3);
    expect(noScores).not.toContain("<svg");
  });
});
