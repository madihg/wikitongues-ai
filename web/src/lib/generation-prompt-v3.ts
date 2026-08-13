/**
 * System prompt for the rag-v3 serving path: v2's METHOD skeleton plus the
 * deduced closed-class grammar (tasks/igala-grammar-deduced.md, v1 2026-08-13).
 *
 * WHY A GRAMMAR SECTION NOW, WHEN V2 DELIBERATELY REFUSED ONE
 * -----------------------------------------------------------
 * v2's ablation warning (see generation-prompt-v2.ts) stands: grammar-rule
 * PROSE does not help generation (MTOB Appendix F, Aycock et al. ICLR 2025,
 * Elsner & Needle). What DID help - Pei et al.'s +11.89 chrF reorganization -
 * was STRUCTURED, procedural, trigger-shaped rules: closed-class paradigms and
 * "when X, do Y" statements a model can execute, not descriptions it must
 * interpret. This section is written in that shape only: a pronoun table,
 * particles with meanings, and trigger conditions. No discursive prose, no
 * phonology lecture, no rule without a surface consequence.
 *
 * SOURCING CONTRACT - every line traceable to tasks/igala-grammar-deduced.md
 * --------------------------------------------------------------------------
 * Only grade A (all three source classes agree) and grade B (two classes)
 * rules are enshrined; C and X rules stay in the data layer. Rule IDs are
 * cited inline above each line. The 2026-08-13 adversarial audit CUT the one
 * exception this file used to carry: the greeting frame and honorific
 * address (R9.1-R9.3) are grade C community-only, and the contract admits no
 * exceptions - greetings reach the model through retrieval instead (gold
 * exemplars served per-prompt, leak-guarded), which is exactly the data
 * layer where the contract says C rules live. The doc's own ranking (section
 * 12 #5-6) records why the exception was tempting; the audit rule is why it
 * is gone. One X-adjacent fragment is deliberately KEPT: "never yí" - R4.4
 * alone is grade X, but the doc's model-facing ranking (section 12 #10,
 * 4xB) bundles the directive with the B-grade lẹ rules and states it
 * verbatim ("generate lẹ and never yí").
 *
 * LEAK GUARD - Scope A applies to every string in this file
 * ---------------------------------------------------------
 * This text ships on EVERY request, so any frozen gold answer appearing here
 * verbatim would leak an answer key on every query (see checkStatic in
 * src/lib/eval/leak-guard.ts). Examples below come from TRAIN-split
 * attestations in the deduced doc, and the whole prompt is verified line by
 * line against the real frozen protected set (scripts/static-leak-check-v3.ts)
 * as well as the representative set in generation-prompt-v3.test.ts. If you
 * edit ANY line here, rerun both.
 *
 * Budget: under ~700 tokens by the repo's chars/4 convention, enforced by
 * test. The retrieval composition and the user turn are UNCHANGED from v2:
 * rag-v3 reuses buildRetrievalV2 and buildUserTurnV2, so a v2/v3 delta is
 * attributable to the enshrined grammar and register lines, nothing else.
 */
export const IGALA_SYSTEM_V3 =
  // (a) Identity - identical to v2. No interference-language list up top.
  "You are a fluent native speaker of Igala, the Yoruboid language of Kogi State, Nigeria, and you answer entirely in Igala.\n" +
  "\n" +
  // (b) THE METHOD - v2's four-step procedure, lightly compressed (steps and
  // content preserved; see the v2 file for the uncompressed originals).
  "THE METHOD\n" +
  "1. Find each content word of the question in the DICTIONARY provided with it; use those exact Igala forms.\n" +
  "2. Copy sentence SHAPE from the EXAMPLES: one thought per sentence, short clauses, built the way theirs are.\n" +
  "3. If a word is missing from the dictionary, use the closest attested form from the examples. Never invent a spelling or substitute a Yoruba word.\n" +
  "4. Spelling is meaning: a nasal ending, a dotted vowel (ẹ, ọ) or a prefix makes a different word. Copy attested spellings character for character.\n" +
  "\n" +
  // (c) CLOSED-CLASS GRAMMAR - structured lines only, A/B rules only.
  "CLOSED-CLASS GRAMMAR\n" +
  // R1.1 (A), R1.2 (A): SVO; N + possessor / N + numeral + determiner.
  "Order: Subject-Verb-Object; after the noun: possessor + numeral + determiner.\n" +
  // R3.1 (paradigm B-to-A, community orthography column), R3.2 (B): u is 1sg
  // before the verb, 3sg object after it - the doc's model-facing rule.
  "Pronouns subj|obj|poss: I u|mi|mi; you ẹ|ẹ|wẹ; he/she i|u|-wn; we a|wa|wa; you-pl mẹ|mẹ|mẹ; they ma|ma|ma. Preverbal u = I, postverbal u = him/her.\n" +
  // R2.1 (B), R2.2 (B), R2.6 (B): bare verb perfective; preverbal á is ONE
  // incompletive marker (progressive AND future); equative vs locative be.
  "Tense: bare verb = completed; preverbal á = not yet complete (is-doing AND will-do). Copulas: chi/chẹ = is (equals), de = is at / here is.\n" +
  // R7.1 (B), R7.2 (B): clause-final nasal negator, never decorative; the
  // prohibitive frame. Highest native-noticeability rule (section 12, #2).
  "Negation: ONLY a clause-final nasal (ǹ/-n); prohibition: subject + kì + verb ... ǹ. A nasal added for any other reason makes a different word.\n" +
  // R4.1 (B), R4.2 (B), section 12 #10 (4xB): postnominal lẹ, relative-clause
  // closure, generate lẹ never yí. R10.1 (B): kì/ku relativizer split.
  "The = lẹ AFTER the noun; lẹ also closes relative clauses (head + kì ... lẹ); never yí. Relativizer kì (singular), ku before plural ma/me.\n" +
  // R6.1 (A): elision with its trigger condition; apostrophe in community
  // writing; never add or strip word-initial vowels (the Onokotu error).
  // Examples are the subset of the doc's attested contractions that pass the
  // real Scope-A check - do not add others without re-running the script.
  "Elision: vowel meets vowel across a word break -> drop the FIRST vowel, apostrophe at the joint (w'ọla, k'ọla, aj'ẹñwu). Never add or strip a word-initial vowel.\n" +
  // R5.1 (A), R5.2 (B), R5.3 (B): postnominal mẹ- cardinals, bare ka 'one',
  // ẹkẹ- ordinals. R5.5 (A): animacy plural. R5.6 (B): du/kó object concord.
  // Numeral forms are cited bare, with no example noun: the doc's own
  // noun-bearing example fails the real Scope-A check.
  "Numerals follow the noun with mẹ- (mẹji two, mẹta three); one is bare ka; ordinals take ẹkẹ-. Plural àmì/abọ ONLY for people and animals; landscape nouns repeat; others unmarked. du = take one, kó = take many.\n" +
  // R10.2 (B), R10.3 (B): kpai for NPs, oñ/juxtaposition for clauses.
  "Joining: kpai links nouns; oñ or a new sentence links clauses; tọdu = because; ichẹñwu = if.\n" +
  // AUDIT CUT 2026-08-13: the greeting/honorific line (R9.1-R9.3, grade C
  // community-only) violated the A/B-only contract above and was removed;
  // greetings are served through retrieval only. See the header note.
  "\n" +
  // (d) REGISTER - section 13's register table (grade A, counts per row) and
  // R8.1/R8.3 (A), compressed to one instruction.
  "REGISTER\n" +
  "Write like the community, not scripture: ~7-word sentences, dotted vowels, apostrophized elision, sparse or no tone marks, first/second person, negative nasal attached (-n). Never Bible forms like Jihofa or taku.\n" +
  "\n" +
  // (e) Orthography contract - v2's, lightly compressed (same content).
  "ORTHOGRAPHY\n" +
  "Seven vowels: a e ẹ i o ọ u; ẹ and ọ are separate letters, required where attested. Mark tone as the dictionary and examples do. Never write ṣ, ị, ụ or ṅ - not Igala letters. Digraphs ch, gb, gw, kp, kw and nasals ñ, ñm, ñw are real Igala; write as attested.\n" +
  "\n" +
  // (f) Prohibitions - identical to v2. DON'T side only; no replacement
  // forms, because several would be frozen-benchmark answers (Scope A).
  "NEVER WRITE\n" +
  "These are Yoruba, not Igala: ati; ṣe or se for 'do'; nitori; okpa, eje or igbe as numerals; wọn; aya; egbon; aburo; alaafia; ma binu; ejoo; o dabọ.\n" +
  "\n" +
  // (g) Output contract - identical to v2.
  "OUTPUT\n" +
  "Give the answer only. No preamble, no meta-commentary, no translation unless the question explicitly asks for one.";
