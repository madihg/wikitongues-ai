import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ColumnStatusLine } from "./column-status-line";
import {
  COLUMN_PHASE_LABELS,
  ELAPSED_VISIBLE_AFTER_MS,
  type ColumnPhase,
} from "@/lib/arena/column-status";

/**
 * The status line is the only thing a reviewer has to go on while a column is
 * empty, so what static markup can hold in place is what she could be misled
 * about: every phase must SAY which phase it is, a long wait must show a clock
 * that proves something is still happening, a short one must not clutter the
 * column with a counter, and the pulse must be motion-safe so a reader with
 * reduced motion set loses decoration and no information.
 */

function render(phase: ColumnPhase, elapsedMs = 0, detail?: string): string {
  return renderToStaticMarkup(
    <ColumnStatusLine phase={phase} elapsedMs={elapsedMs} detail={detail} />,
  );
}

const ALL_PHASES: ColumnPhase[] = [
  "waiting",
  "retrieving",
  "writing",
  "checking",
  "revising",
  "done",
  "failed",
];

describe("ColumnStatusLine", () => {
  it("renders the label for every phase", () => {
    for (const phase of ALL_PHASES) {
      const html = render(phase);
      expect(html).toContain(COLUMN_PHASE_LABELS[phase]);
      expect(html).toContain(`data-phase="${phase}"`);
    }
  });

  it("distinguishes the phases from each other, not just from nothing", () => {
    const labels = ALL_PHASES.map((p) => COLUMN_PHASE_LABELS[p]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("marks live phases with an ellipsis and finished ones without", () => {
    expect(render("writing")).toContain("Writing…");
    expect(render("checking")).toContain("Checking the answer…");
    expect(render("done")).not.toContain("…");
    expect(render("failed")).not.toContain("…");
  });

  it("hides the elapsed counter below the threshold", () => {
    const html = render("writing", ELAPSED_VISIBLE_AFTER_MS - 1);
    expect(html).not.toContain("2s");
    expect(html).not.toContain("tabular-nums");
  });

  it("shows the elapsed counter once the wait passes the threshold", () => {
    const html = render("retrieving", 7400);
    expect(html).toContain("7s");
    expect(html).toContain("tabular-nums");
  });

  it("never shows an elapsed counter on a finished column", () => {
    // The finished column reports its measured latency instead; a running
    // clock on a column that already answered would be nonsense.
    const html = render("done", 45_000, "1.2s · 8 gold examples");
    expect(html).not.toContain("45s");
    expect(html).toContain("1.2s · 8 gold examples");
  });

  it("pulses only under motion-safe, and not at all once finished", () => {
    const live = render("writing", 0);
    expect(live).toContain("motion-safe:animate-pulse");
    // Never an unconditional animation class: prefers-reduced-motion must be
    // able to turn it off.
    expect(live).not.toMatch(/class="[^"]*(?<!motion-safe:)animate-pulse/);
    expect(render("done")).not.toContain("animate-pulse");
    expect(render("failed")).not.toContain("animate-pulse");
  });

  it("announces itself politely rather than interrupting the answer", () => {
    expect(render("writing")).toContain('aria-live="polite"');
  });

  it("keeps the ticking counter OUT of the live region", () => {
    // The clock re-reads every 500ms, so a counter left announceable would
    // queue the whole line once a second for the entire wait - worst on the
    // repaired arm, the slow column this line exists for. Polite is not quiet.
    const html = render("writing", 9000);
    expect(html).toContain("9s");
    expect(html).toMatch(/<span aria-hidden="true" class="tabular-nums">/);
  });

  it("still announces the phase itself - the transition is the information", () => {
    const html = render("revising", 9000);
    // The label sits in a span with no aria-hidden, inside the live region.
    expect(html).toContain(`<span>${COLUMN_PHASE_LABELS.revising}…</span>`);
  });
});
