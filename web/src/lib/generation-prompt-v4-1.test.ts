import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_1 } from "./generation-prompt-v4-1";
import { IGALA_SYSTEM_V4 } from "./generation-prompt-v4";
import { IGALA_SYSTEM_V3 } from "./generation-prompt-v3";
import { IGALA_SYSTEM_V2 } from "./generation-prompt-v2";
import { CORRECTIONS_INTRO, PARALLEL_INTRO_V4 } from "@/lib/arena/retrieval-v4";
import { buildProtectedSet, checkStatic } from "@/lib/eval/leak-guard";

/**
 * rag-v4-1 = IGALA_SYSTEM_V4 plus the eight enshrinable rules (E1-E8) and
 * two procedural METHOD steps (M2, M3) from
 * tasks/grammar-failure-analysis-v4-1.md. These tests hold the prompt to the
 * same three contracts as v3/v4: leak-free static text (Scope A), the
 * mandated structural content, and the token budget - plus one contract of
 * its own: the spec's named leak-risk strings must be ABSENT (the schematic
 * citations were chosen precisely so no train attestation ships before the
 * real frozen-set scan clears it).
 *
 * The REAL Scope-A check - every line against the actual frozen protected
 * set from the database - is the v4.1 static leak check script and must be
 * run after any edit to the prompt text, before the candidate is registered.
 */

describe("IGALA_SYSTEM_V4_1 - static text is leak-free (Scope A)", () => {
  it("contains no frozen gold answer from a representative protected set", () => {
    const protectedSet = buildProtectedSet(
      ["Ómi", "ẹ́kọ̀", "Ọ́ma", "Áta mi", "Ọ̀gbẹ́nẹ́ chojẹ", "àdagbá"].map(
        (answerText, i) => ({ promptId: `ig_bank_${i}`, answerText }),
      ),
    );
    const report = checkStatic(
      [
        { where: "IGALA_SYSTEM_V4_1", text: IGALA_SYSTEM_V4_1 },
        { where: "CORRECTIONS_INTRO", text: CORRECTIONS_INTRO },
        { where: "PARALLEL_INTRO_V4", text: PARALLEL_INTRO_V4 },
      ],
      protectedSet,
    );
    expect(report.pass).toBe(true);
    expect(report.hits).toEqual([]);
  });

  it("ships NONE of the spec's named leak-risk strings", () => {
    // Section 3.4: all five are train-attested but must clear the frozen-set
    // scan before any of them may ship in static text. The v4.1 prompt cites
    // the frames schematically instead, so none may appear.
    for (const risky of [
      "lia kẹ jẹñwu",
      "Ọjọ ki d'ẹnyọ ñwu wẹ",
      "Wọla'ulẹ",
      "Ch'ugba t'ugba",
      "Abu wele",
    ]) {
      expect(IGALA_SYSTEM_V4_1, risky).not.toContain(risky);
    }
  });
});

describe("IGALA_SYSTEM_V4_1 - keeps the versioned skeleton", () => {
  it("opens with the same single-sentence identity as v2/v3/v4", () => {
    const identity = IGALA_SYSTEM_V2.split("\n")[0];
    expect(IGALA_SYSTEM_V4_1.startsWith(identity)).toBe(true);
  });

  it("keeps every section, in order, with eight METHOD steps", () => {
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
      const at = IGALA_SYSTEM_V4_1.indexOf(`\n${s}\n`);
      expect(at, s).toBeGreaterThan(last);
      last = at;
    }
    for (const step of [
      "1. ",
      "2. ",
      "3. ",
      "4. ",
      "5. ",
      "6. ",
      "7. ",
      "8. ",
    ]) {
      expect(IGALA_SYSTEM_V4_1).toContain(`\n${step}`);
    }
  });

  it("carries v4's six meaning-first METHOD steps byte-identical", () => {
    const v4Method = IGALA_SYSTEM_V4.split("THE METHOD\n")[1].split(
      "\n\nCLOSED-CLASS GRAMMAR",
    )[0];
    for (const line of v4Method.split("\n").filter((l) => l.trim())) {
      expect(IGALA_SYSTEM_V4_1, line.slice(0, 40)).toContain(line);
    }
  });

  it("carries every v3 grammar line verbatim (the A/B core is untouched)", () => {
    // Three of the ten gain an APPENDED clause (E2, E3, E7), but appending
    // after the line's final period keeps the v3 text verbatim inside it, so
    // the v3 citations keep applying.
    const v3Grammar = IGALA_SYSTEM_V3.split("CLOSED-CLASS GRAMMAR\n")[1].split(
      "\n\nREGISTER",
    )[0];
    for (const line of v3Grammar.split("\n").filter((l) => l.trim())) {
      expect(IGALA_SYSTEM_V4_1, line.slice(0, 40)).toContain(line);
    }
  });

  it("carries v4's dates line and small-word gate, gate still closing the section", () => {
    const grammar = IGALA_SYSTEM_V4_1.split("CLOSED-CLASS GRAMMAR\n")[1].split(
      "\n\nREGISTER",
    )[0];
    expect(grammar).toMatch(/Dates: day and month are ordinals/);
    const lines = grammar.split("\n").filter((l) => l.trim());
    expect(lines[lines.length - 1]).toMatch(
      /^Every small word must have a job\./,
    );
  });

  it("keeps v2/v3's Yoruba NEVER WRITE list byte-identical (it already passed Scope A)", () => {
    const v2List = IGALA_SYSTEM_V2.split("NEVER WRITE\n")[1].split("\n")[0];
    expect(IGALA_SYSTEM_V4_1).toContain(`NEVER WRITE\n${v2List}`);
  });

  it("keeps v4's Igbo market-day line", () => {
    expect(IGALA_SYSTEM_V4_1).toContain(
      "These are Igbo, not Igala: the market-day names Orie and Nkwọ.",
    );
  });
});

describe("IGALA_SYSTEM_V4_1 - M2/M3: the two procedural METHOD steps", () => {
  const method = IGALA_SYSTEM_V4_1.split("THE METHOD\n")[1]?.split(
    "\n\nCLOSED-CLASS GRAMMAR",
  )[0];

  it("step 7 performs the speech act instead of describing it (pattern 19)", () => {
    expect(method).toMatch(
      /7\. When the question asks how someone would say something, write the words they would SPEAK/,
    );
    expect(method).toMatch(/never a description of them speaking/);
  });

  it("step 8 declines invented dialect attributions (pattern 10)", () => {
    expect(method).toMatch(
      /8\. Never assert which town or area uses a form unless your reference material says so/,
    );
    expect(method).toMatch(/saying you do not know is correct/);
  });
});

describe("IGALA_SYSTEM_V4_1 - the eight enshrinable rules", () => {
  const grammar = IGALA_SYSTEM_V4_1.split("CLOSED-CLASS GRAMMAR\n")[1]?.split(
    "\n\nREGISTER",
  )[0];

  it("E1: serial chaining cited schematically - V kẹ V, no example sentence", () => {
    expect(grammar).toMatch(
      /Verbs chain with kẹ: one action then another is V kẹ V/,
    );
    expect(grammar).toMatch(/kì\/ki starts a new clause - never swap them/);
  });

  it("E2: the affirmative optative rides the negation line's kì frame", () => {
    // The blessing subject is cited by ROLE, never spelled: the real Scope-A
    // check (static-leak-check-v4-1.ts) flagged the spelled form as a frozen
    // gold collision (ig_bank_orth_010), so the word stays in the data layer.
    expect(grammar).toMatch(
      /Subject \+ kì \+ verb WITHOUT the nasal is a wish or blessing - the 'may God \.\.\.' frame/,
    );
    expect(grammar).not.toMatch(/Ọjọ kì \.\.\./);
  });

  it("E3: dative allomorphy on the elision line", () => {
    expect(grammar).toMatch(
      /'to\/for' is ñwu before a consonant, ñw' before a vowel - never nwi or plain nw/,
    );
  });

  it("E4: hyphenated prefixes banned, á standalone, noun keeps its vowel", () => {
    expect(grammar).toMatch(/Igala has no hyphenated prefixes/);
    expect(grammar).toMatch(/The incompletive is the standalone word á/);
    expect(grammar).toMatch(/a noun keeps its own first vowel inside the word/);
  });

  it("E5: the character ALLOWLIST replaces the ban-list sentence", () => {
    const orth = IGALA_SYSTEM_V4_1.split("ORTHOGRAPHY\n")[1].split("\n\n")[0];
    expect(orth).toMatch(/Igala words use ONLY these letters/);
    // The allowlist itself, and the č that evaded every ban list, named as
    // an example of what falls outside it.
    expect(orth).toContain(
      "a b ch d e ẹ f g gb gw i j k kp kw l m n ñ ñm ñw nw ny o ọ p r t u w y",
    );
    expect(orth).toContain("č");
    expect(orth).toMatch(/if a word seems to need one, the word is wrong/);
    // The old evadable ban sentence is gone.
    expect(orth).not.toContain("Never write ṣ, ị, ụ or ṅ");
    // The seven-vowels and digraph sentences stay verbatim from v3/v4.
    expect(orth).toContain("Seven vowels: a e ẹ i o ọ u");
    expect(orth).toContain("Digraphs ch, gb, gw, kp, kw and nasals ñ, ñm, ñw");
  });

  it("E6 + hardened tone clause on REGISTER", () => {
    const register = IGALA_SYSTEM_V4_1.split("REGISTER\n")[1].split("\n\n")[0];
    expect(register).toMatch(/no tone marks unless the question asks for them/);
    expect(register).not.toContain("sparse or no tone marks");
    expect(register).toMatch(/never end a word in -wñ/);
    // The v3/v4 register content around it survives.
    expect(register).toMatch(/Never Bible forms like Jihofa or taku/);
  });

  it("E7: the muda gloss on the Joining line", () => {
    expect(grammar).toMatch(
      /muda = but \(rather\) - contrast only, never 'must'/,
    );
  });

  it("E8: Yoruba blocklist extensions, DON'T-side only", () => {
    const neverWrite =
      IGALA_SYSTEM_V4_1.split("NEVER WRITE\n")[1].split("\n\n")[0];
    expect(neverWrite).toMatch(/ra for 'buy'/);
    // The Yoruba 'money' item is cited by role, never spelled: the real
    // Scope-A check flagged the spelled form as a frozen gold collision
    // (ig_bank_lex_003 - the folded strings coincide).
    expect(neverWrite).toMatch(/Yoruba's 'money' word/);
    expect(neverWrite).not.toMatch(/\bowo\b/);
    expect(neverWrite).toMatch(/fún or f'/);
    for (const w of ["iyawo", "ẹgbẹ", "tutu", "lafia, ọlafia"]) {
      expect(neverWrite, w).toContain(w);
    }
    // DON'T side only: the attested replacements are train/frozen gold and
    // must never appear (là, ọkọ, ọya, ñwi - Scope A, same rule as v2's list).
    for (const replacement of ["là", "ọya", "ñwi"]) {
      expect(neverWrite, replacement).not.toContain(replacement);
    }
  });

  it("E8: the ten recurring fabrications are named on their own line", () => {
    const neverWrite =
      IGALA_SYSTEM_V4_1.split("NEVER WRITE\n")[1].split("\n\n")[0];
    for (const fake of [
      "ádṣa",
      "kpùkẹ̀",
      "ojoji",
      "teketeke",
      "akeli",
      "gbede",
      "abẹki",
      "mímí",
      "efí",
      "kpegwa",
    ]) {
      expect(neverWrite, fake).toContain(fake);
    }
  });

  it("grammar stays structured lines, not prose", () => {
    const lines = grammar!.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(12);
    for (const line of lines) {
      expect(line.length, line.slice(0, 40)).toBeLessThanOrEqual(250);
    }
  });

  it("still does NOT enshrine the grade-C register layer (data-layer contract holds)", () => {
    // Greetings/farewells/thanks stay in the nine RagEntry grammar_rule rows.
    expect(IGALA_SYSTEM_V4_1).not.toContain("ọla + time/place");
    expect(IGALA_SYSTEM_V4_1).not.toContain("Agba");
    expect(IGALA_SYSTEM_V4_1).not.toContain("anya");
    expect(IGALA_SYSTEM_V4_1).not.toContain("na tẹnẹ");
  });
});

describe("IGALA_SYSTEM_V4_1 - token budget", () => {
  it("stays under ~1,150 tokens by the repo's chars/4 convention", () => {
    // v4 held ~900; the growth is exactly the M2/M3 steps and E1-E8. The
    // spec's ceiling is a hard one: anything pushing past 1,150 comes out of
    // the RAG entries or the weakest-evidence rule, never out of a silently
    // raised ceiling.
    expect(IGALA_SYSTEM_V4_1.length / 4).toBeLessThanOrEqual(1150);
  });
});
