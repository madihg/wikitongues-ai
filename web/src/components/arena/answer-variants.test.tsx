import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The tip opens on click; render its content inline so the copy is readable
// in a static render.
vi.mock("@/components/info-tip", () => ({
  InfoTip: ({ children }: { children: React.ReactNode }) => (
    <span data-tip="">{children}</span>
  ),
}));

import { AnswerVariants } from "./answer-variants";

/**
 * The explanation above "Differences between our own answers" (2026-10-15).
 * This repository is public, and the examples it gave of "the same word,
 * written differently" were frozen-benchmark gold answers. They are schematic
 * now: each example is an English description in square brackets, as the
 * annotator's worked example has been since 2026-10-13. The proof against the
 * real protected set is scripts/leak-check-files.ts on the component; this
 * holds the shape so a real word cannot be typed back in unnoticed.
 */
describe("the answer-variants explanation is schematic", () => {
  /** The heading tip and the two paragraphs, as plain text. */
  function explanation(): string {
    const html = renderToStaticMarkup(<AnswerVariants />);
    const from = html.indexOf("Differences between our own answers");
    const to = html.indexOf("Genuinely different words");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return html
      .slice(from, to)
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/\s+/g, " ");
  }

  it("gives each example as a bracketed English description", () => {
    const text = explanation();
    for (const slot of [
      "[a word with a capital]",
      "[the same word, tone-marked]",
      "[the same word, marked differently]",
      "[another word for the same thing]",
      "[with a capital]",
      "[tone-marked]",
      "[marked differently]",
      "[every word written apart]",
      "[the same sentence, two words joined by an apostrophe]",
    ]) {
      expect(text).toContain(slot);
    }
  });

  it("quotes no word and carries no letter outside plain English", () => {
    const text = explanation();
    expect(text).not.toContain('"');
    // Igala orthography (dotted vowels, tone marks, n-tilde) is outside A-Z.
    expect(text.match(/(?![A-Za-z])\p{L}/gu)).toBeNull();
  });
});
