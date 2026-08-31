import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  retrieveGoldExamples,
  type GoldPoolEntry,
  type RetrievedGold,
} from "./gold-retrieval";
import {
  buildProtectedSet,
  filterAssembled,
  type LeakReport,
} from "@/lib/eval/leak-guard";
import { fullFold } from "@/lib/eval/normalize";
import { toOrthography } from "@/lib/lexicon-parse";

/**
 * SERVING PATH V2 - retrieval assembled the way the ablation literature says
 * retrieval for an unseen language should be assembled.
 *
 * V1 retrieved topic-similar RagEntry prose chunks. Agnes's live verdict on
 * the models it fed (2026-08-11) was that the words are Igala but the
 * sentences are incoherent - vocabulary without syntax. The research record
 * (tasks/rag-design.md, summarising the MTOB, DiPMT, LingoLLM and Aycock
 * ablations) says why: lexicon entries and parallel examples carry the
 * signal; grammar prose does not (three independent ablations rank it last,
 * and MTOB measured retrieved grammar chunks making output WORSE). So v2
 * serves exactly three retrieved things and no prose:
 *
 *   1. DICTIONARY - LexEntry rows matched by LEXICAL overlap on the English
 *      gloss, rendered DiPMT-style, destined for the final user turn
 *      immediately above the question (Cuconasu et al. measured
 *      gold-adjacent-to-query at 0.37 vs 0.17 far from it).
 *   2. PARALLEL EXAMPLES - ParallelPair rows ranked by Postgres full-text
 *      overlap on the English side. These demonstrate how Igala sentences
 *      are BUILT, which is precisely the thing Agnes says the models lack.
 *   3. GOLD EXEMPLARS - community (question, answer) pairs via the existing
 *      gold-retrieval module, which owns the contamination guard.
 *
 * Everything retrieved for a held-out prompt additionally passes through the
 * leak guard (filterAssembled) against that prompt's own gold, because the
 * 2026-08-09 audit measured 39.5% of frozen prompts being served their own
 * answer key through the v1 chunk path. Dropped pieces are counted, never
 * silently vanished, so a run can prove the guard fired.
 */

// ─── the knobs ──────────────────────────────────────────────────────────────
// Exported (2026-08-28) because the v4 serving path (retrieval-v4.ts) must
// share these caps exactly - a v2/v4 delta that silently moved a knob would
// stop being attributable to the v4 design changes.

/** Dictionary lines served per prompt. DiPMT caps around here too. */
export const MAX_HEADWORDS = 20;
/** Senses per headword. DiPMT's cap: more senses is noise, not coverage. */
export const MAX_SENSES = 3;
/** Parallel pairs per prompt, when the prompt wants structure at all. */
export const PARALLEL_K = 4;
/**
 * Community gold exemplars per prompt. 8, matching v1's proven setting - the
 * first sniff run served 4 to make room for the new blocks and lost 6.8
 * stripped-chrF to v1 on the leak-free subset. On a benchmark of short lookup
 * prompts the gold exemplars are the strongest signal there is; making room
 * at their expense was the wrong trade.
 */
export const GOLD_K = 8;

/**
 * Should this prompt get parallel sentence examples at all?
 *
 * The sniff run measured why this gate exists: serving six Bible verses as
 * "copy this shape" to a prompt whose gold answer is one word cost real
 * points (v2-v1 stripped chrF -6.8 GPT-4.1 / -9.0 Gemma on the leak-free
 * subset), and in the free-form samples the Bible register bled straight into
 * a farmer story ("Jihofa"). Structure examples are for prompts that ask the
 * model to BUILD something - a sentence, a story, a greeting exchange. Lookup
 * prompts (single word, orthography, disambiguation) get the dictionary and
 * the gold exemplars, which are already in exactly the right register: terse.
 *
 * Bucket is the primary signal; the text heuristic catches chat questions
 * that carry no bucket.
 */
export function wantsStructureExamples(
  bucket: string | null,
  text: string,
): boolean {
  if (bucket === "orthography" || bucket === "lexicon_disambig") return false;
  if (bucket && bucket !== "grammar_tone") return true;
  // grammar_tone and bucketless chat: sentence-building asks get examples,
  // word-level asks do not.
  return /\b(translate|sentence|story|proverb|greet|say .* to|conversation|paragraph|explain|describe)\b/i.test(
    text,
  );
}

/**
 * ~120 English function words that must never trigger a dictionary lookup.
 * DiPMT suppresses the most frequent source words for the same reason: a
 * lookup for "the" or "is" can only inject noise. Inline rather than a
 * dependency because the list is small, stable, and needs to be auditable in
 * one glance.
 */
export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "out",
  "over",
  "own",
  "please",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
]);

/**
 * The English content words of a prompt, folded to match LexEntry.glossFolded
 * (which is fullFold of the gloss), stopwords removed, first-occurrence order
 * preserved. Order matters: CoD measured that shuffling dictionary entries out
 * of source order degrades results, so the block is rendered in the order the
 * words appear in the question.
 */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of fullFold(text).split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length === 0) continue;
    if (ENGLISH_STOPWORDS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/** One dictionary sense as retrieved, before rendering. */
export interface DictSense {
  id: string;
  headword: string;
  gloss: string;
  confidence: number;
}

/**
 * One dictionary line, DiPMT-compact. The attested headword is served
 * verbatim - never folded, because a folded form reaching the model is
 * exactly the spelling corruption v2 exists to stop. A sense whose gloss is
 * not the queried word (a prefix match, or a curated confusion pairing like
 * ọ́kọ/ọ́ya) carries its own gloss with an explicit warning, because Igala
 * near-forms differ in meaning and the model must be told which is which:
 *
 *   "water" is Ómi.
 *   "husband" is ọ́kọ, or ọ́ya (wife - do not confuse).
 */
export function renderDictionaryLine(
  word: string,
  senses: DictSense[],
): string {
  const rendered = senses.map((s) => {
    const note =
      fullFold(s.gloss) === word ? "" : ` (${s.gloss} - do not confuse)`;
    // toOrthography: chikhapo and parts of Koelle store PHONEMIC notation
    // (ɛ ɔ ǯ ŋ, nasal tildes, macrons). Serving that verbatim under a system
    // prompt that says "copy attested spellings character for character" told
    // the model to write characters no Igala speaker uses - the exact
    // meaning-changing spelling failure Agnes flagged. The stored row keeps
    // the source notation for provenance; the model only ever sees standard
    // orthography.
    return `${toOrthography(s.headword)}${note}`;
  });
  const alternatives = rendered
    .slice(1)
    .map((r) => `, or ${r}`)
    .join("");
  return `"${word}" is ${rendered[0]}${alternatives}.`;
}

/** The prompt being generated for. promptId is the human slug, not the cuid. */
export interface RetrievalV2Prompt {
  /** Prompt.promptId (e.g. ig_bank_orth_001), or a synthetic id like "__chat__". */
  promptId: string;
  text: string;
  bucket: string | null;
  isHoldout: boolean;
}

export interface RetrievalV2Result {
  /** Rendered dictionary block, "" when nothing matched. Goes LAST in the user turn. */
  dictionaryBlock: string;
  /** Community gold as (question, answer) pairs, weakest match first. */
  exampleTurns: { question: string; answer: string }[];
  /** Rendered parallel-example block, "" when nothing matched. */
  parallelBlock: string;
  /** Every piece served, as lex:<id> / pp:<id> / gold:<id>, for the audit trail. */
  contextIds: string[];
  /** What the leak guard dropped. Always pass/0 for non-holdout prompts. */
  leakReport: LeakReport;
}

export interface LexRow {
  id: string;
  headword: string;
  gloss: string;
  glossFolded: string;
  confidence: number;
}

export interface ParallelRow {
  id: string;
  igala: string;
  english: string;
}

/** Deterministic sense order: curated before induced, then stable by headword. */
function senseOrder(a: LexRow, b: LexRow): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.headword < b.headword ? -1 : a.headword > b.headword ? 1 : 0;
}

/** Keep one row per headword - the same form from two sources is one sense. */
export function dedupeByHeadword(rows: LexRow[]): LexRow[] {
  const seen = new Set<string>();
  const out: LexRow[] = [];
  for (const r of [...rows].sort(senseOrder)) {
    if (seen.has(r.headword)) continue;
    seen.add(r.headword);
    out.push(r);
  }
  return out;
}

/** One dictionary candidate: the queried English word plus a retrieved sense. */
export interface DictCandidate {
  word: string;
  sense: LexRow;
}

/**
 * The dictionary leg, extracted verbatim from buildRetrievalV2 (2026-08-28) so
 * the v4 path (retrieval-v4.ts) serves the IDENTICAL lookup - same queries,
 * same fallback rule, same caps. Behavior is pinned by retrieval-v2.test.ts;
 * any change here changes BOTH serving paths, on purpose.
 */
export async function retrieveDictCandidates(
  prisma: PrismaClient,
  words: string[],
): Promise<DictCandidate[]> {
  // Lookup is LEXICAL on the English side because that is where the query has
  // signal: the prompts are English, and rag-design.md measured every
  // production embedder at exactly chance on the Igala side.
  const exactRows =
    words.length === 0
      ? []
      : ((await prisma.lexEntry.findMany({
          where: { glossFolded: { in: words } },
          select: {
            id: true,
            headword: true,
            gloss: true,
            glossFolded: true,
            confidence: true,
          },
        })) as LexRow[]);

  const sensesByWord = new Map<string, LexRow[]>();
  for (const row of exactRows) {
    const list = sensesByWord.get(row.glossFolded) ?? [];
    list.push(row);
    sensesByWord.set(row.glossFolded, list);
  }

  // Prefix fallback ONLY on an exact miss ("farm" finding a "farming" entry).
  // Never alongside exact hits: when the exact form is attested, a looser
  // match can only add near-forms, and near-forms are the confusion channel
  // (Onokotu vs Nokotu) this whole path is built to close.
  for (const word of words) {
    if (sensesByWord.has(word)) continue;
    const rows = (await prisma.lexEntry.findMany({
      where: { glossFolded: { startsWith: word } },
      select: {
        id: true,
        headword: true,
        gloss: true,
        glossFolded: true,
        confidence: true,
      },
      // Enough to survive dedupe down to MAX_SENSES; bounded so a one-letter
      // fragment can never drag in half the lexicon.
      take: MAX_SENSES * 4,
    })) as LexRow[];
    if (rows.length > 0) sensesByWord.set(word, rows);
  }

  // Cap BEFORE the leak guard, so a dropped sense leaves a visible gap
  // rather than being backfilled by the next candidate - backfilling would
  // let the protected content steer which entries get served, and the guard
  // must never shape the context it polices.
  const dictCandidates: DictCandidate[] = [];
  for (const word of words) {
    if (dictCandidates.length >= MAX_HEADWORDS * MAX_SENSES) break;
    const senses = dedupeByHeadword(sensesByWord.get(word) ?? []).slice(
      0,
      MAX_SENSES,
    );
    for (const sense of senses) dictCandidates.push({ word, sense });
  }
  return dictCandidates;
}

/** Header line of the v2 parallel block. Static text: Scope A applies. */
export const PARALLEL_INTRO_V2 =
  "These Igala-English pairs show how Igala sentences are BUILT. Imitate their structure - word order, sentence length - when composing your answer:";

/** Header line of the dictionary block. Static text: Scope A applies. */
export const DICTIONARY_INTRO =
  "Igala dictionary entries for the words in this question. Use these exact forms, spelled exactly as written:";

/**
 * Render the dictionary block from the leak-guard-surviving candidates.
 * Extracted verbatim from buildRetrievalV2 (2026-08-28), shared with v4.
 */
export function renderDictionaryBlock(
  words: string[],
  keptDict: DictCandidate[],
): { dictionaryBlock: string; dictIds: string[] } {
  const dictLines: string[] = [];
  const dictIds: string[] = [];
  for (const word of words) {
    if (dictLines.length >= MAX_HEADWORDS) break;
    const senses = keptDict.filter((c) => c.word === word).map((c) => c.sense);
    if (senses.length === 0) continue;
    dictLines.push(renderDictionaryLine(word, senses));
    dictIds.push(...senses.map((s) => `lex:${s.id}`));
  }
  const dictionaryBlock =
    dictLines.length === 0 ? "" : [DICTIONARY_INTRO, ...dictLines].join("\n");
  return { dictionaryBlock, dictIds };
}

/**
 * The gold-exemplar leg, extracted verbatim from buildRetrievalV2
 * (2026-08-28), shared with v4. The caller resolves the query's promptId (the
 * cuid when the prompt exists, else the slug - which matches no pool entry,
 * leaving the id-level guard inert and the isHoldout flag as the active
 * defence). retrieveGoldExamples owns the contamination rules.
 */
export async function retrieveGuardedGold(
  prisma: PrismaClient,
  query: {
    promptId: string;
    text: string;
    bucket: string | null;
    isHoldout: boolean;
  },
): Promise<RetrievedGold[]> {
  const goldRows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentTraining: true },
    select: {
      id: true,
      promptId: true,
      answerText: true,
      bucket: true,
      consentTraining: true,
      isDemo: true,
      verificationStatus: true,
      prompt: {
        select: { promptId: true, text: true, isHoldout: true, bucket: true },
      },
    },
  });
  const goldPool: GoldPoolEntry[] = goldRows.map((r) => ({
    id: r.id,
    promptId: r.promptId,
    promptRef: r.prompt.promptId,
    promptText: r.prompt.text,
    answerText: r.answerText,
    bucket: r.bucket ?? r.prompt.bucket,
    isHoldout: r.prompt.isHoldout,
    isDemo: r.isDemo,
    consentTraining: r.consentTraining,
    verificationStatus: r.verificationStatus,
  }));
  return retrieveGoldExamples(query, goldPool, { k: GOLD_K }).examples;
}

/**
 * Build the full v2 retrieval context for one prompt.
 *
 * Prisma is injected so the module is unit-testable with a recorder/fake, the
 * same pattern as collectEvalBundle (see collect.test.ts).
 */
export async function buildRetrievalV2(
  prisma: PrismaClient,
  prompt: RetrievalV2Prompt,
): Promise<RetrievalV2Result> {
  const words = contentWords(prompt.text);

  // The Prompt row resolves the slug to the cuid the gold pool is keyed on,
  // and carries the prompt's own benchmark gold for the leak guard's
  // protected set. consentBenchmark gold is what the eval harness scores
  // against (collect.ts), so it is exactly the set whose leakage would turn a
  // measurement into an answer-key copy. A synthetic promptId ("__chat__")
  // resolves to nothing: empty protected set, and the self-exclusion rule in
  // gold retrieval simply has nothing to match, which is correct - chat is
  // guarded by isHoldout=true instead.
  const promptRow = await prisma.prompt.findUnique({
    where: { promptId: prompt.promptId },
    select: {
      id: true,
      coldAuthorAnswers: {
        where: { consentBenchmark: true, isDemo: false },
        select: { answerText: true },
      },
    },
  });

  // ── 1. DICTIONARY: exact glossFolded match, then prefix as fallback ──────
  // Extracted to retrieveDictCandidates (shared with the v4 path); the
  // queries, fallback rule and caps are the ones documented on that function.
  const dictCandidates = await retrieveDictCandidates(prisma, words);

  // ── 2. PARALLEL EXAMPLES: full-text overlap on the English side ──────────
  // plainto_tsquery over the generated englishTsv column (DB-only, GIN
  // indexed - deliberately absent from the Prisma model, so this must stay
  // $queryRaw). Lexical overlap, not topic similarity: the pair whose English
  // shares words with the question is the pair whose Igala shows the needed
  // construction.
  //
  // plainto_tsquery ANDs its terms, which on a full prompt ("Show how a
  // younger person should respectfully greet an elder in Igala") demands one
  // pair containing EVERY content word - measured 0 hits against 30,907 live
  // pairs. So plainto_tsquery still does the stemming and stopword removal,
  // and the AND is relaxed to OR before matching; ts_rank then ranks pairs
  // sharing MORE of the prompt's words above pairs sharing one. Safe rewrite:
  // plainto_tsquery emits only '&' between lexemes (phrase operators come
  // from phraseto_tsquery, which is not used here).
  //
  // Table is schema-qualified because Supabase pools connections and the
  // search_path is not guaranteed per-statement.
  const pairRows = wantsStructureExamples(prompt.bucket, prompt.text)
    ? await prisma.$queryRaw<ParallelRow[]>(Prisma.sql`
    SELECT id, igala, english
    FROM wikitongues."ParallelPair"
    WHERE "englishTsv" @@ replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery
    ORDER BY ts_rank("englishTsv", replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery) DESC, id ASC
    LIMIT ${PARALLEL_K}
  `)
    : [];

  // ── 3. GOLD EXEMPLARS: the existing guarded retrieval, k=GOLD_K ───────────────
  // Extracted to retrieveGuardedGold (shared with the v4 path).
  const gold = await retrieveGuardedGold(prisma, {
    // The cuid when the prompt exists, else the slug itself - which matches
    // no pool entry, leaving the id-level guard inert and the isHoldout
    // flag as the active defence.
    promptId: promptRow?.id ?? prompt.promptId,
    text: prompt.text,
    bucket: prompt.bucket,
    isHoldout: prompt.isHoldout,
  });

  // ── 4. LEAK GUARD over every piece, holdout prompts only ─────────────────
  // The guard checks each piece's SERVED text (headword + gloss for lexicon,
  // both faces of a pair, question + answer for gold) against the prompt's
  // own gold. Content-level, not id-level: the v1 hole was precisely that
  // id-guarded exemplars sat next to unguarded chunks carrying the same
  // string.
  let keptWhere: Set<string> | null = null;
  let leakReport: LeakReport = { pass: true, hitCount: 0, hits: [] };
  if (prompt.isHoldout) {
    const protectedSet = buildProtectedSet(
      (promptRow?.coldAuthorAnswers ?? []).map((g) => ({
        promptId: prompt.promptId,
        answerText: g.answerText,
      })),
    );
    const pieces = [
      ...dictCandidates.map((c) => ({
        where: `lex:${c.sense.id}`,
        text: `${c.sense.headword} ${c.sense.gloss}`,
      })),
      ...pairRows.map((p) => ({
        where: `pp:${p.id}`,
        text: `${p.english}\n${p.igala}`,
      })),
      ...gold.map((g) => ({
        where: `gold:${g.id}`,
        text: `${g.question}\n${g.answer}`,
      })),
    ];
    const filtered = filterAssembled(prompt.promptId, pieces, protectedSet);
    keptWhere = new Set(filtered.kept.map((p) => p.where));
    leakReport = filtered.report;
  }
  const kept = (label: string) => keptWhere === null || keptWhere.has(label);

  // ── 5. RENDER ────────────────────────────────────────────────────────────
  const keptDict = dictCandidates.filter((c) => kept(`lex:${c.sense.id}`));
  const { dictionaryBlock, dictIds } = renderDictionaryBlock(words, keptDict);

  const keptPairs = pairRows.filter((p) => kept(`pp:${p.id}`));
  const parallelBlock =
    keptPairs.length === 0
      ? ""
      : [
          PARALLEL_INTRO_V2,
          ...keptPairs.map((p) => `English: ${p.english}\nIgala: ${p.igala}`),
        ].join("\n\n");

  const keptGold = gold.filter((g) => kept(`gold:${g.id}`));
  // Weakest match first, so the closest exemplar sits nearest the real
  // question - same ordering rationale as buildGoldExampleTurns.
  const exampleTurns = [...keptGold]
    .reverse()
    .map((g) => ({ question: g.question, answer: g.answer }));

  return {
    dictionaryBlock,
    exampleTurns,
    parallelBlock,
    contextIds: [
      ...dictIds,
      ...keptPairs.map((p) => `pp:${p.id}`),
      ...keptGold.map((g) => `gold:${g.id}`),
    ],
    leakReport,
  };
}
