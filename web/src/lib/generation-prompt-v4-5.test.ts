import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";
import { IGALA_SYSTEM_V4_5, V4_5_EDIT_COUNT } from "./generation-prompt-v4-5";

const linesOf = (s: string) => s.split("\n").filter((l) => l.trim().length > 0);

/**
 * v4.5 is v4.4 with ten lines amended: six from the Salem Ejeba and Lydia
 * Wiernik write-up of 2026-09-25 (tasks/salem-lydia-writeup-2026-09-25-
 * inventory.md), four from the 2026-10-08 read of v4.4's train answers
 * against the speakers' gold (G1 to G4 in the file header). What these pin:
 * the amendment is exactly those ten lines and nothing else moved; each
 * amendment says what the write-up and the measurements say; the prompt
 * stays under its raised ceiling; and the house style holds.
 */
describe("IGALA_SYSTEM_V4_5", () => {
  const a = linesOf(IGALA_SYSTEM_V4_4);
  const b = linesOf(IGALA_SYSTEM_V4_5);
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));

  it("amends exactly ten v4.4 lines, one for one, and adds no new line", () => {
    expect(V4_5_EDIT_COUNT).toBe(10);
    expect(removed).toHaveLength(10);
    expect(added).toHaveLength(10);
    expect(b).toHaveLength(a.length);
    // Same order: every unchanged line sits where v4.4 had it.
    a.forEach((line, i) => {
      if (!removed.includes(line)) expect(b[i]).toBe(line);
    });
  });

  it("COMP: a ki-word opens a clause only with a job; the licence line is gone", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "A ki-word opens a clause only when it has a job: kì (low) = who, which; kí (high) = that, after a verb of saying, knowing or wanting. A ki with no job is wrong: start a new sentence.",
    );
    expect(IGALA_SYSTEM_V4_5).toContain("kẹ links verbs only.");
    expect(IGALA_SYSTEM_V4_5).not.toContain("kì/ki starts a new clause");
    // The serial-verb frame it sits in is untouched.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Verbs chain with kẹ: one action then another is V kẹ V.",
    );
    // The JOI line still joins clauses by a new sentence.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "clauses are joined by a new sentence (oñ is Bible register the community rewrites)",
    );
  });

  it("GATE: the small-word gate names kí beside kì", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "(lẹ, á, kì, kí, ku, kpai, oñ, the final ñ)",
    );
  });

  it("TONE: the no-marks default stands, with kí/kì and jọ/jọ̀ as its one exception", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "no tone marks unless the question asks for them",
    );
    expect(IGALA_SYSTEM_V4_5).toContain(
      "One exception, where the mark is the whole meaning: always tone kí (that) and kì (who, which, may), and jọ̀ (rejoice) against plain jọ (sit, several).",
    );
    // The rest of REGISTER survives.
    expect(IGALA_SYSTEM_V4_5).toContain("Never Bible forms like Jihofa or taku;");
  });

  it("NUM: only the closed set of verbs changes for number, none for person", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, sit), tọ/nyu/ru (put); every other verb keeps one form; none changes for person.",
    );
    expect(IGALA_SYSTEM_V4_5).toContain("du = take one, kó = take many.");
  });

  it("VAR: one variety per answer, Central (Idah) by default, named when asked; dialect honesty kept", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "8. Write one variety of Igala per answer, the Central (Idah) variety unless the question names another; never mix two varieties in one answer. If asked which variety you write, name it. Never assert which town or area uses a form unless your reference material says so - saying you do not know is correct.",
    );
    // The line asserts no Ibaji or Ogwugwu form (inventory contradiction 12).
    for (const w of ["Ogwugwu", "Ibaji", "Uñ", "kpari", "ikerenku"]) {
      expect(IGALA_SYSTEM_V4_5).not.toContain(w);
    }
    expect(IGALA_SYSTEM_V4_5).toContain("ra for 'buy'");
  });

  it("ELI: the first vowel MAY be dropped; the word-initial-vowel rule stays", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "the FIRST vowel may be dropped, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu); both words written whole is also correct.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("-> drop the FIRST vowel");
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Never add or strip a word-initial vowel.",
    );
  });

  it("G1: efu and ñwu are written whole; the clipped ef' and ñw' are not the norm", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "'to/for' is ñwu and 'in' is efu, written whole even before a vowel (efu ọdọ 2021); the clipped ñw' and ef' are rare - never nwi or plain nw. Before a town name 'in' is efẹwọ.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("ñw' before a vowel");
    expect(IGALA_SYSTEM_V4_5).not.toContain("clipped to ef' only before a vowel");
    expect(IGALA_SYSTEM_V4_5).not.toContain("ef'ọdọ");
  });

  it("G2: the negator attaches to the last word, in NEG and in REGISTER", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Negation: ONLY a clause-final nasal, written ñ and attached to the last word (-n, 'ñ or fused), never a word on its own; prohibition: subject + kì + verb ... ñ.",
    );
    expect(IGALA_SYSTEM_V4_5).toContain(
      "negative nasal ñ attached to the last word.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("negative nasal written ñ");
    // The blessing frame on the same line is untouched.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Subject + kì + verb WITHOUT the nasal is a wish or blessing - the 'may God ...' frame.",
    );
  });

  it("G3: the incompletive is written onto its verb or as a', never as a word of its own", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "The incompletive á is written onto its verb (afu, akọ) or as a', never as a word on its own; a noun keeps its own first vowel inside the word.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("the standalone word á");
    // The hyphen ban it shares the line with is untouched.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Igala has no hyphenated prefixes - never é- or any vowel + hyphen fused to a word.",
    );
    // Tense still names á as the incompletive marker.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "preverbal á = not yet complete (is-doing AND will-do)",
    );
  });

  it("G4: the -wñ ban is scoped to the Bible ending; the possessive is named as fine", () => {
    expect(IGALA_SYSTEM_V4_5).toContain(
      "never a Bible -wñ ending; the possessive his/her may be -wn or -wñ.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("never end a word in -wñ");
    // The pronoun table still gives -wn as the possessive.
    expect(IGALA_SYSTEM_V4_5).toContain("he/she i|u|-wn");
  });

  it("TRIM: the duplicated orthography sentences and the METHOD 1 tail are gone, the rules they repeated are not", () => {
    expect(IGALA_SYSTEM_V4_5).not.toContain("Seven vowels:");
    expect(IGALA_SYSTEM_V4_5).not.toContain(
      "Mark tone as the dictionary and examples do.",
    );
    expect(IGALA_SYSTEM_V4_5).not.toContain("are real Igala; write as attested");
    expect(IGALA_SYSTEM_V4_5).not.toContain("word-for-word Igala is not Igala");
    // What they repeated is still said once.
    expect(IGALA_SYSTEM_V4_5).toContain(
      "ẹ and ọ are separate letters, required where attested.",
    );
    expect(IGALA_SYSTEM_V4_5).toContain(
      "Igala words use ONLY these letters: a b ch d e ẹ f g gb gw i j k kp kw l m n ñ ñm ñw nw ny o ọ p r t u w y",
    );
    expect(IGALA_SYSTEM_V4_5).toContain(
      "This rule is about Igala words: a name or loanword copied from the question keeps its own letters.",
    );
    expect(IGALA_SYSTEM_V4_5).toContain(
      "1. Understand what the question MEANS before you write. Translate the thought, never word by word.",
    );
  });

  it("keeps every v4.4 line it does not name", () => {
    // Spot checks on the v4.4 amendments that v4.5 must not disturb.
    for (const s of [
      "Banki Access",
      "A destination follows a motion verb with ti: lo ti Idah, lo t'Ankpa.",
      "never yí for 'the' (yí = this)",
      "Dates: the month first, as an ordinal (ọchu + ẹkẹ-numeral)",
      "kpai links nouns, never number words",
      "utokown, kwotejugede, chokalatu",
      "Give the answer only.",
    ]) {
      expect(IGALA_SYSTEM_V4_5).toContain(s);
    }
  });

  it("stays under the 1,650-token ceiling and above v4.4", () => {
    // v4.4 sat at 1,473 under 1,500. The write-up's lines (complementiser,
    // tone exception, number guard, one variety, elision) cost ~190 tokens;
    // the TRIM edit bought back ~50 by cutting sentences the allowlist
    // already stated, landing at 1,599; the four speaker-form corrections
    // G1 to G4 add ~45 more. Nothing redundant is left to cut without
    // cutting a rule, so the ceiling is 1,650, the most the brief allowed,
    // and it is pinned here. The next version pays for its lines by cutting.
    expect(IGALA_SYSTEM_V4_5.length / 4).toBeLessThanOrEqual(1650);
    expect(IGALA_SYSTEM_V4_5.length).toBeGreaterThan(IGALA_SYSTEM_V4_4.length);
  });

  it("obeys the house style: no em or en dashes", () => {
    expect(IGALA_SYSTEM_V4_5).not.toContain("\u2014");
    expect(IGALA_SYSTEM_V4_5).not.toContain("\u2013");
  });
});
