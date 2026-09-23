import { IGALA_SYSTEM_V4_2 } from "./generation-prompt-v4-2";

/**
 * System prompt for the rag-v4-4 serving path: IGALA_SYSTEM_V4_2 with twelve
 * lines amended, every amendment traced to the Sep 13-23 annotation round
 * (139 corrections, 272 blind judgments on the v4.2 prompt bank, mined
 * 2026-09-23; the mine is summarised in tasks/jwal-ejeba-2023-rule-inventory.md
 * and the Context.md session state). Retrieval is v4.3's: buildRetrievalV4
 * plus the GRAMMAR block, so a v4.3/v4.4 delta isolates exactly these lines,
 * and a v4.2/v4.3 delta isolates the block.
 *
 * WHAT THE COMMUNITY TAUGHT US, AND WHERE IT LANDS
 * ------------------------------------------------
 * Bar for a prompt line: three or more annotators converging, or a two-
 * annotator correction of a form the prompt itself asserts. Two-annotator
 * lexical facts went to grammar_rule rows (prisma/seed-rag-v4-3-grammar.ts),
 * single-annotator items to notes.
 *
 *  M7+  Task narration. On article, heading, list and name prompts the model
 *       wrote about the task ("the article says", "I will now tell you") in
 *       invented words (utokown, kwotejugede, chokalatu); three annotators
 *       deleted the frame in 13 edits and it cost five prompts in judgment.
 *       METHOD 7 already forbids describing speech; it now covers text.
 *  NE1+ Institution names. "Banki Access" beat "Access Bank" 4 judges to 0:
 *       the class word may lead as its Igala or loan word; the rest is copied.
 *       The core of NE1 (never respell the distinctive part) is confirmed.
 *  ORD+ Motion + destination takes ti (lo ti Idah): four annotators, nine
 *       edits, and "Í lo t'Ídah" beat the bare form 3 to 0.
 *  NEG  The negator is written ñ by the community (five swaps, two
 *       annotators); the prompt's ǹ/-n was inherited from v3 and drew
 *       tone_marks tags. Spelling change only, in two lines.
 *  THE  "never yí" over-reached: yí = this (two annotators, four uses); the
 *       ban on yí as the article stands.
 *  ELI  'in' is efu, clipped only before a vowel; before a town, efẹwọ
 *       (four annotators, nine edits).
 *  DAT  Three annotators who never saw each other's work wrote the same date
 *       formula: month as an ordinal, then the day as a cardinal, then the
 *       year in digits. The v4 line had the day as an ordinal, day first.
 *  JOI  oñ as a clause linker is rewritten by three annotators (new sentence
 *       or tákí); kpai is never the linker between number words.
 *  REG  Same ñ spelling as NEG, and in the small-word gate's list (GATE).
 *  NW1  Yoruba imports the annotators removed three times each: nla, ode,
 *       plus ọja, ọsẹ, tí, tàbí, àmàà, Agó o.
 *  NW2  Nobody's words seen in 3 to 12 judged prompts: utokown, kwotejugede,
 *       chokalatu, onka ("sounds like Idoma"), onobirẹ (woman is onobulẹ),
 *       onokẹrẹ (onokẹlẹ), éfodṣa, awehi (right hand is awohì).
 *
 * NOT changed, on purpose: the pronoun table (three annotators write na as
 * the announcing 'I', but whether na is a pronoun or a particle is Salem's
 * call; the na frames are served as a grammar_rule row), du vs di (split),
 * directions (split), borrowed academic nouns (split), yes-no particle
 * (single evidence class). Every amended line is English plus forms the
 * annotators themselves wrote; the static Scope-A check
 * (scripts/static-leak-check-v4-4.ts) runs before this prompt serves.
 *
 * Token ceiling raised to 1,500 (v4.2 sat at 1,287 under 1,300); the test
 * pins it.
 */

interface LineEdit {
  /** A substring that identifies exactly one v4.2 line. */
  find: string;
  /** The v4.4 replacement for that whole line (without the trailing \n). */
  replaceLine: (line: string) => string;
}

const EDITS: LineEdit[] = [
  {
    // M7+
    find: "7. When the question asks how someone would say something",
    replaceLine: (l) =>
      l +
      " The same for an article sentence, a heading, a list or a name: write the text itself, never a sentence about the article, the question or what you are doing.",
  },
  {
    // NE1+
    find: "9. Names are not translated.",
    replaceLine: (l) =>
      l +
      " The class word of an institution (bank, school, company) may lead as its Igala or loan word - Banki Access - and the rest is copied letter for letter.",
  },
  {
    // ORD+
    find: "Order: Subject-Verb-Object;",
    replaceLine: (l) =>
      l +
      " A destination follows a motion verb with ti: lo ti Idah, lo t'Ankpa.",
  },
  {
    // NEG
    find: "Negation: ONLY a clause-final nasal",
    replaceLine: (l) =>
      l
        .replace("clause-final nasal (ǹ/-n)", "clause-final nasal, written ñ")
        .replace("subject + kì + verb ... ǹ.", "subject + kì + verb ... ñ."),
  },
  {
    // THE
    find: "The = lẹ AFTER the noun;",
    replaceLine: (l) =>
      l.replace("never yí.", "never yí for 'the' (yí = this)."),
  },
  {
    // ELI
    find: "Elision: vowel meets vowel",
    replaceLine: (l) =>
      l +
      " 'in' is efu, clipped to ef' only before a vowel (ef'ọdọ 2021), never before a consonant; before a town name it is efẹwọ.",
  },
  {
    // DAT
    find: "Dates: day and month are ordinals",
    replaceLine: () =>
      "Dates: the month first, as an ordinal (ọchu + ẹkẹ-numeral), then the day as a cardinal with mẹ- (never an ordinal), then ọdọ + the year in digits - Igala has no attested year-name, never compose one.",
  },
  {
    // JOI
    find: "Joining: kpai links nouns;",
    replaceLine: (l) =>
      l.replace(
        "Joining: kpai links nouns; oñ or a new sentence links clauses;",
        "Joining: kpai links nouns, never number words; clauses are joined by a new sentence (oñ is Bible register the community rewrites);",
      ),
  },
  {
    // REG
    find: "Write like the community, not scripture:",
    replaceLine: (l) =>
      l.replace("negative nasal attached (-n)", "negative nasal written ñ"),
  },
  {
    // GATE: the small-word list names the negator too; same spelling as NEG.
    find: "Every small word must have a job.",
    replaceLine: (l) =>
      l.replace(
        "(lẹ, á, kì, ku, kpai, oñ, ǹ)",
        "(lẹ, á, kì, ku, kpai, oñ, the final ñ)",
      ),
  },
  {
    // NW1
    find: "These are Yoruba, not Igala:",
    replaceLine: (l) =>
      l + " Also Yoruba: nla; ode; ọja; ọsẹ; tí; tàbí; àmàà; Agó o.",
  },
  {
    // NW2
    find: "Nobody's words - never write them again:",
    replaceLine: (l) =>
      l.replace(
        /\.$/,
        ", utokown, kwotejugede, chokalatu, onka, onobirẹ, onokẹrẹ, éfodṣa, awehi.",
      ),
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
        `v4.4 edit "${edit.find}" matched ${hits.length} v4.2 lines, expected exactly 1`,
      );
    }
    const before = lines[hits[0]];
    const after = edit.replaceLine(before);
    if (after === before) {
      throw new Error(`v4.4 edit "${edit.find}" changed nothing`);
    }
    lines[hits[0]] = after;
  }
  return lines.join("\n");
}

/** The number of v4.2 lines v4.4 amends; the test pins it. */
export const V4_4_EDIT_COUNT = EDITS.length;

export const IGALA_SYSTEM_V4_4 = applyEdits(IGALA_SYSTEM_V4_2);
