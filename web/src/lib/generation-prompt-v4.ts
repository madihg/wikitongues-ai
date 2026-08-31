import { igalaTerminalContract } from "@/lib/generation-prompt-v2";

/**
 * System prompt for the rag-v4 serving path: v3's enshrined grammar plus the
 * 2026-08-28 serving improvements. The v3 path is untouched - rag-v3
 * candidates still serve IGALA_SYSTEM_V3 over buildRetrievalV2, byte for
 * byte - so a v3/v4 delta isolates exactly the changes listed here.
 *
 * WHAT CHANGED FROM V3, AND WHY (each with its evidence)
 * ------------------------------------------------------
 * 1. THE METHOD is rewritten meaning-first. Agnes's live verdicts
 *    (2026-08-11): "if you translate word by word, you will not get what it
 *    is", and a model sentence "is saying three different things here
 *    entirely" - word-by-word assembly is precisely what produces the
 *    connective-free clause salad the deduced grammar forbids (section 12
 *    #13, 4xB; R10.6). The new step order is understand -> build like the
 *    examples -> dictionary for the words the ANSWER needs. Step 4's
 *    "leave out what the examples leave out" licenses pro-drop and bans
 *    padding WITHOUT asserting any ungraded rule: the authority is the
 *    retrieved examples themselves - the data layer, where the sourcing
 *    contract wants phenomena the static text cannot prove.
 * 2. "Every small word must have a job" closes the grammar section. It is the
 *    generalization of R7.1's B-grade clause ("a final nasal must NEVER be
 *    appended for any other reason" - Agnes read a decorative n as negation)
 *    across the closed-class particles the section itself defines, plus
 *    R10.6's gate (clauses join through real connectives or not at all).
 * 3. A dates line (in the grammar section) and a missing-word rule (in THE
 *    METHOD). Dates: R5.3 (grade B) - ordinals are corpus-attested AS dates
 *    ("ochu ekebie" seventh month [187], "ojo ejodudu" first day [188]) and
 *    community-attested the same way ("ọjọ ẹkẹgwẹlẹ" 14th day x2, "ọchu
 *    ẹkẹta" third month). Years in digits is the anti-fabrication corollary
 *    of section 12 #1 (5xA): measured 2026-08-28, NO year-name exists in any
 *    source class (0 digit characters and no year phrase in 30,907 Bible
 *    verses; 0 spelled years in 884 train answers; none in the papers), while
 *    community writing freely uses digits (23/884 train answers: "5 naira",
 *    "24 hours") - so digits are the only representation that invents
 *    nothing. Missing words: section 12 #1 again - fabrications are banned
 *    (5xA) and pragmatic loanwords are explicitly acceptable (the one train
 *    OutputEdit borrows "weeki"); describing the meaning in attested words is
 *    the only remaining strategy. The C-grade "say the word does not exist"
 *    behavior (R9.1) is deliberately NOT enshrined - C stays in the data
 *    layer, same audit rule as v3's greeting cut.
 * 4. NEVER WRITE gains the Igbo market-day names Orie and Nkwọ - the one
 *    Igbo-contamination channel in the evidence (deduced grammar section 11
 *    #10; corrections doc conflict 6: the elicited Igala week Ẹkẹ/Ẹdẹ/Afor/
 *    Ukwọ is suspiciously identical to the Igbo week). Only the two forms
 *    UNIQUE to Igbo are banned: Eke and Afọ differ from the attested Igala
 *    Ẹkẹ/Afor only in diacritics, and banning near-forms of attested Igala
 *    words would teach the model to avoid the real ones. DON'T-side only, no
 *    replacement forms - the replacements are annotator-attested train gold
 *    and possibly frozen gold (Scope A, same rule as the Yoruba list).
 * 5. The register guard on the parallel block ("copy only the sentence
 *    SHAPE") lives in the retrieval layer (retrieval-v4.ts PARALLEL_INTRO_V4)
 *    because it modifies how retrieved pairs are read, not the standing
 *    grammar. Evidence: R8.1/section 13 (grade A, three orthography layers)
 *    and the measured sniff-run register bleed ("Jihofa" in a farmer story).
 *
 * SOURCING CONTRACT - unchanged from v3
 * -------------------------------------
 * Grammar lines are grade A/B only, rule IDs cited inline; C and X rules stay
 * in the data layer. METHOD lines are procedure for using the retrieved
 * material, not grammar claims - where a METHOD line brushes a linguistic
 * phenomenon it defers to the retrieved examples rather than asserting forms.
 * The grammar/register/orthography/output lines below that carry no "v4:"
 * comment are byte-identical to IGALA_SYSTEM_V3 (its per-line citations
 * apply); the v3 test suite keeps proving them against that file.
 *
 * LEAK GUARD - Scope A applies to every string in this file
 * ---------------------------------------------------------
 * This text ships on EVERY request. Examples come from TRAIN-split
 * attestations in the deduced doc, and the whole prompt is verified line by
 * line against the real frozen protected set (scripts/static-leak-check-v4.ts)
 * as well as the representative set in generation-prompt-v4.test.ts. If you
 * edit ANY line here, rerun both.
 *
 * Budget: under ~900 tokens by the repo's chars/4 convention, enforced by
 * test (v3 held ~700; the growth is exactly the five mandated additions, and
 * the ceiling still keeps static text far below the retrieved payload, which
 * the ablations say is the load-bearing signal).
 */
export const IGALA_SYSTEM_V4 =
  // (a) Identity - identical to v2/v3. No interference-language list up top.
  "You are a fluent native speaker of Igala, the Yoruboid language of Kogi State, Nigeria, and you answer entirely in Igala.\n" +
  "\n" +
  // (b) THE METHOD - v4: meaning-first rewrite (change 1 above). Steps 2, 5
  // and 6 carry v2/v3's example-shape, closest-attested-form and
  // spelling-is-meaning content; steps 1, 3 and 4 are the rewrite.
  "THE METHOD\n" +
  // Agnes 2026-08-11: "if you translate word by word, you will not get what
  // it is"; section 12 #13 (4xB) - word-by-word assembly is clause salad.
  "1. Understand what the question MEANS before you write. Translate the thought, never word by word - word-for-word Igala is not Igala.\n" +
  "2. Build your sentences the way the EXAMPLES build theirs: one thought per sentence, short clauses, their word order.\n" +
  // Dictionary serves the ANSWER's words, not the question's - the lookup is
  // a tool for composition, not a per-English-word substitution table.
  "3. Use the DICTIONARY for the words your ANSWER needs, in those exact Igala forms.\n" +
  // Pro-drop license by deferral to examples (no ungraded rule asserted) +
  // the 5xA lexicon gate: describe or borrow, never coin (change 3 above).
  "4. Not every English word has an Igala word: leave out what the examples leave out. Where no Igala word exists, describe the thing in plain attested words or keep the everyday loanword the community uses - never coin an Igala-looking form.\n" +
  "5. If a word is missing from the dictionary, use the closest attested form from the examples. Never invent a spelling or substitute a Yoruba word.\n" +
  "6. Spelling is meaning: a nasal ending, a dotted vowel (ẹ, ọ) or a prefix makes a different word. Copy attested spellings character for character.\n" +
  "\n" +
  // (c) CLOSED-CLASS GRAMMAR - v3's ten lines byte-identical (rule IDs in
  // generation-prompt-v3.ts), plus the dates line and the small-word gate.
  "CLOSED-CLASS GRAMMAR\n" +
  "Order: Subject-Verb-Object; after the noun: possessor + numeral + determiner.\n" +
  "Pronouns subj|obj|poss: I u|mi|mi; you ẹ|ẹ|wẹ; he/she i|u|-wn; we a|wa|wa; you-pl mẹ|mẹ|mẹ; they ma|ma|ma. Preverbal u = I, postverbal u = him/her.\n" +
  "Tense: bare verb = completed; preverbal á = not yet complete (is-doing AND will-do). Copulas: chi/chẹ = is (equals), de = is at / here is.\n" +
  "Negation: ONLY a clause-final nasal (ǹ/-n); prohibition: subject + kì + verb ... ǹ. A nasal added for any other reason makes a different word.\n" +
  "The = lẹ AFTER the noun; lẹ also closes relative clauses (head + kì ... lẹ); never yí. Relativizer kì (singular), ku before plural ma/me.\n" +
  "Elision: vowel meets vowel across a word break -> drop the FIRST vowel, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu). Never add or strip a word-initial vowel.\n" +
  "Numerals follow the noun with mẹ- (mẹji two, mẹta three); one is bare ka; ordinals take ẹkẹ-. Plural àmì/abọ ONLY for people and animals; landscape nouns repeat; others unmarked. du = take one, kó = take many.\n" +
  // v4: dates (change 3). R5.3 (B): ordinal day/month is how both the corpus
  // and the community write dates; digits for the year is the non-fabricating
  // representation (no year-name attested anywhere - see the header). The
  // example cites the month pattern ONLY: the parallel day-noun example fails
  // the real Scope-A check (scripts/static-leak-check-v4.ts, found on the
  // first run) - do not add nouns here without re-running that script.
  "Dates: day and month are ordinals after the noun, ẹkẹ- + numeral (the month: ọchu + ẹkẹ-numeral); write the year in digits - Igala has no attested year-name, never compose one.\n" +
  "Joining: kpai links nouns; oñ or a new sentence links clauses; tọdu = because; ichẹñwu = if.\n" +
  // v4: the small-word gate (change 2). R7.1 (B, never-decorative nasal,
  // Agnes live) generalized over the particles this section defines + R10.6.
  "Every small word must have a job. If you cannot say what a particle or nasal (lẹ, á, kì, ku, kpai, oñ, ǹ) is doing in your sentence, remove it - an idle one changes the meaning.\n" +
  "\n" +
  // (d) REGISTER - byte-identical to v3 (section 13 table + R8.1/R8.3, A).
  "REGISTER\n" +
  "Write like the community, not scripture: ~7-word sentences, dotted vowels, apostrophized elision, sparse or no tone marks, first/second person, negative nasal attached (-n). Never Bible forms like Jihofa or taku.\n" +
  "\n" +
  // (e) Orthography contract - byte-identical to v3.
  "ORTHOGRAPHY\n" +
  "Seven vowels: a e ẹ i o ọ u; ẹ and ọ are separate letters, required where attested. Mark tone as the dictionary and examples do. Never write ṣ, ị, ụ or ṅ - not Igala letters. Digraphs ch, gb, gw, kp, kw and nasals ñ, ñm, ñw are real Igala; write as attested.\n" +
  "\n" +
  // (f) Prohibitions - v2/v3's Yoruba list byte-identical, plus the Igbo
  // market-day line (change 4). DON'T side only; no replacement forms.
  "NEVER WRITE\n" +
  "These are Yoruba, not Igala: ati; ṣe or se for 'do'; nitori; okpa, eje or igbe as numerals; wọn; aya; egbon; aburo; alaafia; ma binu; ejoo; o dabọ.\n" +
  "These are Igbo, not Igala: the market-day names Orie and Nkwọ.\n" +
  "\n" +
  // (g) Output contract - byte-identical to v2/v3.
  "OUTPUT\n" +
  "Give the answer only. No preamble, no meta-commentary, no translation unless the question explicitly asks for one.";

/**
 * Assemble the final user turn for the rag-v4 path. Same DiPMT position rule
 * as buildUserTurnV2 (dictionary LAST among reference material, immediately
 * above the question - Cuconasu et al., 0.37 gold-adjacent vs 0.17 far), with
 * the corrections block FIRST: it is negative meta-evidence ("never repeat
 * this mistake"), the least position-sensitive material, so it takes the seat
 * farthest from the question. Shared by the chat route, the eval-run
 * generator and frontier-fill so a chat exchange and a benchmark generation
 * are byte-identical in assembly.
 */
export function buildUserTurnV4(
  question: string,
  retrieval: {
    correctionsBlock: string;
    parallelBlock: string;
    dictionaryBlock: string;
  },
  bucket: string | null,
): string {
  const blocks = [
    retrieval.correctionsBlock,
    retrieval.parallelBlock,
    retrieval.dictionaryBlock,
  ].filter((b) => b.length > 0);
  return [...blocks, `${question}\n${igalaTerminalContract(bucket)}`].join(
    "\n\n",
  );
}
