/**
 * RETRIEVAL OVER THE COMMUNITY'S OWN GOLD.
 *
 * The project fine-tuned before it tested retrieval, which is the wrong order:
 * retrieval is an order of magnitude cheaper, and on rare knowledge the
 * literature (Soudani et al. 2024, arXiv:2403.01432) finds it beats supervised
 * fine-tuning. We already hold the best possible Igala retrieval corpus - the
 * ColdAuthorAnswer table, hundreds of answers written cold and source-free by
 * Igala speakers. This module turns that table into in-context exemplars.
 *
 * It is deliberately SEPARATE from src/lib/rag.ts (which retrieves external
 * encyclopedic Igala facts from RagEntry). Different corpus, different unit,
 * different failure mode: this one retrieves (question, answer) DEMONSTRATIONS,
 * so what it teaches the model is the FORM of a native answer - length, script,
 * tone-marking practice, the fact that a one-word answer is a complete answer -
 * not a fact to recite.
 *
 *
 * ─── THE CONTAMINATION GUARD ───────────────────────────────────────────────
 *
 * 238 of the 937 gold answers belong to the 43 FROZEN benchmark prompts. If any
 * of those reached the prompt at generation time, the "result" would be the
 * model copying the answer key, and the whole comparison would be worthless.
 * Two rules, both enforced in `retrieveGoldExamples` and both unit-tested:
 *
 *   1. SELF-PROMPT EXCLUSION (unconditional, no opt-out). Gold belonging to the
 *      prompt currently being answered is never retrievable, for any prompt in
 *      any split. This is the direct answer-key leak.
 *
 *   2. HELD-OUT SOURCE EXCLUSION (default on; CANNOT be turned off for a
 *      held-out query). Gold belonging to any OTHER held-out prompt is dropped
 *      too. Held-out prompts are near-duplicates of each other by construction
 *      ("Write the Igala word for 'water'" / "...for 'child'"), so letting one
 *      frozen prompt's gold prime another would leak the bank sideways, and it
 *      would also mean the benchmark had been used to build the system under
 *      test. `allowHoldoutSources` exists only for non-held-out queries, and
 *      even there it defaults to false.
 *
 * Demo rows and rows whose speaker did not consent to training use are dropped
 * as well - an in-context exemplar shapes the output the same way a training
 * row does, so it is governed by the same consent flag (matching sft-source.ts).
 *
 *
 * ─── THE RETRIEVAL SIGNAL, AND WHY THIS ONE ────────────────────────────────
 *
 * Zero dependencies, fully deterministic, ~200 lines. Signal is computed over
 * the PROMPT texts (which are English instructions), never over the Igala
 * answers - the query side has no Igala to match against, so answer-side
 * similarity would be noise.
 *
 *   bucket        Strict priority: every same-bucket candidate outranks every
 *                 different-bucket one. The bucket IS the answer form in this
 *                 corpus (an `orthography` answer is one word, a
 *                 `cultural_values` answer is a paragraph), and demonstrating
 *                 the wrong form is worse than demonstrating a less similar
 *                 question. Sort is lexicographic, not a weighted bonus.
 *
 *   idfCosine     TF-IDF cosine over word tokens, 65% of the similarity score.
 *                 These prompts share heavy boilerplate ("Write the Igala word
 *                 for X with correct spelling and tone marks"), so raw overlap
 *                 would rank everything equal. IDF is precisely the correction:
 *                 it zeroes the boilerplate and puts the weight on the content
 *                 word ('water', 'condolences', 'proverb'). Document frequency
 *                 is counted over DISTINCT source prompts, not gold rows, so a
 *                 prompt that happens to have 20 answers does not distort it.
 *
 *   charDice      Character-trigram Dice coefficient, 35%. Covers what token
 *                 matching misses: morphological variants (farm / farming),
 *                 and any literal Igala string quoted inside a prompt, where
 *                 token identity is too brittle.
 *
 * Rejected alternatives: embeddings (a network call and an API key per
 * retrieval, for a 465-document corpus - not worth it, and it would make the
 * retrieval non-reproducible offline); BM25 (needs length normalisation tuning
 * that 465 near-uniform-length documents cannot justify); answer-side
 * similarity (no Igala on the query side to match).
 *
 * DIVERSITY: at most `maxPerPrompt` (default 1) exemplar per source prompt.
 * Without it, K=6 against `ig_reg_001` returns six answers to the SAME question
 * (that prompt alone has 20 golds) and demonstrates one narrow thing. One per
 * prompt means K exemplars means K distinct questions.
 */

/** One community gold answer, decoupled from Prisma so this stays unit-testable. */
export interface GoldPoolEntry {
  /** ColdAuthorAnswer.id */
  id: string;
  /** Prompt.id (cuid) that this answer belongs to. */
  promptId: string;
  /** Human-readable Prompt.promptId, e.g. ig_bank_orth_001. Reporting only. */
  promptRef?: string;
  /** The prompt text the speaker was answering. This is the retrieval key. */
  promptText: string;
  /** The speaker's Igala answer. This becomes the exemplar's assistant turn. */
  answerText: string;
  /** ColdAuthorAnswer.bucket, falling back to the prompt's bucket. */
  bucket: string | null;
  /** Prompt.isHoldout - drives the contamination guard. */
  isHoldout: boolean;
  isDemo: boolean;
  consentTraining: boolean;
  /** VerificationStatus, used only to break ties within one source prompt. */
  verificationStatus?: string;
}

/** The prompt being generated for. */
export interface GoldRetrievalQuery {
  /** Prompt.id (cuid). Compared against GoldPoolEntry.promptId for rule 1. */
  promptId: string;
  text: string;
  bucket: string | null;
  /** True for split === 'test' or isHoldout. Forces rule 2 on. */
  isHoldout: boolean;
}

export interface RetrievalOptions {
  /** How many exemplars to return. Default 6. */
  k?: number;
  /** Max exemplars drawn from any one source prompt. Default 1. */
  maxPerPrompt?: number;
  /**
   * Permit gold from OTHER held-out prompts. Ignored (forced false) whenever
   * the query itself is held out. Exists for non-benchmark generation only.
   */
  allowHoldoutSources?: boolean;
}

export interface RetrievedGold {
  id: string;
  promptId: string;
  promptRef?: string;
  question: string;
  answer: string;
  bucket: string | null;
  /** Blended similarity in [0,1]. Bucket priority is NOT folded into this. */
  score: number;
  sameBucket: boolean;
}

/** Why entries were dropped. Surfaced so a run can prove the guard fired. */
export interface RetrievalExclusions {
  selfPrompt: number;
  holdoutSource: number;
  demo: number;
  noConsent: number;
  empty: number;
}

export interface GoldRetrievalResult {
  examples: RetrievedGold[];
  poolSize: number;
  eligibleSize: number;
  excluded: RetrievalExclusions;
  /** False only when the query is held out and rule 2 was therefore forced on. */
  holdoutSourcesAllowed: boolean;
}

const DEFAULT_K = 6;

// ─── text normalisation and similarity ──────────────────────────────────────

/**
 * Lowercase, strip combining marks, and reduce to letters/digits/spaces. Prompt
 * texts are English instructions that may quote Igala forms; folding diacritics
 * means a quoted "ẹ̀" still matches its undotted spelling in another prompt.
 */
export function normalizeForMatch(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalizeForMatch(text);
  return n.length === 0 ? [] : n.split(" ");
}

/** Character trigrams of the normalized text, space-padded at both ends. */
export function charNgrams(text: string, n = 3): Set<string> {
  const padded = ` ${normalizeForMatch(text)} `;
  const out = new Set<string>();
  if (padded.length < n) return out;
  for (let i = 0; i + n <= padded.length; i++) out.add(padded.slice(i, i + n));
  return out;
}

/** Dice coefficient over two sets: 2|A n B| / (|A| + |B|). */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/**
 * IDF table over a document set. One document per DISTINCT source prompt, so a
 * prompt holding 20 gold answers contributes exactly one document.
 */
export function buildIdf(documents: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of documents) {
    for (const term of new Set(tokenize(doc))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const n = documents.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + n / (1 + count)));
  }
  return idf;
}

/** L2-normalized TF-IDF vector. Unknown terms get the max IDF in the table. */
function tfidfVector(
  text: string,
  idf: Map<string, number>,
  fallbackIdf: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const vec = new Map<string, number>();
  let norm = 0;
  for (const [term, count] of counts) {
    const w = (1 + Math.log(count)) * (idf.get(term) ?? fallbackIdf);
    if (w <= 0) continue;
    vec.set(term, w);
    norm += w * w;
  }
  if (norm === 0) return vec;
  const inv = 1 / Math.sqrt(norm);
  for (const [term, w] of vec) vec.set(term, w * inv);
  return vec;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += w * other;
  }
  return dot;
}

/** Median IDF over the vocabulary; the cut between boilerplate and content. */
export function medianIdf(idf: Map<string, number>): number {
  if (idf.size === 0) return 0;
  const values = [...idf.values()].sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 === 1
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

/**
 * The text reduced to its CONTENT tokens: those at or above the corpus median
 * IDF. This is what the character n-gram term is measured on, and it is not an
 * optimisation - it is load-bearing.
 *
 * Measured on the real bank: char-trigram Dice over the RAW text scores every
 * "Write the Igala word for 'X' with correct spelling and tone marks" prompt at
 * ~0.73 against every other, because they share ~55 characters of template.
 * The genuinely relevant neighbour scored 0.62 and lost. Character overlap on
 * this corpus measures template identity, not relatedness.
 *
 * Projecting onto content tokens first keeps the reason we want n-grams at all
 * (fuzzy matching that token identity misses: farm/farming, and quoted Igala
 * whose spelling varies) while removing the template's contribution entirely.
 * Falls back to the full text when a prompt is so short that the projection is
 * empty, so a terse prompt still gets a signal.
 */
export function contentProjection(
  text: string,
  idf: Map<string, number>,
  threshold: number,
): string {
  const kept = tokenize(text).filter(
    (t) => (idf.get(t) ?? Infinity) >= threshold,
  );
  return kept.length > 0 ? kept.join(" ") : normalizeForMatch(text);
}

const COSINE_WEIGHT = 0.65;
const DICE_WEIGHT = 0.35;

/** Rank of a verification status: higher wins ties within one source prompt. */
function verificationRank(status?: string): number {
  switch (status) {
    case "expert_reviewed":
      return 3;
    case "multi_annotator_verified":
      return 2;
    case "single_annotator":
      return 1;
    default:
      return 0; // seed / unknown
  }
}

// ─── retrieval ──────────────────────────────────────────────────────────────

/**
 * The K most relevant community gold answers to use as in-context exemplars for
 * `query`, with the contamination guard applied. Pure: no Prisma, no network.
 */
export function retrieveGoldExamples(
  query: GoldRetrievalQuery,
  pool: GoldPoolEntry[],
  options: RetrievalOptions = {},
): GoldRetrievalResult {
  const k = options.k ?? DEFAULT_K;
  const maxPerPrompt = Math.max(1, options.maxPerPrompt ?? 1);
  // Rule 2: a held-out query can never draw on held-out gold, whatever the
  // caller asked for. The flag is not a permission the caller can grant here.
  const holdoutSourcesAllowed = query.isHoldout
    ? false
    : (options.allowHoldoutSources ?? false);

  const excluded: RetrievalExclusions = {
    selfPrompt: 0,
    holdoutSource: 0,
    demo: 0,
    noConsent: 0,
    empty: 0,
  };

  const eligible: GoldPoolEntry[] = [];
  for (const entry of pool) {
    // Rule 1: never the answer key for the prompt being answered.
    if (entry.promptId === query.promptId) {
      excluded.selfPrompt++;
      continue;
    }
    // Rule 2: never any other frozen prompt's gold.
    if (entry.isHoldout && !holdoutSourcesAllowed) {
      excluded.holdoutSource++;
      continue;
    }
    if (entry.isDemo) {
      excluded.demo++;
      continue;
    }
    if (!entry.consentTraining) {
      excluded.noConsent++;
      continue;
    }
    if (!entry.answerText?.trim() || !entry.promptText?.trim()) {
      excluded.empty++;
      continue;
    }
    eligible.push(entry);
  }

  if (eligible.length === 0 || k <= 0) {
    return {
      examples: [],
      poolSize: pool.length,
      eligibleSize: eligible.length,
      excluded,
      holdoutSourcesAllowed,
    };
  }

  // One IDF document per distinct source prompt.
  const promptTextById = new Map<string, string>();
  for (const e of eligible) {
    if (!promptTextById.has(e.promptId))
      promptTextById.set(e.promptId, e.promptText);
  }
  const idf = buildIdf([...promptTextById.values()]);
  const maxIdf = Math.max(0, ...idf.values());
  const contentCut = medianIdf(idf);
  const queryVec = tfidfVector(query.text, idf, maxIdf);
  const queryGrams = charNgrams(contentProjection(query.text, idf, contentCut));

  // Score once per source prompt: every gold row under it shares the question.
  const scoreByPrompt = new Map<string, number>();
  for (const [promptId, text] of promptTextById) {
    const sim =
      COSINE_WEIGHT * cosine(queryVec, tfidfVector(text, idf, maxIdf)) +
      DICE_WEIGHT *
        diceCoefficient(
          queryGrams,
          charNgrams(contentProjection(text, idf, contentCut)),
        );
    scoreByPrompt.set(promptId, sim);
  }

  const scored = eligible.map((entry) => ({
    entry,
    score: scoreByPrompt.get(entry.promptId) ?? 0,
    sameBucket:
      query.bucket !== null &&
      entry.bucket !== null &&
      entry.bucket === query.bucket,
  }));

  // Bucket first (strict), then similarity, then deterministic tie-breaks:
  // verification quality, then id, so two runs never disagree.
  scored.sort((a, b) => {
    if (a.sameBucket !== b.sameBucket) return a.sameBucket ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    const vr =
      verificationRank(b.entry.verificationStatus) -
      verificationRank(a.entry.verificationStatus);
    if (vr !== 0) return vr;
    return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
  });

  const perPrompt = new Map<string, number>();
  const examples: RetrievedGold[] = [];
  for (const s of scored) {
    if (examples.length >= k) break;
    const used = perPrompt.get(s.entry.promptId) ?? 0;
    if (used >= maxPerPrompt) continue;
    perPrompt.set(s.entry.promptId, used + 1);
    examples.push({
      id: s.entry.id,
      promptId: s.entry.promptId,
      promptRef: s.entry.promptRef,
      question: s.entry.promptText,
      answer: s.entry.answerText,
      bucket: s.entry.bucket,
      score: s.score,
      sameBucket: s.sameBucket,
    });
  }

  return {
    examples,
    poolSize: pool.length,
    eligibleSize: eligible.length,
    excluded,
    holdoutSourcesAllowed,
  };
}

/**
 * Retrieved gold as prior chat turns. Every provider wired in providers.ts
 * takes multi-turn messages, so exemplars are modeled as real turns rather than
 * pasted into the system prompt - the strongest known lever for holding output
 * in the target language.
 *
 * Oldest/weakest match first so the closest exemplar sits nearest the real
 * question, which is where recency helps it most.
 */
export function buildGoldExampleTurns(
  examples: RetrievedGold[],
  currentUserMessage?: string,
): { role: "user" | "assistant"; content: string }[] {
  const current = (currentUserMessage ?? "").trim();
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const ex of [...examples].reverse()) {
    // Belt and braces over the promptId-level guard: never echo the answer to
    // the exact question being graded, even if ids somehow disagreed.
    if (current.length > 0 && ex.question.trim() === current) continue;
    turns.push({ role: "user", content: ex.question });
    turns.push({ role: "assistant", content: ex.answer });
  }
  return turns;
}
