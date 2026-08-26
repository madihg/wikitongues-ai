import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SuggestingEditor, SuggestionPreview } from "./suggesting-editor";

/**
 * Phone-UX proof for the editing ground (house rule: annotators work on
 * phones - no horizontal page scroll at 375px, touch targets >= 40px).
 *
 * Static markup is what a unit test can hold in place (no layout engine in
 * vitest), so the invariants are asserted structurally:
 *   - every interactive element must carry an explicit >= 40px height class
 *     (min-h-10 = 40px, min-h-[44px], h-10) or row-based textarea sizing;
 *   - every text container that renders model output or corrections must wrap
 *     (whitespace-pre-wrap + break-words) - the only way a long unbroken
 *     Igala token cannot force a 375px page sideways;
 *   - nothing may opt out of wrapping (whitespace-nowrap) or set a fixed
 *     pixel width wider than a phone.
 */

// A hostile payload: diacritic-heavy, one ludicrously long unbroken token
// (the worst case for 375px), a real multi-word change, and an insertion.
const LONG_TOKEN = "ọ̀jọ̀gbàdámẹ́lẹ̀ánẹ́".repeat(12);
const ORIGINAL = `Àgbá Ọ́jọ́ ${LONG_TOKEN} ki chẹnyọ ñwu wẹ`;
const CORRECTED = `Agba ọjọ ${LONG_TOKEN} ki d'ẹnyọ ñwu wẹ dẹẹ`;

function render(readOnly = false): string {
  return renderToStaticMarkup(
    <SuggestingEditor
      original={ORIGINAL}
      value={CORRECTED}
      onValueChange={() => {}}
      reasons={{}}
      onReasonsChange={() => {}}
      readOnly={readOnly}
    />,
  );
}

/** All class attributes of tags matching `tag` in the markup. */
function classesOf(html: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
  for (const m of html.match(re) ?? []) {
    const cls = /class="([^"]*)"/.exec(m);
    out.push(cls ? cls[1] : "");
  }
  return out;
}

const TOUCH_OK = /(min-h-10|min-h-\[4[4-9]px\]|\bh-10\b|min-h-\[[5-9]\dpx\])/;

describe("SuggestingEditor at 375px (structural phone-UX proof)", () => {
  it("every button is an explicit >= 40px touch target", () => {
    const buttons = classesOf(render(), "button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const cls of buttons) {
      expect(cls, `button classes: ${cls}`).toMatch(TOUCH_OK);
    }
  });

  it("every text input is an explicit >= 40px touch target", () => {
    const inputs = classesOf(render(), "input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const cls of inputs) {
      expect(cls, `input classes: ${cls}`).toMatch(TOUCH_OK);
    }
  });

  it("the textarea spans the container and sizes by rows, never fixed pixels", () => {
    const html = render();
    const [textarea] = classesOf(html, "textarea");
    expect(textarea).toContain("w-full");
    expect(html).toMatch(/<textarea[^>]*rows="\d+"/);
  });

  it("the suggestion preview wraps long unbroken Igala tokens (no sideways scroll)", () => {
    const html = renderToStaticMarkup(
      <SuggestionPreview original={ORIGINAL} corrected={CORRECTED} />,
    );
    const [preview] = classesOf(html, "p");
    expect(preview).toContain("whitespace-pre-wrap");
    expect(preview).toContain("break-words");
    expect(html).toContain(LONG_TOKEN); // the hostile token actually rendered
  });

  it("nothing opts out of wrapping or pins a fixed pixel width", () => {
    for (const html of [render(), render(true)]) {
      expect(html).not.toContain("whitespace-nowrap");
      expect(html).not.toContain("overflow-x-scroll");
      // No fixed pixel width class (w-[NNNpx]) may appear anywhere.
      expect(html).not.toMatch(/\bw-\[\d+px\]/);
    }
  });

  it("every tappable element in the corrections page source declares a >= 40px target", () => {
    // CorrectionsInterface cannot be statically rendered (its first paint is
    // gated on a localStorage effect), so the invariant is held at the source
    // level: every className that marks an element tappable (cursor-pointer)
    // must also declare an explicit touch height (min-h-* / h-10 / py-3).
    const src = readFileSync(
      join(__dirname, "corrections-interface.tsx"),
      "utf8",
    );
    const classAttrs = [
      ...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g),
    ].map((m) => m[1] ?? m[2]);
    const tappable = classAttrs.filter((c) => c.includes("cursor-pointer"));
    expect(tappable.length).toBeGreaterThan(0);
    for (const cls of tappable) {
      expect(cls, `tappable classes: ${cls}`).toMatch(
        /(min-h-10|min-h-\[4[4-9]px\]|\bh-10\b|\bpy-3\b)/,
      );
    }
  });

  it("read-only mode (onboarding worked example) renders no editable controls", () => {
    const html = render(true);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
    // The suggestion preview and reason cards still show.
    expect(html).toContain("Your suggestions");
  });
});
