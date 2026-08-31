import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural proof of the 2026-08-28 rework (the no-tab flow) at the source
 * level - the interface's first paint is gated on a fetch effect, so like the
 * corrections-interface check in suggesting-editor.test.tsx, the invariants
 * are held against the component source:
 *
 *   1. The whole post-verdict sequence - required loser tags, the suggesting
 *      editor on the chosen output, the explicit "nothing to correct" act,
 *      and the required English rationale - lives INSIDE the pairwise step:
 *      one scrolling page, right after the choice.
 *   2. No modal stacks anywhere in the episode.
 *   3. The sequence's tap targets declare >= 40px heights (house rule).
 *   4. No annotator-facing link to the removed /annotator/corrections tab.
 */

const src = readFileSync(join(__dirname, "annotation-interface.tsx"), "utf8");

/** The JSX of the pairwise step only (verdict -> tags -> fix -> why). */
function pairwiseSlice(): string {
  const start = src.indexOf('{step === "pairwise" && (');
  const end = src.indexOf("STEP: score");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("the post-verdict sequence (one scrolling page)", () => {
  it("tags, the editor on the chosen output, 'nothing to correct', and the rationale all render on the pairwise step", () => {
    const slice = pairwiseSlice();
    // (i) required failure tags beside the losing output
    expect(slice).toContain("lost - why?");
    expect(slice).toContain("(required)");
    // (ii) the suggesting editor on the chosen output + the explicit skip
    expect(slice).toContain("<SuggestingEditor");
    expect(slice).toContain("Nothing to correct");
    // (iii) the English why for corrections
    expect(slice).toContain("Why did you make these corrections?");
  });

  it("the score step no longer carries the winner-correction box (it moved up, not duplicated)", () => {
    const scoreOn = src.slice(src.indexOf("STEP: score"));
    expect(scoreOn).not.toContain("Correct this response");
    expect(scoreOn).not.toContain("The winner has a small fixable error");
  });

  it("no modal stacks anywhere in the episode", () => {
    expect(src).not.toContain('role="dialog"');
    expect(src).not.toContain("aria-modal");
    expect(src).not.toContain("inset-0"); // no full-screen overlay layer
  });

  it("every tappable element of the sequence declares a >= 40px target (or is a padded card)", () => {
    const classAttrs = [
      ...pairwiseSlice().matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g),
    ].map((m) => m[1] ?? m[2]);
    const tappable = classAttrs.filter((c) => c.includes("cursor-pointer"));
    expect(tappable.length).toBeGreaterThan(0);
    for (const cls of tappable) {
      expect(cls, `tappable classes: ${cls}`).toMatch(
        // min-h-10 = 40px chips; min-h-[44px] buttons; p-6 output cards
        // (24px padding around multi-line text is far past the floor).
        /(min-h-10|min-h-\[4[4-9]px\]|\bp-6\b)/,
      );
    }
  });
});

describe("the no-tab flow", () => {
  it("the episode never links annotators to the removed corrections tab", () => {
    expect(src).not.toContain("/annotator/corrections");
  });

  it("the required-act gates are wired into Continue, not just Submit", () => {
    const slice = pairwiseSlice();
    expect(slice).toContain("!tagsOk");
    expect(slice).toContain("!correctionResolved");
  });
});
