import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";
import { igalaSystemV45, V4_5_EDIT_COUNT } from "./generation-prompt-v4-5";

const linesOf = (s: string) => s.split("\n").filter((l) => l.trim().length > 0);

/**
 * v4.5 is v4.4 with fourteen lines amended (generation-prompt-v4-5.ts names
 * each with its counts). What these pin: the amendment is exactly those
 * lines and nothing else moved; each line says what the recounted evidence
 * says and no longer says what two review rounds refuted; the prompt stays
 * under its raised ceiling; and the house style holds.
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

  it("amends exactly fourteen v4.4 lines, one for one, and adds no new line", () => {
    expect(V4_5_EDIT_COUNT).toBe(14);
    expect(removed).toHaveLength(14);
    expect(added).toHaveLength(14);
    expect(b).toHaveLength(a.length);
    a.forEach((line, i) => {
      if (!removed.includes(line)) expect(b[i]).toBe(line);
    });
  });

  it("COMP: every ki needs a job, listed once, with every attested linker among the jobs", () => {
    expect(v45).toContain(
      "Verbs chain with kẹ: one action then another is V kẹ V. Every ki needs a job (ku before I, kẹ before you): after a noun, who or which (ku before ma/mẹ); before a verb, may or must-not (a blessing usually one clause: [God] ki + verb + object); after tọdu (because) or (i)chẹñwu (if), ki or ku; for time, ka ki or kaki = when, while; after say, tell or know, kakini, ka ki ni or kaki, never dropped; after want, ki + subject (na tẹnẹ ku kà; na tẹnẹ kẹ wa). Any other ki is wrong: start a new sentence.",
    );
    expect(v45).not.toContain("kì/ki starts a new clause");
    expect(v45).not.toContain("kẹ links verbs only");
    // know takes kakini ('had we known', ig_bank_gram_031: 8 answers, 6
    // annotators); want takes ki + the subject, not kakini.
    expect(v45).toContain("after say, tell or know, kakini, ka ki ni or kaki");
    expect(v45).toContain("after want, ki + subject (na tẹnẹ ku kà; na tẹnẹ kẹ wa)");
    expect(v45).not.toContain("tell or want");
    // A blessing is usually, not always, one clause.
    expect(v45).not.toContain("one may-clause per blessing");
    // No toned kí is taught for 'that'.
    expect(v45).not.toContain("kí");
  });

  it("COMP: clauses in sequence take a new sentence; a clause inside another keeps its linker", () => {
    expect(v45).toContain(
      "Joining: kpai links nouns, never number words; clauses in sequence stand side by side or as two sentences, never with oñ; a clause inside another keeps its linker (next line). muda = but (rather) - contrast only, never 'must'.",
    );
    // tọdu and ichẹñwu moved into the job list.
    expect(v45).not.toContain("tọdu = because; ichẹñwu = if.");
    expect(v45).toContain(
      "The = lẹ AFTER the noun; lẹ may also close a relative clause (head + ki ... lẹ); never yí for 'the' (yí = this).",
    );
  });

  it("KI: ki is untoned everywhere in the prompt, the gate and the negation frames included", () => {
    expect(v45).not.toContain("kì");
    expect(v45).toContain("(lẹ, á, ki, ku, kpai, oñ, the final ñ)");
    expect(v45).toContain("prohibition: subject + ki + verb ... ñ.");
    expect(v45).toContain("Subject + ki + verb WITHOUT the nasal is a wish or blessing");
  });

  it("TONE: no tone exception line; METHOD 3 and 6 ask for letters and keep tone off unless asked", () => {
    expect(v45).not.toContain("One exception, where the mark is the whole meaning");
    expect(v45).not.toContain("jọ̀");
    expect(v45).toContain(
      "3. Use the DICTIONARY for the words your ANSWER needs, in those exact letters.",
    );
    expect(v45).toContain(
      "Copy attested letters exactly; tone marks stay off unless asked.",
    );
    expect(v45).toContain("no tone marks unless the question asks for them");
    expect(v45).not.toContain("àmì");
    expect(v45).toContain("Plural ami/abọ ONLY for people and animals");
    expect(v45).toContain("preverbal á = not yet complete");
  });

  it("NUM: the closed set with glosses from the evidence; sit is not listed", () => {
    expect(v45).toContain(
      "Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru (put in); every other verb keeps one form; none changes for person.",
    );
    expect(v45).not.toContain("gwugwu");
    expect(v45).not.toContain("(keep, sit)");
  });

  it("VAR: one form per word, checkable against the references; Central (Idah) named when asked", () => {
    expect(v45).toContain(
      "8. Keep one form of each word per answer: where your references give two area forms, use one unless asked to compare; if asked, say you aim to follow Central (Idah) usage. Never assert which town or area uses a form unless your reference material says so - saying you do not know is correct.",
    );
    for (const w of ["Ogwugwu", "Ibaji", "Uñ", "kpari", "ikerenku"]) {
      expect(v45).not.toContain(w);
    }
    expect(v45).toContain("ra for 'buy'");
  });

  it("ELI: optional elision; ñwu/ñwi whole; no ban on plain n; v4.4's efu clause unchanged", () => {
    expect(v45).toContain(
      "the FIRST vowel may be dropped, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu); both words written whole is also correct.",
    );
    expect(v45).toContain("Never add or strip a word-initial vowel.");
    expect(v45).toContain(
      "'to/for' is ñwu or ñwi (ñwi mostly before a vowel); 'to you' is ñwu wẹ or ñwẹ; ñw' is rare.",
    );
    expect(v45).not.toContain("plain n");
    expect(v45).not.toContain("never nwi");
    expect(v45).toContain(
      "'in' is efu, clipped to ef' only before a vowel (ef'ọdọ 2021), never before a consonant; before a town name it is efẹwọ.",
    );
    expect(v45).toContain("optional elision");
    expect(v45).not.toContain("apostrophized elision");
  });

  it("NEG: one clause-final nasal, spelling not legislated, never the Yoruba má", () => {
    expect(v45).toContain(
      "Negation: ONE nasal at the end of the clause (ñ, n, -n or 'ñ), never the Yoruba prohibitive má;",
    );
    // REGISTER no longer restates the nasal's spelling.
    expect(v45).toContain("first/second person. Never Bible forms");
    expect(v45).not.toContain("negative nasal written ñ");
  });

  it("INC: the incompletive stands before its verb, apart, fused or as a', all attested on train prompts", () => {
    expect(v45).toContain(
      "The incompletive á stands right before its verb: apart (a jẹñwu), fused (alọ) or as a' (a'loti); a noun keeps its own first vowel inside the word.",
    );
    expect(v45).not.toContain("the standalone word á");
    expect(v45).not.toContain("never a word on its own");
    expect(v45).not.toContain("a'jẹñwu");
  });

  it("POSS: the ban names chẹwñ and bẹwñ; the possessive is allowed, with a non-frozen example", () => {
    expect(v45).toContain(
      "never chẹwñ or bẹwñ; the possessive his/her is ñwu, -wn or wñ after the noun (ọlawn).",
    );
    expect(v45).not.toContain("never end a word in -wñ");
    expect(v45).not.toContain("[mother]");
    expect(v45).toContain("he/she i|u|-wn");
  });

  it("TRIM: the duplicated orthography sentences and the METHOD 1 tail are gone, the rules they repeated are not", () => {
    expect(v45).not.toContain("Seven vowels:");
    expect(v45).not.toContain("Mark tone as the dictionary and examples do.");
    expect(v45).not.toContain("are real Igala; write as attested");
    expect(v45).not.toContain("word-for-word Igala is not Igala");
    expect(v45).toContain("ẹ and ọ are separate letters, required where attested.");
    expect(v45).toContain(
      "This rule is about Igala words: a name or loanword copied from the question keeps its own letters.",
    );
    expect(v45).toContain(
      "1. Understand what the question MEANS before you write. Translate the thought, never word by word.",
    );
  });

  it("keeps every v4.4 line it does not name", () => {
    for (const s of [
      "Banki Access",
      "A destination follows a motion verb with ti: lo ti Idah, lo t'Ankpa.",
      "Dates: the month first, as an ordinal (ọchu + ẹkẹ-numeral)",
      "utokown, kwotejugede, chokalatu",
      "Give the answer only.",
    ]) {
      expect(v45).toContain(s);
    }
  });

  it("stays under the 1,650-token ceiling and above v4.4", () => {
    // v4.4 sat at 1,473 under 1,500. The ki-job list, the joining split, the
    // number guard, one form per word, optional elision and the four
    // speaker-form corrections do not fit under 1,500 even after TRIM cut
    // every sentence the allowlist already stated, so the ceiling is 1,650,
    // the most the brief allowed. The next version pays by cutting a rule.
    expect(v45.length / 4).toBeLessThanOrEqual(1650);
    expect(v45.length).toBeGreaterThan(IGALA_SYSTEM_V4_4.length);
  });

  it("obeys the house style: no em or en dashes", () => {
    expect(v45).not.toContain("—");
    expect(v45).not.toContain("–");
  });
});
