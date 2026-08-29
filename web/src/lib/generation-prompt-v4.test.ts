import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4, buildUserTurnV4 } from "./generation-prompt-v4";
import { IGALA_SYSTEM_V3 } from "./generation-prompt-v3";
import { IGALA_SYSTEM_V2 } from "./generation-prompt-v2";
import { CORRECTIONS_INTRO, PARALLEL_INTRO_V4 } from "@/lib/arena/retrieval-v4";
import { buildProtectedSet, checkStatic } from "@/lib/eval/leak-guard";

/**
 * rag-v4 = v3's enshrined grammar + the five 2026-08-28 serving improvements
 * (meaning-first METHOD, small-word gate, dates + missing-word rules, Igbo
 * prohibitions, register-guarded blocks - the block guard itself is tested in
 * retrieval-v4.test.ts). These tests hold the prompt to the same three
 * contracts as v3: leak-free static text (Scope A), the mandated structural
 * content, and the token budget.
 *
 * The REAL Scope-A check - every line against the actual frozen protected
 * set from the database - lives in scripts/static-leak-check-v4.ts and must
 * be re-run after any edit to the prompt text or the retrieval-v4 headers.
 */

describe("IGALA_SYSTEM_V4 - static text is leak-free (Scope A)", () => {
  it("contains no frozen gold answer from a representative protected set", () => {
    // Same sample set as the v2/v3 tests: one-word answers and a phrase,
    // tone-marked as gold actually is. The v4 headers ship on every request
    // that renders their block, so they are checked here too.
    const protectedSet = buildProtectedSet(
      ["Ómi", "ẹ́kọ̀", "Ọ́ma", "Áta mi", "Ọ̀gbẹ́nẹ́ chojẹ", "àdagbá"].map(
        (answerText, i) => ({ promptId: `ig_bank_${i}`, answerText }),
      ),
    );
    const report = checkStatic(
      [
        { where: "IGALA_SYSTEM_V4", text: IGALA_SYSTEM_V4 },
        { where: "CORRECTIONS_INTRO", text: CORRECTIONS_INTRO },
        { where: "PARALLEL_INTRO_V4", text: PARALLEL_INTRO_V4 },
      ],
      protectedSet,
    );
    expect(report.pass).toBe(true);
    expect(report.hits).toEqual([]);
  });
});

describe("IGALA_SYSTEM_V4 - keeps the versioned skeleton", () => {
  it("opens with the same single-sentence identity as v2/v3", () => {
    const identity = IGALA_SYSTEM_V2.split("\n")[0];
    expect(IGALA_SYSTEM_V4.startsWith(identity)).toBe(true);
  });

  it("keeps every section, in order, with six METHOD steps", () => {
    const sections = [
      "THE METHOD",
      "CLOSED-CLASS GRAMMAR",
      "REGISTER",
      "ORTHOGRAPHY",
      "NEVER WRITE",
      "OUTPUT",
    ];
    let last = -1;
    for (const s of sections) {
      const at = IGALA_SYSTEM_V4.indexOf(`\n${s}\n`);
      expect(at, s).toBeGreaterThan(last);
      last = at;
    }
    for (const step of ["1. ", "2. ", "3. ", "4. ", "5. ", "6. "]) {
      expect(IGALA_SYSTEM_V4).toContain(`\n${step}`);
    }
  });

  it("keeps v2/v3's Yoruba NEVER WRITE list byte-identical (it already passed Scope A)", () => {
    const v2List = IGALA_SYSTEM_V2.split("NEVER WRITE\n")[1].split("\n")[0];
    expect(IGALA_SYSTEM_V4).toContain(`NEVER WRITE\n${v2List}`);
  });

  it("does not silently rewrite v3: the delta is additive by design", () => {
    // The five improvements ADD to v3; the v3 grammar/register/orthography
    // lines they leave alone must appear verbatim, so a v3/v4 delta stays
    // attributable to the documented changes (asserted individually below).
    expect(IGALA_SYSTEM_V4).not.toBe(IGALA_SYSTEM_V3);
  });
});

describe("IGALA_SYSTEM_V4 - improvement 1: the meaning-first METHOD", () => {
  const method = IGALA_SYSTEM_V4.split("THE METHOD\n")[1]?.split(
    "\n\nCLOSED-CLASS GRAMMAR",
  )[0];

  it("leads with understanding, not lookup (Agnes: word-by-word is not Igala)", () => {
    expect(method).toBeTruthy();
    // Step 1 is comprehension; the word-for-word ban is stated on it.
    expect(method!.split("\n")[0]).toMatch(
      /Understand what the question MEANS/,
    );
    expect(method).toMatch(/never word by word/i);
  });

  it("points the dictionary at the ANSWER's words, after the examples' shape", () => {
    // Order of operations: meaning (1) -> shape (2) -> dictionary (3). The
    // dictionary step must come after the examples step and be answer-side.
    const shapeAt = method!.indexOf("EXAMPLES");
    const dictAt = method!.indexOf("DICTIONARY");
    expect(shapeAt).toBeGreaterThan(-1);
    expect(dictAt).toBeGreaterThan(shapeAt);
    expect(method).toMatch(/words your ANSWER needs/);
  });

  it("licenses pro-drop by deferring to the examples, not by asserting a rule", () => {
    expect(method).toContain(
      "Not every English word has an Igala word: leave out what the examples leave out.",
    );
  });

  it("carries the missing-word rule: describe or borrow, never coin (improvement 3)", () => {
    expect(method).toMatch(/describe the thing in plain attested words/);
    expect(method).toMatch(/loanword/);
    expect(method).toMatch(/never coin an Igala-looking form/);
    // The C-grade "say it does not exist" behavior stays OUT of static text
    // (same audit rule that cut v3's greeting lines).
    expect(IGALA_SYSTEM_V4).not.toMatch(/does not exist/);
  });

  it("keeps v2/v3's closest-attested-form and spelling-is-meaning steps", () => {
    expect(method).toContain("use the closest attested form from the examples");
    expect(method).toContain("Copy attested spellings character for character");
  });
});

describe("IGALA_SYSTEM_V4 - the enshrined grammar, inherited and extended", () => {
  const grammar = IGALA_SYSTEM_V4.split("CLOSED-CLASS GRAMMAR\n")[1]?.split(
    "\n\nREGISTER",
  )[0];

  it("carries every v3 grammar line verbatim (the A/B core is untouched)", () => {
    // Each of v3's ten grammar lines must appear byte-identical in v4, so
    // the v3 citations (rule IDs in generation-prompt-v3.ts) keep applying.
    const v3Grammar = IGALA_SYSTEM_V3.split("CLOSED-CLASS GRAMMAR\n")[1].split(
      "\n\nREGISTER",
    )[0];
    for (const line of v3Grammar.split("\n").filter((l) => l.trim())) {
      expect(IGALA_SYSTEM_V4, line.slice(0, 40)).toContain(line);
    }
  });

  it("adds the dates line: ordinal day/month, digits for years (improvement 3)", () => {
    expect(grammar).toMatch(/Dates: day and month are ordinals/);
    // Month pattern only - the day-noun example failed the real Scope-A
    // check (see the source comment); this pins that it stays out.
    expect(grammar).toMatch(/the month: ọchu \+ ẹkẹ-numeral/);
    expect(grammar).toMatch(/write the year in digits/);
    expect(grammar).toMatch(/never compose one/);
  });

  it("adds the small-word gate as the section's closing line (improvement 2)", () => {
    const lines = grammar!.split("\n").filter((l) => l.trim());
    expect(lines[lines.length - 1]).toMatch(
      /^Every small word must have a job\./,
    );
    // The gate names the particles the section itself defines - it
    // generalizes R7.1's never-decorative nasal, it does not introduce forms.
    expect(lines[lines.length - 1]).toMatch(/lẹ, á, kì, ku, kpai, oñ, ǹ/);
  });

  it("is structured lines, not prose: every grammar line stays compact", () => {
    // Same cap as v3: the ablation warning stands - a line ballooning past
    // ~250 chars is prose creeping back in.
    const lines = grammar!.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(10);
    for (const line of lines) {
      expect(line.length, line.slice(0, 40)).toBeLessThanOrEqual(250);
    }
  });

  it("still does NOT enshrine the grade-C greeting rules (v3 audit cut holds)", () => {
    expect(IGALA_SYSTEM_V4).not.toContain("ọla + time/place");
    expect(IGALA_SYSTEM_V4).not.toContain("Agba");
  });
});

describe("IGALA_SYSTEM_V4 - improvement 4: Igbo prohibitions", () => {
  it("bans exactly the two market-day names unique to Igbo, DON'T-side only", () => {
    const neverWrite =
      IGALA_SYSTEM_V4.split("NEVER WRITE\n")[1].split("\n\n")[0];
    expect(neverWrite).toContain(
      "These are Igbo, not Igala: the market-day names Orie and Nkwọ.",
    );
    // Eke/Afọ differ from the attested Igala Ẹkẹ/Afor only in diacritics;
    // banning them would teach the model to avoid real Igala words. And the
    // Igala replacements themselves must NOT appear - they are annotator
    // gold (Scope A, same rule as the Yoruba list carrying no replacements).
    expect(neverWrite).not.toMatch(/\bEke\b/);
    expect(neverWrite).not.toMatch(/Afọ/);
    expect(neverWrite).not.toMatch(/Ẹdẹ|Ukwọ|Ẹkẹ|Afor/);
  });
});

describe("IGALA_SYSTEM_V4 - token budget", () => {
  it("stays under ~900 tokens by the repo's chars/4 convention", () => {
    // v3 held ~700; the growth is exactly the five mandated additions. The
    // ceiling exists for the same reason as v3's: static text must never
    // crowd out the retrieved material, which the ablations say is the
    // load-bearing signal.
    expect(IGALA_SYSTEM_V4.length / 4).toBeLessThanOrEqual(900);
  });
});

describe("buildUserTurnV4 - assembly order", () => {
  it("orders corrections, pairs, dictionary-above-question, contract last", () => {
    const turn = buildUserTurnV4(
      "Give the Igala word for water.",
      {
        correctionsBlock: "CORR",
        parallelBlock: "PAIRS",
        dictionaryBlock: "DICT",
      },
      "orthography",
    );
    // Dictionary keeps the DiPMT seat immediately above the question;
    // corrections (negative meta-evidence) sit farthest from it.
    expect(turn).toBe(
      "CORR\n\nPAIRS\n\nDICT\n\nGive the Igala word for water.\nAnswer in Igala only. Give the answer itself, nothing else.",
    );
  });

  it("omits empty blocks instead of leaving blank scaffolding", () => {
    const turn = buildUserTurnV4(
      "Question?",
      { correctionsBlock: "", parallelBlock: "", dictionaryBlock: "" },
      null,
    );
    expect(turn).toBe(
      "Question?\nAnswer in Igala only. Give the answer itself, nothing else.",
    );
  });
});
