import { describe, it, expect } from "vitest";
import { stripTemplateResidue, stripProjectMeta } from "./rag-clean";

/**
 * These tests exist for two reasons.
 *
 * First, the transforms edit a production corpus that is shown to native
 * speakers as reference material, so a regex that half-removes something is
 * worse than one that removes nothing - it leaves a sentence that reads as a
 * confident claim about Igala with its object missing.
 *
 * Second, importing the cleanup module must not run the cleanup. It did once.
 * The `invokedDirectly` guard in clean-rag-igala.ts is what stops that, and
 * this file is the thing that would notice if the guard were removed: if
 * importing mutated the database, this suite would need a live connection and
 * would fail in CI.
 */

describe("stripTemplateResidue", () => {
  it("removes the vulgar unexpanded-template fragment AND the clause it dangled from", () => {
    const input =
      "ẹ̀bìẹ̀ /ɛ̀.bʲɛ̀/ — blood; (euphemistic) menstrual blood; (idiomatic|offensive|vulgar) a clipping of the phrase   |t=gather menstrual blood and drink it!}}";
    const out = stripTemplateResidue(input);
    // The offensive payload is gone.
    expect(out).not.toContain("drink it");
    expect(out).not.toContain("|t=");
    // And so is the orphaned lead-in, which would otherwise end the gloss on
    // "a clipping of the phrase" with no phrase.
    expect(out).not.toContain("a clipping of the phrase");
    // The real lexicography survives untouched.
    expect(out).toContain("ẹ̀bìẹ̀");
    expect(out).toContain("blood");
    expect(out).toContain("(euphemistic) menstrual blood");
    expect(out.trimEnd()).toBe(out);
  });

  it("removes bare closing braces without eating the gloss", () => {
    expect(stripTemplateResidue("újì /ú.d͡ʒì/ — hawk or kite; )}}")).toBe(
      "újì /ú.d͡ʒì/ — hawk or kite",
    );
    expect(stripTemplateResidue("ọ́fẹ̀ — pit; chieftaincy title }}")).toBe(
      "ọ́fẹ̀ — pit; chieftaincy title",
    );
  });

  it("removes empty parenthesised argument lists left by failed expansion", () => {
    expect(
      stripTemplateResidue("Ífá — divination in Igala religion (, ); more"),
    ).toBe("Ífá — divination in Igala religion; more");
  });

  it("is idempotent - re-running the cleanup changes nothing further", () => {
    const input =
      "ẹ̀bìẹ̀ — blood; (idiomatic|vulgar) a clipping of the phrase   |t=x!}}\nújì — hawk; )}}";
    const once = stripTemplateResidue(input);
    expect(stripTemplateResidue(once)).toBe(once);
  });

  it("leaves clean Igala entries completely alone", () => {
    const clean = "ọ́ma /ɔ́.mā/ — child\náta /áta/ — father\nọ́yà /ɔ́.jà/ — wife";
    expect(stripTemplateResidue(clean)).toBe(clean);
  });
});

describe("stripProjectMeta", () => {
  it("removes a contact address and the block that carried it", () => {
    const input =
      "Igala is a West Benue-Congo language.\n\nTHE ASK, IF WE CONTACT HIM (salem.ejeba@gmail.com, printed on the 2023 paper): not the book.\n\nCLASSIFICATION: Yoruboid subgroup.";
    const out = stripProjectMeta(input);
    expect(out).not.toContain("@gmail.com");
    expect(out).not.toContain("THE ASK");
    // The linguistic content on both sides of the removed block survives.
    expect(out).toContain("West Benue-Congo");
    expect(out).toContain("Yoruboid subgroup");
  });

  it("removes lines that talk about our benchmark rather than about Igala", () => {
    const input =
      "Two Igala verb forms may differ by a single opening consonant.\nThis is a hazard for chrF: a wrong initial consonant is a near-invisible penalty.\nTone is marked acute for high.";
    const out = stripProjectMeta(input);
    expect(out).not.toMatch(/chrF/);
    expect(out).toContain("single opening consonant");
    expect(out).toContain("Tone is marked acute for high");
  });

  it("is idempotent", () => {
    const input =
      "Igala grammar.\n\nTHE ASK: write to someone@example.com\n\nMore grammar.";
    const once = stripProjectMeta(input);
    expect(stripProjectMeta(once)).toBe(once);
  });

  it("leaves pure reference material alone", () => {
    const clean =
      "Igala has four concord relationships: subject-verb, object-verb,\nverb-modifying verb, and verb-mass noun.";
    expect(stripProjectMeta(clean)).toBe(clean);
  });
});
