import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";
import { igalaSystemV45, V4_5_EDIT_COUNT } from "./generation-prompt-v4-5";

const linesOf = (s: string) => s.split("\n").filter((l) => l.trim().length > 0);

/**
 * v4.5 is v4.4 with ten lines amended (generation-prompt-v4-5.ts names each
 * and its evidence). What these pin: the amendment is exactly those ten
 * lines and nothing else moved; each line says what the evidence says and
 * no longer says what the review refuted; the prompt stays under its raised
 * ceiling; and the house style holds.
 */
describe("igalaSystemV45", () => {
  const v45 = igalaSystemV45();
  const a = linesOf(IGALA_SYSTEM_V4_4);
  const b = linesOf(v45);
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));

  it("is built once and memoized", () => {
    expect(igalaSystemV45()).toBe(v45);
  });

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

  it("COMP: every ki needs a job, listed once, and the attested linkers are among the jobs", () => {
    expect(v45).toContain(
      "kẹ links verbs only. Every ki needs a job: after a noun, who or which (ku before ma/mẹ; ku is also ki + u); before a verb, may or must-not; after tọdu or (i)chẹñwu, ki or ku; after say, tell, know or want, the linker kakini or ka ki ni, never dropped. A ki with no such job is wrong: start a new sentence.",
    );
    expect(v45).not.toContain("kì/ki starts a new clause");
    // The relativizer is no longer listed a second way on the lẹ line.
    expect(v45).not.toContain("Relativizer kì (singular), ku before plural ma/me.");
    // The prompt does not teach a toned kí for 'that' (gold writes kakini).
    expect(v45).not.toContain("kí");
    // The serial-verb frame and the kept kì frames are untouched.
    expect(v45).toContain("Verbs chain with kẹ: one action then another is V kẹ V.");
    expect(v45).toContain("prohibition: subject + kì + verb ... ñ.");
    expect(v45).toContain("Subject + kì + verb WITHOUT the nasal is a wish or blessing");
  });

  it("COMP: lẹ MAY close a relative clause, it is not required", () => {
    expect(v45).toContain(
      "The = lẹ AFTER the noun; lẹ may also close a relative clause (head + kì ... lẹ); never yí for 'the' (yí = this).",
    );
    expect(v45).not.toContain("lẹ also closes relative clauses");
  });

  it("TONE: no tone exception line; dictionary and example tones stay off unless asked", () => {
    expect(v45).not.toContain("One exception, where the mark is the whole meaning");
    expect(v45).not.toContain("jọ̀");
    expect(v45).toContain(
      "no tone marks unless the question asks for them (dictionary and example forms give the letters; leave their marks off)",
    );
    // àmì untoned; á, kó, kì and yí keep the marks that distinguish them.
    expect(v45).not.toContain("àmì");
    expect(v45).toContain("Plural ami/abọ ONLY for people and animals");
    expect(v45).toContain("du = take one, kó = take many.");
    expect(v45).toContain("preverbal á = not yet complete");
  });

  it("NUM: the closed set with glosses from the evidence (tẹ is keep, gwugwu is sit); none for person", () => {
    expect(v45).toContain(
      "Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru (put in), gwugwu/jọ (sit); every other verb keeps one form; none changes for person.",
    );
    expect(v45).not.toContain("tẹ/jọ (keep, sit)");
  });

  it("VAR: one variety, the Central Igala of the references, as a constraint the model can obey", () => {
    expect(v45).toContain(
      "8. Keep to one variety in an answer, the Central Igala of your references; never mix forms from two areas unless the question asks to compare them. If asked which variety you write, say Central Igala. Never assert which town or area uses a form unless your reference material says so - saying you do not know is correct.",
    );
    expect(v45).not.toContain("unless the question names another");
    for (const w of ["Ogwugwu", "Ibaji", "Uñ", "kpari", "ikerenku"]) {
      expect(v45).not.toContain(w);
    }
    expect(v45).toContain("ra for 'buy'");
  });

  it("ELI: optional elision, ñwu/ñwi whole, and v4.4's efu clause unchanged", () => {
    expect(v45).toContain(
      "the FIRST vowel may be dropped, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu); both words written whole is also correct.",
    );
    expect(v45).not.toContain("-> drop the FIRST vowel");
    expect(v45).toContain("Never add or strip a word-initial vowel.");
    expect(v45).toContain(
      "'to/for' is ñwu or ñwi, written whole even before a vowel (ñw' is rare) - never with plain n (nwi, nw).",
    );
    // The served v4.3 locative row writes ef'ọdọ; the prompt must agree.
    expect(v45).toContain(
      "'in' is efu, clipped to ef' only before a vowel (ef'ọdọ 2021), never before a consonant; before a town name it is efẹwọ.",
    );
    expect(v45).not.toContain("the clipped ñw' and ef' are rare");
    expect(v45).toContain("optional elision");
    expect(v45).not.toContain("apostrophized elision");
  });

  it("NEG: one clause-final nasal, spelling not legislated, never the Yoruba má", () => {
    expect(v45).toContain(
      "Negation: ONE nasal at the end of the clause (ñ, -n or 'ñ), never the Yoruba prohibitive má;",
    );
    expect(v45).toContain("the negative nasal at the clause end.");
    expect(v45).not.toContain("attached to the last word");
    expect(v45).not.toContain("negative nasal written ñ");
    expect(v45).toContain("A nasal added for any other reason makes a different word.");
  });

  it("INC: the incompletive fuses or takes an apostrophe, each with an attested form", () => {
    expect(v45).toContain(
      "The incompletive á is fused to its verb (alọ) or written a' (a'jẹñwu), never a word on its own; a noun keeps its own first vowel inside the word.",
    );
    expect(v45).not.toContain("the standalone word á");
    expect(v45).toContain(
      "Igala has no hyphenated prefixes - never é- or any vowel + hyphen fused to a word.",
    );
  });

  it("POSS: the ban names chẹwñ and bẹwñ; the possessive -wn / -wñ is allowed", () => {
    // The example is schematized: spelled out it is a frozen gold answer.
    expect(v45).toContain(
      "never chẹwñ or bẹwñ, but the possessive his/her is ñwu, -wn or -wñ ([mother] wñ).",
    );
    expect(v45).not.toContain("never end a word in -wñ");
    expect(v45).toContain("Never Bible forms like Jihofa or taku;");
    expect(v45).toContain("he/she i|u|-wn");
  });

  it("TRIM: the duplicated orthography sentences and the METHOD 1 tail are gone, the rules they repeated are not", () => {
    expect(v45).not.toContain("Seven vowels:");
    expect(v45).not.toContain("Mark tone as the dictionary and examples do.");
    expect(v45).not.toContain("are real Igala; write as attested");
    expect(v45).not.toContain("word-for-word Igala is not Igala");
    expect(v45).toContain("ẹ and ọ are separate letters, required where attested.");
    expect(v45).toContain(
      "Igala words use ONLY these letters: a b ch d e ẹ f g gb gw i j k kp kw l m n ñ ñm ñw nw ny o ọ p r t u w y",
    );
    expect(v45).toContain(
      "This rule is about Igala words: a name or loanword copied from the question keeps its own letters.",
    );
    expect(v45).toContain(
      "1. Understand what the question MEANS before you write. Translate the thought, never word by word.",
    );
  });

  it("keeps every v4.4 line it does not name, the small-word gate included", () => {
    for (const s of [
      "Banki Access",
      "A destination follows a motion verb with ti: lo ti Idah, lo t'Ankpa.",
      "Dates: the month first, as an ordinal (ọchu + ẹkẹ-numeral)",
      "kpai links nouns, never number words",
      "(lẹ, á, kì, ku, kpai, oñ, the final ñ)",
      "utokown, kwotejugede, chokalatu",
      "Give the answer only.",
    ]) {
      expect(v45).toContain(s);
    }
  });

  it("stays under the 1,650-token ceiling and above v4.4", () => {
    // v4.4 sat at 1,473 under 1,500. The write-up's lines (the ki-job list,
    // the number guard, one variety, optional elision) and the four
    // speaker-form corrections (ñwu/ñwi, the negative nasal, the
    // incompletive, the possessive) do not fit under 1,500 even after the
    // TRIM edit cut every sentence the allowlist already stated, so the
    // ceiling is 1,650, the most the brief allowed, and it is pinned here.
    // The next version pays for its lines by cutting a rule.
    expect(v45.length / 4).toBeLessThanOrEqual(1650);
    expect(v45.length).toBeGreaterThan(IGALA_SYSTEM_V4_4.length);
  });

  it("obeys the house style: no em or en dashes", () => {
    expect(v45).not.toContain("—");
    expect(v45).not.toContain("–");
  });
});
