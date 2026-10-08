import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";

/**
 * System prompt for the rag-v4-5 serving path: IGALA_SYSTEM_V4_4 with ten
 * lines amended. The amendments trace to the Salem Ejeba and Lydia Wiernik
 * write-up of 2026-09-25 ("Igala grammar writeup: Patching the holes in the
 * model"), read rule by rule and diffed against what we serve in
 * tasks/salem-lydia-writeup-2026-09-25-inventory.md (82 rules, graded by
 * evidence class), with Halim's decisions of 2026-10-08
 * (tasks/prd-salem-writeup-ingest-2026-10-08.md); to a 2026-10-08 read of
 * the 249 unjudged v4.4 train answers against the speakers' gold on the same
 * prompts; and to the three-lens review of the first v4.5 draft, adjudicated
 * the same day, every claim re-checked against the gold before it landed.
 * Retrieval, the repair round and the name check are v4.4's, unchanged. The
 * grammar block reads v4.4's rows plus the v4.5 rows
 * (prisma/seed-rag-v4-5-grammar.ts, chunkType grammar_rule_v4_5, which no
 * other label reads), so a v4.4/v4.5 delta is these lines plus those rows.
 *
 * Bar for a prompt line, unchanged: two evidence classes (grade B) or three
 * (A), or a correction of a form the prompt itself asserts. The write-up and
 * Ejeba (2023) count as ONE class, the same author; the Bible corpus and the
 * community's corrections and gold are the other two. Every rule here is
 * restated; no sentence of the write-up appears. Gold counts are over the
 * 1,446 gold answers of the Oct 8 review export unless a line says
 * otherwise.
 *
 *  COMP Every ki needs a job, stated once (W-3.2-1, W-3.2-3, W-3.2-13).
 *       Measured: a standalone ki in 31% of v4.4 answers against 15.5% of
 *       speakers' answers. v4.4's "kì/ki starts a new clause" read as a
 *       licence (inventory contradiction 1), and the jobs of kì were listed
 *       three ways on three lines. The kẹ line now holds the one list:
 *       relativizer after a noun (ku before ma/mẹ, ku = ki + u); may or
 *       must-not before a verb; ki or ku after tọdu and (i)chẹñwu (gold:
 *       chẹñwu ki/ku 30, tọdu ku/ki 21; corpus ichewñ ku 704/753); kakini or
 *       ka ki ni after say, tell, know or want (gold: after chẹ, ka, ñwu,
 *       tẹnẹ 'want', mọ 'know'; never after 'hear', so hear is not listed).
 *       Anything else starts a new sentence. The kí/kì tone contrast is NOT
 *       in the prompt: gold writes kakini for 'that' after saying, kí only 9
 *       times (two annotators), and speakers strip the tone when they touch
 *       it. The relative-clause line loses its duplicate list and lẹ MAY
 *       close a relative clause (31 gold relatives close with lẹ; on two
 *       prompts with 14 gold answers none does).
 *  NUM  Number-agreement guard (W-3.1-2, W-3.1-3, W-3.1-10). Only du/kó
 *       (take), tinyo/rinyo (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru
 *       (put in) and gwugwu/jọ (sit) change for number; no verb changes for
 *       person. Glosses per row 42657b2c, tasks/igala-grammar-deduced.md
 *       R5.6 and tasks/grammar-evidence-scholarship.md 1.3 (tẹ is keep, not
 *       sit). gwugwu clears the bar on the community leg: 11 gold answers,
 *       four annotators; plural jọ for sit has one gold token. Corpus leg for
 *       the rest: du/kó 137/77 rows, tinyo/rinyo 356/761, no
 *       person-inflected verb anywhere.
 *  VAR  One variety per answer (W-4-2, W-4-3), Halim's decision of
 *       2026-10-08, written as a constraint the model can obey: the model
 *       holds no material saying which forms are Idah, so it keeps to the
 *       Central Igala of its references, mixes no two areas' forms unless
 *       asked to compare, and names Central Igala when asked. The
 *       dialect-honesty sentence it joins is kept verbatim. No Ibaji or
 *       Ogwugwu form is asserted (contradiction 12: the ra ban stands).
 *  ELI  Elision is optional (contradiction 3): gold contracts in 32.4% of
 *       answers and the same annotators write both forms of one phrase, so
 *       the first vowel MAY be dropped; "never add or strip a word-initial
 *       vowel" stays (grade A). 'to/for' is ñwu or ñwi, written whole even
 *       before a vowel (gold ñwu/nwu 231, ñwi/nwi 81, ñw' 7). The efu clause
 *       is v4.4's unchanged: speakers do write ef' before a vowel and served
 *       row v4.3 locative writes ef'ọdọ, so the draft's "ef' is rare" is
 *       withdrawn. REGISTER's "apostrophized elision" becomes "optional
 *       elision" to match.
 *  NEG  The negative is one nasal at the end of the clause, spelled as the
 *       speakers spell it (ñ, -n or 'ñ): gold has a free-standing ñ 48 times
 *       from five annotators, -n 11, 'ñ 12, so the draft's "attached" rule
 *       is withdrawn and the spelling is not legislated. Never the Yoruba
 *       prohibitive má (both annotators who saw it rejected it); preverbal
 *       ma is left alone, being the plural pronoun and the speakers' own
 *       why-not frame.
 *  INC  The incompletive á is fused to its verb (alọ, 'where are you
 *       going', annotator_8) or written a' (a'jẹñwu, 'is eating',
 *       annotator_3; a' forms 31 times in gold), never a word on its own:
 *       v4.4 wrote "a chi", "a di", "a lo" as two words 168 times, fused 37,
 *       and "the standalone word á" taught it.
 *  POSS The -wñ ban names the forms, not the ending: never chẹwñ (v4.4's
 *       own invention) or bẹwñ (corrected by annotator_5); the possessive
 *       his/her is ñwu, -wn or -wñ (annotator_6 writes -wñ after the word
 *       for mother; annotator_8 writes ọlawn, ugbo-wn), and ewñ 'what'
 *       feeds a served why-frame. The example is schematized as
 *       "[mother] wñ": spelled out, it is the whole gold answer of a frozen
 *       prompt, and the Scope-A check caught it.
 *  TONE The draft's tone exception (always tone kí/kì and jọ/jọ̀) is
 *       withdrawn: gold leaves ki unmarked 107 times against 48 kì (one
 *       annotator) and 9 kí, and the line would have toned every legitimate
 *       ki. The kí/kì contrast is served by a v4.5 row only when a question
 *       asks for tone; jọ/jọ̀ is a note (the Bible marks no tone, so the
 *       corpus cannot attest the mark). REGISTER now says dictionary and
 *       example forms give the letters and their tone marks stay off unless
 *       asked: the dictionary block arrives toned and tells the model to copy
 *       forms exactly, the likeliest reason v4.4 toned 69% of its answers.
 *       That shared user turn is v4.4's too and is not touched. The prompt's
 *       own àmì becomes ami (the mark distinguishes nothing; gold writes ami,
 *       àmì and am'); á keeps its mark (it is what tells it from a = we),
 *       as do kó, kì and yí.
 *  TRIM ORTHOGRAPHY drops the vowel list and the digraph sentence (the
 *       allowlist in the same line enumerates both) and "Mark tone as the
 *       dictionary and examples do", which REGISTER contradicts. METHOD 1
 *       drops its restated tail.
 *
 * NOT changed, on purpose: the presentative yì, hyphenated àma- and the
 * compound idioms, ìpọ́lú for Paul, the negator spelling ń, pronoun
 * doubling, nwu as a free possessive (inventory contradictions 4 to 11);
 * the factive/non-factive kí/kì reading (waits for a blind judgment by
 * three annotators); the register-weight ask (no failing outputs named
 * yet). The static Scope-A check (scripts/static-leak-check-v4-5.ts) runs
 * before this prompt serves.
 *
 * Token ceiling 1,650 (v4.4 sat at 1,473 of 1,500), pinned in the test with
 * the reason beside it. The next version pays for its lines by cutting a
 * rule, not by raising this again.
 *
 * The prompt is built on first use, not at import (igalaSystemV45): if a
 * v4.4 line ever stops matching an edit, only a rag-v4-5 request fails, and
 * every route that merely imports the v4 family keeps serving.
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
    // TRIM (METHOD 1): the restated tail asserts nothing new.
    find: "1. Understand what the question MEANS before you write.",
    replaceLine: (l) =>
      swap(
        l,
        "Translate the thought, never word by word - word-for-word Igala is not Igala.",
        "Translate the thought, never word by word.",
      ),
  },
  {
    // VAR: one variety, the Central Igala of the references; the honesty
    // sentence it joins stays verbatim.
    find: "8. Never assert which town or area uses a form",
    replaceLine: (l) =>
      swap(
        l,
        "8. Never assert",
        "8. Keep to one variety in an answer, the Central Igala of your references; never mix forms from two areas unless the question asks to compare them. If asked which variety you write, say Central Igala. Never assert",
      ),
  },
  {
    // NEG: one clause-final nasal, spelled as speakers spell it; never the
    // Yoruba prohibitive.
    find: "Negation: ONLY a clause-final nasal",
    replaceLine: (l) =>
      swap(
        l,
        "Negation: ONLY a clause-final nasal, written ñ;",
        "Negation: ONE nasal at the end of the clause (ñ, -n or 'ñ), never the Yoruba prohibitive má;",
      ),
  },
  {
    // COMP: lẹ MAY close a relative clause; the relativizer list moves to
    // the one enumeration on the kẹ line.
    find: "The = lẹ AFTER the noun;",
    replaceLine: (l) => {
      let out = swap(
        l,
        "lẹ also closes relative clauses (head + kì ... lẹ);",
        "lẹ may also close a relative clause (head + kì ... lẹ);",
      );
      out = swap(out, " Relativizer kì (singular), ku before plural ma/me.", "");
      return out;
    },
  },
  {
    // ELI: the first vowel MAY be dropped. 'to/for' written whole, ñwi named.
    // The efu clause is v4.4's, unchanged.
    find: "Elision: vowel meets vowel",
    replaceLine: (l) => {
      let out = swap(
        l,
        "Elision: vowel meets vowel across a word break -> drop the FIRST vowel, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu).",
        "Elision: where a vowel meets a vowel across a word break the FIRST vowel may be dropped, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu); both words written whole is also correct.",
      );
      out = swap(
        out,
        "'to/for' is ñwu before a consonant, ñw' before a vowel - never nwi or plain nw.",
        "'to/for' is ñwu or ñwi, written whole even before a vowel (ñw' is rare) - never with plain n (nwi, nw).",
      );
      return out;
    },
  },
  {
    // NUM: the closed set of number-agreeing verbs; nothing for person.
    // TONE: àmì -> ami (the mark distinguishes nothing in the prompt).
    find: "du = take one, kó = take many.",
    replaceLine: (l) =>
      swap(l, "Plural àmì/abọ", "Plural ami/abọ") +
      " Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru (put in), gwugwu/jọ (sit); every other verb keeps one form; none changes for person.",
  },
  {
    // COMP: every ki needs a job, listed once.
    find: "Verbs chain with kẹ",
    replaceLine: (l) =>
      swap(
        l,
        "kẹ links verbs; kì/ki starts a new clause - never swap them.",
        "kẹ links verbs only. Every ki needs a job: after a noun, who or which (ku before ma/mẹ; ku is also ki + u); before a verb, may or must-not; after tọdu or (i)chẹñwu, ki or ku; after say, tell, know or want, the linker kakini or ka ki ni, never dropped. A ki with no such job is wrong: start a new sentence.",
      ),
  },
  {
    // INC: the incompletive fuses or takes an apostrophe.
    find: "Igala has no hyphenated prefixes",
    replaceLine: (l) =>
      swap(
        l,
        "The incompletive is the standalone word á;",
        "The incompletive á is fused to its verb (alọ) or written a' (a'jẹñwu), never a word on its own;",
      ),
  },
  {
    // ELI, NEG, TONE, POSS in REGISTER.
    find: "Write like the community, not scripture:",
    replaceLine: (l) => {
      let out = swap(l, "apostrophized elision", "optional elision");
      out = swap(
        out,
        "no tone marks unless the question asks for them,",
        "no tone marks unless the question asks for them (dictionary and example forms give the letters; leave their marks off),",
      );
      out = swap(
        out,
        "negative nasal written ñ.",
        "the negative nasal at the clause end.",
      );
      out = swap(
        out,
        "never end a word in -wñ.",
        "never chẹwñ or bẹwñ, but the possessive his/her is ñwu, -wn or -wñ ([mother] wñ).",
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

let cached: string | null = null;

/**
 * The rag-v4-5 system prompt, built on first use and memoized. A failed
 * edit throws here, inside the one request that needs this prompt, never
 * at module import.
 */
export function igalaSystemV45(): string {
  if (cached === null) cached = applyEdits(IGALA_SYSTEM_V4_4);
  return cached;
}
