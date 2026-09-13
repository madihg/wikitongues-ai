import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_2 } from "./generation-prompt-v4-2";
import { IGALA_SYSTEM_V4_1 } from "./generation-prompt-v4-1";

/**
 * v4.2 is v4.1 plus three lines. These tests hold it to four contracts:
 * the DIFF against v4.1 is exactly those three lines and nothing else; the
 * three lines say what the 2026-09-01 community call asked for; the
 * self-contradiction that made the change necessary is gone; and the token
 * budget is the raised-and-declared 1,300, not a silent creep.
 *
 * The REAL Scope-A leak check is scripts/static-leak-check-v4-2.ts against
 * the live frozen protected set; run it after any edit here.
 */

const linesOf = (s: string) => s.split("\n").filter((l) => l.trim().length > 0);

describe("IGALA_SYSTEM_V4_2 - the diff against v4.1 is exactly three lines", () => {
  it("adds two METHOD steps and rewrites one ORTHOGRAPHY line, nothing else", () => {
    const a = linesOf(IGALA_SYSTEM_V4_1);
    const b = linesOf(IGALA_SYSTEM_V4_2);
    const added = b.filter((l) => !a.includes(l));
    const removed = a.filter((l) => !b.includes(l));
    expect(added).toHaveLength(3);
    expect(removed).toHaveLength(1);
    // The two additions are the new METHOD steps.
    expect(added.filter((l) => l.startsWith("9. "))).toHaveLength(1);
    expect(added.filter((l) => l.startsWith("10. "))).toHaveLength(1);
    // The rewrite is the orthography line, and it is the ONLY line that
    // changed rather than being added.
    expect(removed[0]).toContain("Seven vowels");
    expect(added.filter((l) => l.startsWith("Seven vowels"))).toHaveLength(1);
  });

  it("keeps every other v4.1 line byte-identical", () => {
    const a = linesOf(IGALA_SYSTEM_V4_1).filter((l) => !l.startsWith("Seven vowels"));
    for (const line of a) expect(IGALA_SYSTEM_V4_2).toContain(line);
  });
});

describe("IGALA_SYSTEM_V4_2 - the named-entity rules", () => {
  it("tells the model names are copied, not translated (NE1)", () => {
    expect(IGALA_SYSTEM_V4_2).toContain("Names are not translated");
    // The letter-for-letter demand, and the multi-word case Agnes was asked
    // about directly ("Green Spring Montessori" stays English).
    expect(IGALA_SYSTEM_V4_2).toContain("keeps the exact letters the question gives it");
    expect(IGALA_SYSTEM_V4_2).toContain("across every word of it");
    // The mechanism the community named: Igala has no s, so the model was
    // treating names as Igala words and moving s to ch.
    expect(IGALA_SYSTEM_V4_2).toContain("Igala has no s, but a name is not an Igala word");
    expect(IGALA_SYSTEM_V4_2).toContain("never respell one");
  });

  it("forbids dropping a fact for want of a word (NE2)", () => {
    expect(IGALA_SYSTEM_V4_2).toContain("Never drop a fact for want of a word");
    expect(IGALA_SYSTEM_V4_2).toContain("an omission is worse than a borrowing");
  });

  it("scopes the letters rule to Igala words so it cannot contradict NE1 (NE3)", () => {
    expect(IGALA_SYSTEM_V4_2).toContain(
      "This letters rule is about IGALA words: a name or borrowed word copied from the question keeps its own letters.",
    );
    // The contradiction being fixed: v4.1 said any other letter means "the
    // word is wrong", full stop, which condemns Lagos. v4.2 keeps the
    // sentence but no longer leaves it unqualified.
    const orth = linesOf(IGALA_SYSTEM_V4_2).find((l) => l.startsWith("Seven vowels"))!;
    expect(orth).toContain("if a word seems to need one, the word is wrong");
    expect(orth.indexOf("This letters rule is about IGALA words")).toBeGreaterThan(
      orth.indexOf("the word is wrong"),
    );
  });

  it("still carries the v4.1 rules the added steps must not have displaced", () => {
    expect(IGALA_SYSTEM_V4_2).toContain("7. When the question asks how someone would say something");
    expect(IGALA_SYSTEM_V4_2).toContain("8. Never assert which town or area uses a form");
    expect(IGALA_SYSTEM_V4_2).toContain("Igala has no hyphenated prefixes");
    expect(IGALA_SYSTEM_V4_2).toContain("NEVER WRITE");
    expect(IGALA_SYSTEM_V4_2).toContain("OUTPUT");
  });
});

describe("IGALA_SYSTEM_V4_2 - leak guard and budget", () => {
  it("quotes no Igala in the two new METHOD steps", () => {
    // The additions are procedure. The only proper noun is an English place
    // name. Nothing here can collide with frozen Igala gold. (The rewritten
    // ORTHOGRAPHY line is excluded: it carries dotted vowels because it is
    // ABOUT them, exactly as it did in v4.1 - the next test covers it.)
    const steps = linesOf(IGALA_SYSTEM_V4_2).filter(
      (l) => l.startsWith("9. ") || l.startsWith("10. "),
    );
    expect(steps).toHaveLength(2);
    for (const line of steps) {
      // No dot-below, no tilde: the marks that make a string Igala.
      expect(line.normalize("NFD")).not.toMatch(/[\u0323\u0303]/);
    }
  });

  it("adds only English to the ORTHOGRAPHY line - its Igala content is v4.1's", () => {
    // The rewrite inserts one English clause and changes nothing else, so the
    // line cannot have gained or lost an attested Igala string.
    const before = linesOf(IGALA_SYSTEM_V4_1).find((l) => l.startsWith("Seven vowels"))!;
    const after = linesOf(IGALA_SYSTEM_V4_2).find((l) => l.startsWith("Seven vowels"))!;
    const CLAUSE =
      "This letters rule is about IGALA words: a name or borrowed word copied from the question keeps its own letters. ";
    expect(after.replace(CLAUSE, "")).toBe(before);
    expect(CLAUSE.normalize("NFD")).not.toMatch(/[\u0323\u0303]/);
  });

  it("stays under the raised 1,300-token ceiling", () => {
    // v4.1 sat at EXACTLY 1,150, its declared ceiling, so v4.2 could not fit
    // without raising it. The raise is deliberate and documented in the file
    // header - the one thing the v4.1 spec asked of anyone who needed room.
    expect(IGALA_SYSTEM_V4_2.length / 4).toBeLessThanOrEqual(1300);
    // And it is a real ceiling, not a formality: still comfortably above what
    // the change actually cost.
    expect(IGALA_SYSTEM_V4_2.length).toBeGreaterThan(IGALA_SYSTEM_V4_1.length);
  });
});
