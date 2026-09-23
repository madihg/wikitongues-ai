import type { PrismaClient } from "@prisma/client";
import { contentWords } from "@/lib/arena/retrieval-v2";
import {
  buildProtectedSet,
  filterAssembled,
  type LeakReport,
} from "@/lib/eval/leak-guard";
import { fullFold } from "@/lib/eval/normalize";

/**
 * THE GRAMMAR BLOCK - the retrieval leg the v4 family never had.
 *
 * WHY THIS EXISTS. Since 2026-08-13 the store has held grammar_rule rows
 * paraphrased, with attribution, from Ejeba (2023) "Igala Concord System"
 * (JWAL 50) and, since 2026-08-31, the nine RE1-RE9 register rows the v4.1
 * failure analysis specced. Every one of them was leak-gated, embedded and
 * then NEVER SERVED: buildRetrievalV4 reads dictionary, parallel pairs,
 * corrections and gold, and no RagEntry row at all. The v4.1 file header
 * says so in as many words. The formulas family kept failing for exactly
 * that reason, and on 2026-09-23 Halim asked for the paper to be worked
 * line by line into the model. Extracting more rules into the same
 * unreachable rows would have changed nothing; this leg is what makes them
 * reachable.
 *
 * WHAT IT DOES. For one prompt: take the prompt's content words, score every
 * grammar_rule row of the language on how many of those words appear in its
 * topic and content (topic hits weighted higher: the topic names what the
 * row is FOR), keep the best few above a floor, guard them exactly the way
 * every other served piece is guarded on a frozen prompt, and render them as
 * one block with a literal instruction on top. Keyword overlap rather than
 * embeddings, on purpose: the rows number in the tens, the match must be
 * explainable in a test, and pgvector has been unreachable from this path
 * before.
 *
 * WHAT IT DOES NOT DO. It never changes the v4 build: buildRetrievalV4 is
 * untouched, so rag-v4, rag-v4-1 and rag-v4-2 stay byte-identical. The block
 * is assembled beside the v4 result and attached only to the rag-v4-3 turn
 * (frozen-exam.ts), which is how a v4.2 -> v4.3 delta isolates exactly
 * {this block}. The system prompt does not change either.
 *
 * SOURCING CONTRACT. The block asserts no Igala form of its own; every form
 * inside it is a stored row that passed the seed script's Scope-A gate and
 * carries its own source. The intro text is English scaffolding only.
 */

/** How many rules to serve at most. Three keeps the block under the size of
 * one parallel-pairs block; more would crowd the dictionary out of the
 * DiPMT-critical position next to the question. */
export const GRAMMAR_K = 3;
/** Hard cap on the rendered block, in characters. The seeded rows run 1,000
 * to 1,400 characters each (a paradigm with three examples), so 3,200 fits
 * two of them and a short third; 2,200 served one row per question. */
export const MAX_GRAMMAR_CHARS = 3200;
/** A row must clear this score to be served at all. One topic hit or two
 * content hits; a single stray content word is noise. */
export const MIN_GRAMMAR_SCORE = 2;

/**
 * Rows carrying this verificationStatus are notes: single-sourced
 * scholarship (grade C in the evidence-class grading) kept in the store for
 * the v1 keyword path and for the next failure mine, never served in the
 * v4.3 block. The grading contract is "two evidence classes to enter the
 * prompt"; this is where the block enforces it.
 */
export const GRAMMAR_NOTE_STATUS = "scholarship_note";

/**
 * The instruction on top of the block. Written to the Claude Fable 5.1
 * prompting guidance: literal about what the notes are, what to do when they
 * conflict with the model's own guess, and what NOT to do with them (copy
 * them out). No metaphor, no hedging.
 */
export const GRAMMAR_INTRO =
  "GRAMMAR NOTES - rules of Igala relevant to this question, from published Igala grammar and from the community's own corrections. " +
  "Apply them when you build your sentences. Where a note and your own guess about Igala disagree, the note is right. " +
  "Do not quote or summarise the notes in your answer; use them.";

export interface GrammarRuleRow {
  id: string;
  topic: string;
  content: string;
}

export interface RankedGrammarRule extends GrammarRuleRow {
  score: number;
}

/**
 * Light English stemming for the matching only: a trailing s comes off words
 * longer than three letters (plates, numbers, counts, greetings) so a
 * question's plural meets a rule's singular. Igala forms are short or end in
 * vowels, so the rule rarely touches them, and it is applied to both sides
 * so nothing can match on one side only.
 */
export function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
    ? word.slice(0, -1)
    : word;
}

/** Fold + split into a word set, the same way contentWords folds the prompt. */
function wordSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of fullFold(text).split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length > 2) out.add(stem(w));
  }
  return out;
}

/**
 * Words that appear in more than this share of the store's rows carry no
 * signal about which row a question wants ("one", "word", "sentence",
 * "write", "Igala" are in nearly every rule) and are ignored when the store
 * is large enough for the share to mean something. Below that size every
 * word counts, so a four-row test store behaves as written.
 */
export const COMMON_WORD_SHARE = 1 / 3;
export const COMMON_WORD_MIN_ROWS = 6;

/** The words to ignore for this store: present in too many rows to point at one. */
export function commonWords(rows: readonly GrammarRuleRow[]): Set<string> {
  const common = new Set<string>();
  if (rows.length < COMMON_WORD_MIN_ROWS) return common;
  const df = new Map<string, number>();
  for (const r of rows) {
    for (const w of wordSet(`${r.topic}\n${r.content}`)) {
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }
  for (const [w, n] of df) {
    if (n > rows.length * COMMON_WORD_SHARE) common.add(w);
  }
  return common;
}

/**
 * Score rows against the prompt's content words. Topic overlap counts 3,
 * content overlap counts 1, store-common words count nothing. Deterministic
 * tiebreak on id so a re-run serves the same rules.
 */
export function rankGrammarRules(
  words: readonly string[],
  rows: readonly GrammarRuleRow[],
  k: number = GRAMMAR_K,
): RankedGrammarRule[] {
  if (words.length === 0 || rows.length === 0) return [];
  const ignore = commonWords(rows);
  const query = new Set(
    words.map((w) => stem(fullFold(w))).filter((w) => !ignore.has(w)),
  );
  const ranked: RankedGrammarRule[] = [];
  for (const r of rows) {
    const topic = wordSet(r.topic);
    const content = wordSet(r.content);
    let score = 0;
    for (const w of query) {
      if (topic.has(w)) score += 3;
      else if (content.has(w)) score += 1;
    }
    if (score >= MIN_GRAMMAR_SCORE) ranked.push({ ...r, score });
  }
  ranked.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  return ranked.slice(0, k);
}

/** Render the served block; "" when there is nothing to serve. Rows are
 * added in rank order until the cap; a row that would cross it is dropped
 * whole, never truncated, so a rule can never be served half-stated. */
export function renderGrammarBlock(rules: readonly GrammarRuleRow[]): string {
  if (rules.length === 0) return "";
  const parts: string[] = [GRAMMAR_INTRO];
  let size = GRAMMAR_INTRO.length;
  for (const r of rules) {
    const piece = `${r.topic}\n${r.content.trim()}`;
    if (size + piece.length + 2 > MAX_GRAMMAR_CHARS) continue;
    parts.push(piece);
    size += piece.length + 2;
  }
  return parts.length === 1 ? "" : parts.join("\n\n");
}

export interface GrammarBlockResult {
  grammarBlock: string;
  /** Audit-trail ids, "grammar:<RagEntry.id>", for ModelOutput.ragContextIds. */
  grammarIds: string[];
  leakReport: LeakReport;
}

/**
 * Build the block for one prompt. Prisma injected, like the v2/v4 builders,
 * so tests run against a fake. On a frozen prompt every candidate rule is
 * run through the same leak guard as every other served piece, against the
 * prompt's own benchmark gold, and a hit drops the rule.
 */
export async function buildGrammarBlock(
  prisma: PrismaClient,
  prompt: {
    promptId: string;
    text: string;
    language?: string;
    isHoldout: boolean;
  },
): Promise<GrammarBlockResult> {
  const language = prompt.language ?? "igala";
  const words = contentWords(prompt.text);
  const stored = await prisma.ragEntry.findMany({
    where: { language, chunkType: "grammar_rule" },
    select: { id: true, topic: true, content: true, verificationStatus: true },
  });
  const rows = stored.filter(
    (r) => r.verificationStatus !== GRAMMAR_NOTE_STATUS,
  );
  let ranked = rankGrammarRules(words, rows);

  let leakReport: LeakReport = { pass: true, hitCount: 0, hits: [] };
  if (prompt.isHoldout && ranked.length > 0) {
    const promptRow = await prisma.prompt.findUnique({
      where: { promptId: prompt.promptId },
      select: {
        coldAuthorAnswers: {
          where: { consentBenchmark: true, isDemo: false },
          select: { answerText: true },
        },
      },
    });
    const protectedSet = buildProtectedSet(
      (promptRow?.coldAuthorAnswers ?? []).map((g) => ({
        promptId: prompt.promptId,
        answerText: g.answerText,
      })),
    );
    const filtered = filterAssembled(
      prompt.promptId,
      ranked.map((r) => ({
        where: `grammar:${r.id}`,
        text: `${r.topic}\n${r.content}`,
      })),
      protectedSet,
    );
    const kept = new Set(filtered.kept.map((p) => p.where));
    ranked = ranked.filter((r) => kept.has(`grammar:${r.id}`));
    leakReport = filtered.report;
  }

  const grammarBlock = renderGrammarBlock(ranked);
  // Only rules that actually made it into the rendered text are audit ids.
  const grammarIds = ranked
    .filter((r) => grammarBlock.includes(r.topic))
    .map((r) => `grammar:${r.id}`);
  return { grammarBlock, grammarIds, leakReport };
}
