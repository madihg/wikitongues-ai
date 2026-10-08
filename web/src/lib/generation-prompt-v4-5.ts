import { IGALA_SYSTEM_V4_4 } from "./generation-prompt-v4-4";

/**
 * System prompt for the rag-v4-5 serving path: IGALA_SYSTEM_V4_4 with
 * fourteen lines amended. The amendments trace to the Salem Ejeba and Lydia
 * Wiernik write-up of 2026-09-25 ("Igala grammar writeup: Patching the holes
 * in the model"), diffed against what we serve in
 * tasks/salem-lydia-writeup-2026-09-25-inventory.md, with Halim's decisions
 * of 2026-10-08 (tasks/prd-salem-writeup-ingest-2026-10-08.md); to the read
 * of v4.4's 249 unjudged train answers against the speakers' gold; and to
 * two review rounds of the same day, every claim re-counted before it
 * landed. Retrieval, the repair round and the name check are v4.4's. Three
 * things differ besides these lines, all for rag-v4-5 only: the grammar
 * block also reads the v4.5 rows (prisma/seed-rag-v4-5-grammar.ts, chunkType
 * grammar_rule_v4_5, plus grammar_rule_v4_5_tone when the question asks for
 * tone); the dictionary block loses its tone accents unless the question
 * asks for tone (buildV4FamilyTurn); and nothing else reads those rows
 * (src/lib/arena/grammar-chunk-types.ts, src/lib/rag.ts).
 *
 * Bar for a prompt line, unchanged: two evidence classes (grade B) or three
 * (A), or a correction of a form the prompt itself asserts. The write-up and
 * Ejeba (2023) count as ONE class; the Bible corpus and the community's
 * corrections and gold are the other two. Every rule is restated; no
 * sentence of the write-up appears. Gold counts are over the 1,446 gold
 * answers of the Oct 8 review export; corpus counts are ParallelPair rows.
 *
 *  COMP Every ki needs a job, listed once (W-3.2-1, W-3.2-3, W-3.2-13),
 *       with its fusions stated once (ku = ki + u, kẹ = ki + ẹ): relativizer
 *       after a noun (ku before ma/mẹ); may or must-not before a verb, a
 *       blessing usually one may-clause (7 of 50 gold answers on blessing
 *       prompts string more, annotators 4, 5, 8); ki or ku after tọdu and
 *       (i)chẹñwu (gold 21 and 30; corpus todu ku/ki 202/272, (i)chewñ
 *       ku/ki 264/229 bigrams); ka ki or kaki = when, while before a clause
 *       of time ('we were farming when the rain started': annotators 4, 5,
 *       7); kakini, ka ki ni or kaki after say, tell or know ('had we
 *       known', ig_bank_gram_031: 8 gold answers, 6 annotators), never
 *       dropped; after want, ki + the subject (after tẹnẹ: a ki-word 18
 *       times from 5 annotators, ka ki ni 3 times on one prompt; served row
 *       5deb2dc1 writes na tẹnẹ ku kà). (kẹ mọ kaki on ig_bank_auth_007 is
 *       'drink while', not 'know that'; the know evidence is gram_031.) The measured
 *       excess (a standalone ki in 31% of v4.4 answers against 15.5% of
 *       speakers') is density, not jobless ki: no v4.4 sentence opens with
 *       ki, and the words before its standalone ki are listed jobs ([God] 27,
 *       the blessing; ichẹñwu 22; ka 19; ẹnẹ 15; tọdu 11). Speakers bless in
 *       one clause (evidence-full, authenticity 5), hence "usually one
 *       may-clause". The joining line separates clauses in sequence (side
 *       by side or two sentences, never oñ: on 'the king spoke and the
 *       people listened' no speaker starts a new sentence) from a clause
 *       inside another (keeps its linker),
 *       and lẹ MAY close a relative clause (31 gold relatives do; on two
 *       prompts with 14 gold answers none does). No toned kí: gold writes
 *       kakini for 'that', kí 22 times (19 by one annotator), never opening
 *       a that-clause.
 *  KI   ki untoned everywhere in the prompt (negation, relative, gate): gold
 *       ki 461, kì 139 (133 by one annotator), kí 22; with kí gone the mark
 *       distinguishes nothing.
 *  NUM  Number guard (W-3.1-2, W-3.1-3, W-3.1-10): du/kó (take), tinyo/rinyo
 *       (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru (put in); none for
 *       person. Glosses per row 42657b2c, deduced R5.6 and scholarship 1.3.
 *       Corpus: du/kó 137/77, tinyo/rinyo 356/761, no person-inflected verb.
 *       Sit is not listed: gwugwu (11 gold, 3 annotators) has one plural jọ
 *       token beside it, and the commoner gwanẹ (9 gold, 4 annotators) takes
 *       a plural subject unchanged; row 2 records gwugwu as data.
 *  VAR  One form per word (W-4-2, W-4-3; Halim's decision of 2026-10-08),
 *       as something the model can check: the references are not all
 *       Central (170 gold answers are tagged ankpa, and example turns carry
 *       no dialect), so where they give two area forms for one word the
 *       model uses one, unless asked to compare, and when asked says it
 *       aims to follow Central (Idah) usage: an aim, since the references
 *       carry no dialect labels; Idah is named because Halim's decision
 *       names it. No Ibaji or
 *       Ogwugwu form is asserted (the ra ban stands).
 *  ELI  Elision is optional (contradiction 3: gold contracts in 32.4% of
 *       answers); "never add or strip a word-initial vowel" stays (grade A).
 *       'to/for' is ñwu or ñwi, ñwi mostly before a vowel (63 of 67); 'to
 *       you' is ñwu wẹ (5 gold) or ñwẹ (served row 5deb2dc1), never ñwi ẹ
 *       (0 gold); ñw' is rare (5). The ban on plain n is withdrawn: gold writes
 *       nwu 45, nwi 12, nw' 2, and the write-up treats nw and ñw as one word
 *       spelled two ways. The efu clause is v4.4's (speakers write ef'
 *       before a vowel; the served v4.3 locative row writes ef'ọdọ).
 *  NEG  One nasal at the end of the clause, spelled as speakers spell it:
 *       free-standing ñ 48 (5 annotators), -n 51 (3), 'ñ 27 (5), free n 26
 *       (4), fused 20 (4). Never the Yoruba prohibitive má;
 *       preverbal ma (they; the
 *       why-not frame) is left alone.
 *  INC  The incompletive stands before its verb, apart, fused or with an
 *       apostrophe: on 'the child eats food' (ig_gram_001) 15 of 24 gold
 *       answers write it apart (annotators 3, 4, 5), on 'the child is
 *       eating' (ig_bank_gram_028) 2 of 7, and the export has 17 toned
 *       standalone á; fused alọ, apostrophe a'loti (both train prompts).
 *       v4.4's "the standalone word á" is replaced, and so is the first
 *       draft's "never a word on its own".
 *  POSS The -wñ ban names forms: never chẹwñ (v4.4's invention) or bẹwñ
 *       (corrected); the possessive his/her is ñwu, -wn or wñ after the
 *       noun (ọlawn, annotator_8, a train prompt), and ewñ 'what' feeds a
 *       served why-frame. No frozen-gold shape is used as the example.
 *  TONE No tone exception line: tone marks stay off unless asked, METHOD 6
 *       says so beside "copy attested letters", and METHOD 3 asks for the
 *       dictionary's letters, not its forms (the dictionary arrives toned
 *       and told the model to copy it exactly, the likeliest reason v4.4
 *       toned 69% of its answers). àmì becomes ami; á keeps its mark (it is
 *       what tells it from a = we), as do kó and yí. The kí/kì contrast is
 *       a row gated in code to tone questions; jọ/jọ̀ is a note.
 *  TRIM ORTHOGRAPHY drops the vowel list and the digraph sentence (the
 *       allowlist enumerates both) and "Mark tone as the dictionary and
 *       examples do"; METHOD 1 drops its restated tail.
 *
 * NOT changed, on purpose: the presentative yì, hyphenated àma- and the
 * compound idioms, ìpọ́lú for Paul, the negator spelling ń, pronoun doubling
 * (inventory contradictions 4 to 9); the factive/non-factive kí/kì reading;
 * the register-weight ask.
 *
 * The blessing subject is written [God] on the COMP line and in the
 * linkers row: spelled out, it is the whole gold answer of a frozen prompt
 * (the Scope-A check caught it, as it did for v4.1's negation line).
 *
 * FOR v4.6: the NEVER list bans forms speakers write (abẹki 'or' in nine
 * gold answers, ojoji, gbede, ati 'until'): verify each with speakers;
 * and the elision line still frames dropping the FIRST vowel as the rule
 * where gold also elides other ways.
 *
 * The static Scope-A check
 * (scripts/static-leak-check-v4-5.ts) runs before this prompt serves.
 *
 * Token ceiling 1,650 (v4.4 sat at 1,473 of 1,500), pinned in the test.
 * The next version pays for its lines by cutting a rule.
 *
 * Built on first use, not at import (igalaSystemV45): if a v4.4 line ever
 * stops matching an edit, only a rag-v4-5 request fails.
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
    // TRIM (METHOD 1).
    find: "1. Understand what the question MEANS before you write.",
    replaceLine: (l) =>
      swap(
        l,
        "Translate the thought, never word by word - word-for-word Igala is not Igala.",
        "Translate the thought, never word by word.",
      ),
  },
  {
    // TONE (METHOD 3): the dictionary gives letters.
    find: "3. Use the DICTIONARY for the words your ANSWER needs",
    replaceLine: (l) =>
      swap(l, "in those exact Igala forms.", "in those exact letters."),
  },
  {
    // TONE (METHOD 6): copy letters; tone marks off unless asked.
    find: "6. Spelling is meaning:",
    replaceLine: (l) =>
      swap(
        l,
        "Copy attested spellings character for character.",
        "Copy attested letters exactly; tone marks stay off unless asked.",
      ),
  },
  {
    // VAR: one form per word, checkable against the references.
    find: "8. Never assert which town or area uses a form",
    replaceLine: (l) =>
      swap(
        l,
        "8. Never assert",
        "8. Keep one form of each word per answer: where your references give two area forms, use one unless asked to compare; if asked, say you aim to follow Central (Idah) usage. Never assert",
      ),
  },
  {
    // NEG + KI.
    find: "Negation: ONLY a clause-final nasal",
    replaceLine: (l) => {
      let out = swap(
        l,
        "Negation: ONLY a clause-final nasal, written ñ; prohibition: subject + kì + verb ... ñ.",
        "Negation: ONE nasal at the end of the clause (ñ, n, -n or 'ñ), never the Yoruba prohibitive má; prohibition: subject + ki + verb ... ñ.",
      );
      out = swap(out, "Subject + kì + verb WITHOUT", "Subject + ki + verb WITHOUT");
      return out;
    },
  },
  {
    // COMP + KI: lẹ MAY close; the relativizer list moves to the kẹ line.
    find: "The = lẹ AFTER the noun;",
    replaceLine: (l) => {
      let out = swap(
        l,
        "lẹ also closes relative clauses (head + kì ... lẹ);",
        "lẹ may also close a relative clause (head + ki ... lẹ);",
      );
      out = swap(out, " Relativizer kì (singular), ku before plural ma/me.", "");
      return out;
    },
  },
  {
    // ELI: optional elision; 'to/for' whole; plain n no longer banned.
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
        "'to/for' is ñwu or ñwi (ñwi mostly before a vowel); 'to you' is ñwu wẹ or ñwẹ; ñw' is rare.",
      );
      return out;
    },
  },
  {
    // NUM + TONE (àmì -> ami).
    find: "du = take one, kó = take many.",
    replaceLine: (l) =>
      swap(l, "Plural àmì/abọ", "Plural ami/abọ") +
      " Only these verbs change for number: du/kó, tinyo/rinyo (throw away), tẹ/jọ (keep, set down), tọ/nyu/ru (put in); every other verb keeps one form; none changes for person.",
  },
  {
    // COMP: clauses in sequence vs a clause inside another; tọdu and
    // ichẹñwu move to the job list on the next line.
    find: "Joining: kpai links nouns",
    replaceLine: (l) =>
      swap(
        l,
        "clauses are joined by a new sentence (oñ is Bible register the community rewrites); tọdu = because; ichẹñwu = if.",
        "clauses in sequence stand side by side or as two sentences, never with oñ; a clause inside another keeps its linker (next line).",
      ),
  },
  {
    // COMP: every ki needs a job, listed once.
    find: "Verbs chain with kẹ",
    replaceLine: (l) =>
      swap(
        l,
        "kẹ links verbs; kì/ki starts a new clause - never swap them.",
        "Every ki needs a job (ku before I, kẹ before you): after a noun, who or which (ku before ma/mẹ); before a verb, may or must-not (a blessing usually one clause: [God] ki + verb + object); after tọdu (because) or (i)chẹñwu (if), ki or ku; for time, ka ki or kaki = when, while; after say, tell or know, kakini, ka ki ni or kaki, never dropped; after want, ki + subject (na tẹnẹ ku kà; na tẹnẹ kẹ wa). Any other ki is wrong: start a new sentence.",
      ),
  },
  {
    // INC: apart, fused or with an apostrophe, right before the verb.
    find: "Igala has no hyphenated prefixes",
    replaceLine: (l) =>
      swap(
        l,
        "The incompletive is the standalone word á;",
        "The incompletive á stands right before its verb: apart (a jẹñwu), fused (alọ) or as a' (a'loti);",
      ),
  },
  {
    // KI: the small-word gate.
    find: "Every small word must have a job.",
    replaceLine: (l) =>
      swap(
        l,
        "(lẹ, á, kì, ku, kpai, oñ, the final ñ)",
        "(lẹ, á, ki, ku, kpai, oñ, the final ñ)",
      ),
  },
  {
    // ELI, NEG, POSS in REGISTER.
    find: "Write like the community, not scripture:",
    replaceLine: (l) => {
      let out = swap(l, "apostrophized elision", "optional elision");
      // The negative nasal is stated on the negation line; REGISTER drops
      // its own spelling of it rather than restating it.
      out = swap(out, ", negative nasal written ñ.", ".");
      out = swap(
        out,
        "never end a word in -wñ.",
        "never chẹwñ or bẹwñ; the possessive his/her is ñwu, -wn or wñ after the noun (ọlawn).",
      );
      return out;
    },
  },
  {
    // TRIM (ORTHOGRAPHY).
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
