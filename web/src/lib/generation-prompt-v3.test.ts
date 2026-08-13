import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V3 } from "./generation-prompt-v3";
import { IGALA_SYSTEM_V2 } from "./generation-prompt-v2";
import { buildProtectedSet, checkStatic } from "@/lib/eval/leak-guard";

/**
 * rag-v3 = v2's METHOD skeleton + the deduced closed-class grammar
 * (tasks/igala-grammar-deduced.md). These tests hold the prompt to its three
 * contracts: leak-free static text (Scope A), the structural additions the
 * grammar deduction mandated, and the token budget.
 *
 * The representative-set Scope A check below mirrors retrieval-v2.test.ts.
 * The REAL check - every line against the actual frozen protected set from
 * the database - lives in scripts/static-leak-check-v3.ts and must be re-run
 * after any edit to the prompt text; it is what forced the example choices
 * in the grammar section (see the comments there).
 */

describe("IGALA_SYSTEM_V3 - static text is leak-free (Scope A)", () => {
  it("contains no frozen gold answer from a representative protected set", () => {
    // Scope A: static text ships on EVERY request, so a single collision
    // leaks an answer key on every query. Same sample set as the v2 test:
    // one-word answers and a phrase, tone-marked as gold actually is.
    const protectedSet = buildProtectedSet(
      ["Ómi", "ẹ́kọ̀", "Ọ́ma", "Áta mi", "Ọ̀gbẹ́nẹ́ chojẹ", "àdagbá"].map(
        (answerText, i) => ({ promptId: `ig_bank_${i}`, answerText }),
      ),
    );
    const report = checkStatic(
      [{ where: "IGALA_SYSTEM_V3", text: IGALA_SYSTEM_V3 }],
      protectedSet,
    );
    expect(report.pass).toBe(true);
    expect(report.hits).toEqual([]);
  });
});

describe("IGALA_SYSTEM_V3 - keeps the v2 METHOD skeleton", () => {
  it("opens with the same single-sentence identity as v2", () => {
    const identity = IGALA_SYSTEM_V2.split("\n")[0];
    expect(IGALA_SYSTEM_V3.startsWith(identity)).toBe(true);
  });

  it("keeps all five v2 sections, in order, with the four METHOD steps", () => {
    const sections = ["THE METHOD", "ORTHOGRAPHY", "NEVER WRITE", "OUTPUT"];
    let last = -1;
    for (const s of sections) {
      const at = IGALA_SYSTEM_V3.indexOf(`\n${s}\n`);
      expect(at, s).toBeGreaterThan(last);
      last = at;
    }
    for (const step of ["1. ", "2. ", "3. ", "4. "]) {
      expect(IGALA_SYSTEM_V3).toContain(`\n${step}`);
    }
  });

  it("keeps v2's NEVER WRITE list byte-identical (it already passed Scope A)", () => {
    const v2List = IGALA_SYSTEM_V2.split("NEVER WRITE\n")[1].split("\n")[0];
    expect(IGALA_SYSTEM_V3).toContain(`NEVER WRITE\n${v2List}`);
  });
});

describe("IGALA_SYSTEM_V3 - the enshrined closed-class grammar", () => {
  const grammar = IGALA_SYSTEM_V3.split("CLOSED-CLASS GRAMMAR\n")[1]?.split(
    "\n\nREGISTER",
  )[0];

  it("has a CLOSED-CLASS GRAMMAR section and a REGISTER section", () => {
    expect(grammar).toBeTruthy();
    expect(IGALA_SYSTEM_V3).toMatch(/\nREGISTER\n/);
  });

  it("carries every mandated component of the deduced grammar", () => {
    // One assertion per component the deduction ranked worth telling a model
    // (tasks/igala-grammar-deduced.md section 12), matched on its
    // load-bearing token so wording can be tuned without breaking the test.
    // The greeting/honorific components (section 12 #5-6, R9.1-R9.3) are
    // deliberately NOT here: they are grade C community-only, and the
    // 2026-08-13 adversarial audit cut them under the A/B-only sourcing
    // contract - see the assertion at the end pinning their absence.
    expect(grammar).toContain("Subject-Verb-Object"); // R1.1/R1.2
    expect(grammar).toMatch(/Pronouns .*they ma/); // R3.1 table
    expect(grammar).toContain("Preverbal u = I"); // R3.2
    expect(grammar).toContain("bare verb = completed"); // R2.1
    expect(grammar).toContain("á = not yet complete"); // R2.2 one incompletive
    expect(grammar).toMatch(/chi\/chẹ/); // R2.6 copulas
    expect(grammar).toContain("clause-final nasal"); // R7.1
    expect(grammar).toContain("kì + verb"); // R7.2 prohibitive
    expect(grammar).toContain("lẹ AFTER the noun"); // R4.1
    expect(grammar).toContain("never yí"); // section 12 #10
    expect(grammar).toContain("drop the FIRST vowel"); // R6.1 trigger
    expect(grammar).toContain("mẹ-"); // R5.1 numerals
    expect(grammar).toContain("ordinals take ẹkẹ-"); // R5.3
    expect(grammar).toContain("ONLY for people and animals"); // R5.5 animacy
    expect(grammar).toContain("du = take one, kó = take many"); // R5.6 concord
    expect(grammar).toContain("kpai links nouns"); // R10.2
  });

  it("does NOT enshrine the grade-C greeting rules (audit cut, 2026-08-13)", () => {
    // R9.1-R9.3 are community-only grade C; the sourcing contract is A/B
    // only, no exceptions. Greetings reach the model through per-prompt,
    // leak-guarded retrieval (the data layer), never through static text.
    expect(IGALA_SYSTEM_V3).not.toContain("ọla + time/place");
    expect(IGALA_SYSTEM_V3).not.toContain("no word for hello");
    expect(IGALA_SYSTEM_V3).not.toContain("Agba");
  });

  it("is structured lines, not prose: every grammar line stays compact", () => {
    // The ablation warning in generation-prompt-v2.ts stands: grammar PROSE
    // does not help. What helped (Pei et al.) was trigger-shaped structured
    // rules. A line ballooning past ~250 chars is prose creeping back in.
    const lines = grammar!.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(8);
    for (const line of lines) {
      expect(line.length, line.slice(0, 40)).toBeLessThanOrEqual(250);
    }
  });

  it("prescribes the community register, not scripture", () => {
    const register = IGALA_SYSTEM_V3.split("REGISTER\n")[1].split("\n")[0];
    expect(register).toContain("like the community");
    expect(register).toMatch(/Jihofa/); // the named Bible-register ban
  });
});

describe("IGALA_SYSTEM_V3 - token budget", () => {
  it("stays under ~700 tokens by the repo's chars/4 convention", () => {
    // Same estimate as sniff-test-v2.ts and pricing.ts. The budget exists so
    // the grammar addition cannot crowd out the retrieved material, which the
    // ablations say is the actual load-bearing signal.
    expect(IGALA_SYSTEM_V3.length / 4).toBeLessThanOrEqual(700);
  });
});
