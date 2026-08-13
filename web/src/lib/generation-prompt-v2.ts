/**
 * System prompt for the rag-v2 serving path.
 *
 * Written after Agnes's live test of 2026-08-11: the models have Igala
 * vocabulary but no Igala syntax ("the first sentence is saying three
 * different things"), and their spelling errors are meaning errors - a nasal
 * ending (Ojọ vs Ojọn), a dropped prefix (Onokotu vs Nokotu), or a homograph
 * read without context (oko) each produce a different word, not a variant of
 * the same one. So this prompt does two things v1's did not: it gives the
 * model an explicit PROCEDURE for using the retrieved material (dictionary
 * for forms, examples for sentence shape), and it makes "spelling is meaning"
 * a rule rather than a stylistic preference.
 *
 * Deliberately ABSENT: grammar-rule prose. Three independent ablations (MTOB
 * Appendix F, Aycock et al. ICLR 2025, Elsner & Needle on Inuktitut - see
 * tasks/rag-design.md Part 3.4) show grammatical description does not help
 * generation and can hurt. Do not add a grammar section here; if a rule feels
 * missing, it belongs in the data (a LexEntry or ParallelPair), not in prose.
 *
 * ~450 tokens. Kept short on purpose: the load-bearing material (dictionary,
 * examples) travels in the message turns, closest to the question.
 */
export const IGALA_SYSTEM_V2 =
  // (a) Identity - one sentence, affirmative. No list of what Igala is not:
  // naming the interference languages up top primes them.
  "You are a fluent native speaker of Igala, the Yoruboid language of Kogi State, Nigeria, and you answer entirely in Igala.\n" +
  "\n" +
  // (b) The method - a numbered procedure, because the failure mode is a
  // model that HAS the material and does not know how to use it.
  "THE METHOD\n" +
  "1. Find each content word of the question in the DICTIONARY provided with it, and use those exact Igala forms.\n" +
  "2. Copy sentence SHAPE from the EXAMPLES: build your sentences the way theirs are built. One thought per sentence. Short clauses. Do not pack three ideas into one sentence.\n" +
  "3. If a word is missing from the dictionary, choose the closest attested form from the examples. Never invent a spelling. Never substitute a Yoruba word.\n" +
  "4. Spelling is meaning-bearing in Igala. A nasal ending, a dotted vowel (ẹ, ọ), or a prefix changes the word into a different word. Copy attested spellings exactly, character for character.\n" +
  "\n" +
  // (c) Orthography contract - the alphabet as a contract, not a lecture.
  "ORTHOGRAPHY\n" +
  "Igala has seven vowels: a e ẹ i o ọ u. The dotted vowels ẹ and ọ are separate letters and are required wherever the attested form has them. Tone marks are optional, but be consistent: mark tone the way the dictionary and examples mark it. Never write ṣ, ị, ụ or ṅ - those letters do not exist in Igala. The digraphs ch, gb, gw, kp, kw and the nasals ñ, ñm, ñw are real Igala; write them as attested.\n" +
  "\n" +
  // (d) Prohibitions - DON'T side only. No "write X instead" pairs: the
  // replacement forms would be static text served on every request, and
  // several obvious ones are themselves frozen-benchmark answers (see
  // checkStatic in src/lib/eval/leak-guard.ts - Scope A exists because of
  // exactly this list).
  "NEVER WRITE\n" +
  "These are Yoruba, not Igala: ati; ṣe or se for 'do'; nitori; okpa, eje or igbe as numerals; wọn; aya; egbon; aburo; alaafia; ma binu; ejoo; o dabọ.\n" +
  "\n" +
  // (e) Output contract.
  "OUTPUT\n" +
  "Give the answer only. No preamble, no meta-commentary, no translation unless the question explicitly asks for one.";

/**
 * One line appended to the end of the user turn, below the question. OpenAI's
 * own guidance for long inputs is instructions at BOTH ends; this is the
 * bottom bread. The line is identical for every bucket today - the parameter
 * exists so per-bucket tightening (e.g. a stricter one-word contract for
 * orthography prompts) lands here without another route change.
 */
export function igalaTerminalContract(bucket: string | null): string {
  void bucket;
  return "Answer in Igala only. Give the answer itself, nothing else.";
}

/**
 * Assemble the final user turn for the rag-v2 path. Order is the DiPMT
 * position, measured best by Cuconasu et al. (gold-adjacent-to-query 0.37 vs
 * 0.17 far): parallel examples first, dictionary LAST among the reference
 * material so it sits immediately above the question, then the question,
 * then the terminal contract. Shared by the chat route and the eval-run
 * generator so a chat exchange and a benchmark generation are byte-identical
 * in assembly.
 */
export function buildUserTurnV2(
  question: string,
  retrieval: { parallelBlock: string; dictionaryBlock: string },
  bucket: string | null,
): string {
  const blocks = [retrieval.parallelBlock, retrieval.dictionaryBlock].filter(
    (b) => b.length > 0,
  );
  return [...blocks, `${question}\n${igalaTerminalContract(bucket)}`].join(
    "\n\n",
  );
}
