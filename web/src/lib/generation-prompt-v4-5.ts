import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";

/**
 * System prompt for the rag-v4-5 serving path: IGALA_SYSTEM_V4_4 with ten
 * lines amended. Six amendments trace to the Salem Ejeba and Lydia Wiernik
 * write-up of 2026-09-25 ("Igala grammar writeup: Patching the holes in the
 * model"), read rule by rule and diffed against what we serve in
 * tasks/salem-lydia-writeup-2026-09-25-inventory.md (82 rules, graded by
 * evidence class; its "Ship list" names exactly what this file carries), with
 * Halim's decisions of 2026-10-08 in tasks/prd-salem-writeup-ingest-2026-10-08.md.
 * Four trace to a 2026-10-08 read of the 249 unjudged v4.4 train answers
 * against the 636 speakers' gold answers on the same prompts, which found
 * four places where the served prompt itself taught a form no speaker writes.
 * Retrieval, the grammar block, the repair round and the name check are
 * v4.4's, unchanged, so a v4.4/v4.5 delta isolates exactly these lines.
 *
 * WHAT THE WRITE-UP TAUGHT US, AND WHERE IT LANDS
 * -----------------------------------------------
 * Bar for a prompt line, unchanged: two evidence classes (grade B) or three
 * (A), or a correction of a form the prompt itself asserts. The write-up and
 * Ejeba (2023) count as ONE class, the same author; the Bible corpus and the
 * community's corrections and gold are the other two. Three of the 82 rules
 * clear the bar and were in no served line; they are COMP, TONE and NUM.
 * Everything single-class went to scholarship_note rows
 * (prisma/seed-rag-v4-5-grammar.ts), stored with attribution and never
 * served. Every rule here is restated; no sentence of the write-up appears.
 *
 *  COMP Complementiser restraint (W-3.2-1, W-3.2-3, W-3.2-13). Measured on
 *       the Sep 2026 train bank: a standalone ki in 31% of v4.4 answers
 *       against 15.5% of speakers' answers (44% for bare Gemini). The authors
 *       read it as over-use, yet their own data says Igala keeps a linker in
 *       every real embedded clause, so the fault is a ki with no job, or kí
 *       where kì belongs. The served clause "kì/ki starts a new clause" read
 *       as a licence (inventory contradiction 1) and is replaced: a ki-word
 *       opens a clause only as the relativizer kì or the complementiser kí
 *       after a verb of saying, knowing or wanting; otherwise a new sentence.
 *       kí joins the small-word gate's list (GATE) so the gate names it.
 *  TONE Tone where it is the whole meaning (W-3.2-7, W-3.1-19). kí 'that'
 *       and kì 'who, which, may' differ only in tone; so do jọ 'sit, several'
 *       and jọ̀ 'rejoice'. The authors ask for tone on every word; gold
 *       carries tone on 27.4% of answers, one annotator writes 62% of those
 *       and the Bible marks none, so the REGISTER default stays
 *       (contradiction 2) and gains this one exception. Community leg: kì is
 *       the most-toned small word in gold, 36 of 140 occurrences
 *       (tasks/grammar-evidence-community.md section 6).
 *  NUM  Number-agreement guard (W-3.1-2, W-3.1-3, W-3.1-10). A closed set of
 *       verbs changes for number (du/kó, tinyo/rinyo, tẹ/jọ, tọ/nyu/ru) and
 *       no verb changes for person. The prompt had du/kó alone; row 4c7b83ae
 *       said "never make an r- form of any other verb" only when retrieved.
 *       Corpus leg: du/kó 137/77 rows, tinyo/rinyo 356/761, and no
 *       person-inflected verb anywhere (tasks/grammar-evidence-scholarship.md
 *       section 1.3, tasks/igala-grammar-deduced.md R5.6).
 *  VAR  One variety per answer (W-4-2, W-4-3). Scholarship only as a claim
 *       about Igala, served on Halim's decision of 2026-10-08 as procedure:
 *       the Central (Idah) variety unless the question names another, named
 *       when asked, never two varieties in one answer. The line asserts no
 *       Ibaji or Ogwugwu form (contradiction 12: the ban on ra 'buy' stands,
 *       dialect-blind, until the authors answer inventory question 16).
 *  ELI  Elision softened (contradiction 3). The authors want expanded forms;
 *       gold contracts in 32.4% of answers and the same annotators write both
 *       forms of one phrase, so the line says the first vowel MAY be dropped
 *       where it said "drop", and keeps "never add or strip a word-initial
 *       vowel", which is grade A and already served. Carries G1 below.
 *  TRIM Two lines lose words that stated no rule of their own, to pay for the
 *       lines above. ORTHOGRAPHY drops the vowel list and the digraph
 *       sentence (both enumerated in the allowlist in the same line) and the
 *       sentence "Mark tone as the dictionary and examples do", which REGISTER
 *       contradicts and which, read against a fully toned dictionary block,
 *       is the likeliest reason v4.4 wrote tone on 69% of its train answers
 *       despite the served rule. METHOD 1 drops its restated tail.
 *
 * FOUR PLACES THE SERVED PROMPT TAUGHT A FORM NO SPEAKER WRITES
 * -------------------------------------------------------------
 * Counts from the 249 unjudged v4.4 train answers against the 636 gold
 * answers on the same prompts (2026-10-08). Each is a correction of a form
 * the prompt asserted, the same bar v4.4's THE and ELI edits met.
 *
 *  G1   The clipped ef' and ñw' are not the norm. v4.4 wrote ef' 22 times,
 *       gold 0, with efu whole 34 times; ñw' 20 against 0, with ñwu 107 and
 *       ñwi 60. The Elision line now says both words are written whole even
 *       before a vowel and the clipped forms are rare. The spelling ban
 *       (never nwi or plain nw) and efẹwọ before a town stay.
 *  G2   The negator attaches. v4.4 wrote a free-standing ñ 32 times and n 7;
 *       speakers attach it to the last word (-n, 'ñ) or fuse it. "written ñ"
 *       read as a word of its own; NEG and REGISTER now say it attaches.
 *  G3   The incompletive fuses. v4.4 wrote "a chi", "a di", "a lo" as two
 *       words 168 times and fused 37; speakers fuse (afu, abi, akọ) or write
 *       a' with an apostrophe. "the standalone word á" taught the divergent
 *       form; the line now says it is written onto its verb or as a'.
 *  G4   "never end a word in -wñ" over-reached, as "never yí" once did: two
 *       annotators write the 3sg possessive as -wñ or -wn. The ban is scoped
 *       to the negator and the Bible forms; the possessive is named as fine.
 *
 * NOT changed, on purpose: the presentative yì (0 corpus tokens; untoned
 * output cannot tell it from yí 'this'), gwùgwú 'sit' (0 hits in 30,907
 * verses), hyphenated àma- and the compound idioms, ìpọ́lú for Paul (the
 * names rule is annotator-driven), the negator spelling ń, pronoun doubling,
 * nwu as a free possessive: inventory contradictions 4 to 11, scholarship
 * only or with the corpus and community running the other way. The
 * factive/non-factive kí/kì reading waits for three annotators to judge the
 * write-up's paired examples blind. The register-weight ask has no failing
 * outputs named yet (inventory question 8). The JOI line keeps "clauses are
 * joined by a new sentence": a that-clause is a complement, not a joined
 * clause, and COMP sits on the next line. The static Scope-A check
 * (scripts/static-leak-check-v4-5.ts) runs before this prompt serves.
 *
 * Token ceiling: v4.4 sat at 1,473 of 1,500. The ship-list lines cost ~190
 * tokens and TRIM bought back ~50, which landed at 1,599; G1 to G4 add ~45
 * more. Nothing redundant is left to cut without cutting a rule, so the
 * ceiling rises to 1,650, the most the brief allowed, and the test pins it
 * with the reason beside it. The next version pays for its lines by cutting
 * a rule, not by raising this again.
 */

interface LineEdit {
  /** A substring that identifies exactly one v4.4 line. */
  find: string;
  /** The v4.5 replacement for that whole line (without the trailing \n). */
  replaceLine: (line: string) => string;
}

/** Replace a substring that must occur exactly once in the line. */
function swap(line: string, from: string, to: string): string {
  const first = line.indexOf(from);
  if (first < 0 || line.indexOf(from, first + 1) >= 0) {
    throw new Error(`v4.5 edit: "${from}" must occur exactly once in the line`);
  }
  return line.slice(0, first) + to + line.slice(first + from.length);
}

const EDITS: LineEdit[] = [
  {
    // TRIM (METHOD 1): the restated tail asserts nothing the sentence before
    // it does not.
    find: "1. Understand what the question MEANS before you write.",
    replaceLine: (l) =>
      swap(
        l,
        "Translate the thought, never word by word - word-for-word Igala is not Igala.",
        "Translate the thought, never word by word.",
      ),
  },
  {
    // VAR: one variety per answer, Central (Idah) by default, named when
    // asked. Prepended to the dialect-honesty step it refines; that step's
    // own sentence is kept verbatim.
    find: "8. Never assert which town or area uses a form",
    replaceLine: (l) =>
      swap(
        l,
        "8. Never assert",
        "8. Write one variety of Igala per answer, the Central (Idah) variety unless the question names another; never mix two varieties in one answer. If asked which variety you write, name it. Never assert",
      ),
  },
  {
    // G2 (NEG): the negator attaches to the last word; it is not a word.
    find: "Negation: ONLY a clause-final nasal",
    replaceLine: (l) =>
      swap(
        l,
        "Negation: ONLY a clause-final nasal, written ñ;",
        "Negation: ONLY a clause-final nasal, written ñ and attached to the last word (-n, 'ñ or fused), never a word on its own;",
      ),
  },
  {
    // ELI: the first vowel MAY be dropped; the word-initial-vowel rule stays.
    // G1: efu and ñwu are written whole; the clipped forms are rare.
    find: "Elision: vowel meets vowel",
    replaceLine: (l) => {
      let out = swap(
        l,
        "Elision: vowel meets vowel across a word break -> drop the FIRST vowel, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu).",
        "Elision: where a vowel meets a vowel across a word break the FIRST vowel may be dropped, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu); both words written whole is also correct.",
      );
      out = swap(
        out,
        "'to/for' is ñwu before a consonant, ñw' before a vowel - never nwi or plain nw. 'in' is efu, clipped to ef' only before a vowel (ef'ọdọ 2021), never before a consonant; before a town name it is efẹwọ.",
        "'to/for' is ñwu and 'in' is efu, written whole even before a vowel (efu ọdọ 2021); the clipped ñw' and ef' are rare - never nwi or plain nw. Before a town name 'in' is efẹwọ.",
      );
      return out;
    },
  },
  {
    // NUM: the closed set of number-agreeing verbs; nothing for person.
    find: "du = take one, kó = take many.",
    replaceLine: (l) =>
      l +
      " Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, sit), tọ/nyu/ru (put); every other verb keeps one form; none changes for person.",
  },
  {
    // COMP: the licence to open clauses with ki is withdrawn; a ki-word
    // opens a clause only with a job.
    find: "Verbs chain with kẹ",
    replaceLine: (l) =>
      swap(
        l,
        "kẹ links verbs; kì/ki starts a new clause - never swap them.",
        "kẹ links verbs only. A ki-word opens a clause only when it has a job: kì (low) = who, which; kí (high) = that, after a verb of saying, knowing or wanting. A ki with no job is wrong: start a new sentence.",
      ),
  },
  {
    // G3: the incompletive is written onto its verb, or as a'; never a word
    // of its own. The hyphen ban it shares the line with is untouched.
    find: "Igala has no hyphenated prefixes",
    replaceLine: (l) =>
      swap(
        l,
        "The incompletive is the standalone word á;",
        "The incompletive á is written onto its verb (afu, akọ) or as a', never as a word on its own;",
      ),
  },
  {
    // GATE: the small-word list names kí beside kì.
    find: "Every small word must have a job.",
    replaceLine: (l) =>
      swap(
        l,
        "(lẹ, á, kì, ku, kpai, oñ, the final ñ)",
        "(lẹ, á, kì, kí, ku, kpai, oñ, the final ñ)",
      ),
  },
  {
    // TONE: the one exception to the no-marks default. G2: the negator
    // attaches. G4: the -wñ ban is scoped so the possessive is not caught.
    find: "Write like the community, not scripture:",
    replaceLine: (l) => {
      let out = swap(
        l,
        "negative nasal written ñ. Never Bible forms",
        "negative nasal ñ attached to the last word. One exception, where the mark is the whole meaning: always tone kí (that) and kì (who, which, may), and jọ̀ (rejoice) against plain jọ (sit, several). Never Bible forms",
      );
      out = swap(
        out,
        "never end a word in -wñ.",
        "never a Bible -wñ ending; the possessive his/her may be -wn or -wñ.",
      );
      return out;
    },
  },
  {
    // TRIM (ORTHOGRAPHY): the vowel list and the digraph sentence repeat the
    // allowlist; the tone sentence contradicts REGISTER.
    find: "Seven vowels: a e ẹ i o ọ u;",
    replaceLine: (l) => {
      let out = swap(
        l,
        "Seven vowels: a e ẹ i o ọ u; ẹ and ọ are separate letters, required where attested. Mark tone as the dictionary and examples do. ",
        "ẹ and ọ are separate letters, required where attested. ",
      );
      out = swap(
        out,
        "This letters rule is about IGALA words: a name or borrowed word copied from the question keeps its own letters. Digraphs ch, gb, gw, kp, kw and nasals ñ, ñm, ñw are real Igala; write as attested.",
        "This rule is about Igala words: a name or loanword copied from the question keeps its own letters.",
      );
      return out;
    },
  },
];

function applyEdits(base: string): string {
  const lines = base.split("\n");
  for (const edit of EDITS) {
    const hits = lines
      .map((l, i) => (l.includes(edit.find) ? i : -1))
      .filter((i) => i >= 0);
    if (hits.length !== 1) {
      throw new Error(
        `v4.5 edit "${edit.find}" matched ${hits.length} v4.4 lines, expected exactly 1`,
      );
    }
    const before = lines[hits[0]];
    const after = edit.replaceLine(before);
    if (after === before) {
      throw new Error(`v4.5 edit "${edit.find}" changed nothing`);
    }
    lines[hits[0]] = after;
  }
  return lines.join("\n");
}

/** The number of v4.4 lines v4.5 amends; the test pins it. */
export const V4_5_EDIT_COUNT = EDITS.length;

export const IGALA_SYSTEM_V4_5 = applyEdits(IGALA_SYSTEM_V4_4);
