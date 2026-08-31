import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  contentWords,
  retrieveDictCandidates,
  renderDictionaryBlock,
  retrieveGuardedGold,
  wantsStructureExamples,
  PARALLEL_K,
  type RetrievalV2Prompt,
  type RetrievalV2Result,
  type ParallelRow,
} from "./retrieval-v2";
import {
  buildProtectedSet,
  filterAssembled,
  type LeakReport,
} from "@/lib/eval/leak-guard";
import { editReasonTagLabel } from "@/lib/failure-tags";

/**
 * SERVING PATH V4 - the v2/v3 retrieval composition plus two new levers,
 * both keyed on CandidateModel.versionLabel='rag-v4' so the v2 and v3 paths
 * stay byte-identical (they still call buildRetrievalV2; this module is only
 * reached by rag-v4 candidates).
 *
 *   1. SOURCE-DIVERSIFIED PARALLEL RETRIEVAL. ParallelPair holds 30,907 Bible
 *      verses (source 'BSN IGL70 ... bible'), and the permission harvest is
 *      expected to land a few hundred higher-register rows (JWAL example
 *      sentences, proverbs). Pure rank-by-ts_rank lets the 30,907 drown the
 *      200 every time - a register problem, not a relevance problem: the
 *      deduced grammar's section 13 (grade A) measures the Bible as a
 *      DIFFERENT register/orthography from the community voice the models
 *      must learn, and the v2 sniff run watched that register bleed straight
 *      into a farmer story ("Jihofa"). So up to NON_BIBLE_RESERVE of the
 *      PARALLEL_K slots are reserved for matching non-Bible pairs. With zero
 *      non-Bible rows in the store (today's state) the path degrades to
 *      exactly the v2 ranking.
 *
 *   2. CORRECTIONS RETRIEVAL. OutputEdit rows are native speakers fixing real
 *      model output - the platform's only worked-example channel of
 *      mistake -> repair. The editing ground (2026-08-25) stores span-level
 *      segments with per-span reasons; rows predating it carry only the
 *      original/corrected pair. Both render; the Reason line appears when the
 *      row can supply one. Train-split only (the edit's PROMPT must be
 *      isHoldout=false: an edit on a frozen prompt is gold-adjacent for that
 *      prompt), consentTraining honoured (an in-context demonstration shapes
 *      output the way a training row does - same rule as the gold pool), and
 *      every rendered piece passes the same leak guard as everything else.
 *
 * Everything the two new levers do NOT touch - dictionary lookup, gold
 * exemplars, the structure gate, the leak-guard mechanics - is imported from
 * retrieval-v2.ts rather than re-implemented, so the shared legs cannot
 * drift between paths.
 */

// ─── the v4 knobs ───────────────────────────────────────────────────────────

/**
 * Parallel-slot reservation for non-Bible sources, WHY: register. 30,907
 * Bible verses must not drown the few hundred higher-register rows the
 * harvest adds; two of PARALLEL_K=4 keeps the Bible majority (its volume IS
 * the structural signal) while guaranteeing the community-register shape is
 * present whenever any non-Bible pair matches the prompt at all.
 */
export const NON_BIBLE_RESERVE = 2;

/**
 * Corrections served per prompt. Three keeps the block a lesson, not a
 * lecture: each entry is a full original/corrected pair (up to ~1.2k chars),
 * and the ablation stance behind the whole path says retrieved DEMONSTRATIONS
 * carry the signal, so the corrections must never crowd out the dictionary
 * and gold exemplars that measurement already backs.
 */
export const CORRECTIONS_K = 3;

/**
 * Rows whose original or corrected side exceeds this are not served: past
 * this size the pair is a wholesale rewrite whose lesson does not survive
 * skimming, and truncating either side would desynchronize the mistake from
 * its repair. Measured 2026-08-28: the longest stored original is 359 chars,
 * so nothing currently falls to this cap.
 */
export const MAX_CORRECTION_CHARS = 600;

/**
 * A served Reason line is a hint, not an essay: annotator reasons are capped
 * at 2,000 chars in storage (REASON_MAX_CHARS), which would dwarf the
 * correction itself in the prompt.
 */
export const REASON_SERVE_MAX = 240;

// ─── static block headers (Scope A applies - see static-leak-check-v4.ts) ───

/**
 * v4 parallel header: the v2 header plus the register guard. WHY: the pairs
 * are (today, overwhelmingly) 1970s scripture orthography - bare ASCII, no
 * dots, fused elision (deduced grammar section 13, grade A) - while the
 * dictionary block serves standard orthography. The v2 sniff run measured
 * the bleed ("Jihofa" inside a farmer story). Shape is what the pairs teach;
 * spelling authority stays with the dictionary.
 */
export const PARALLEL_INTRO_V4 =
  "These Igala-English pairs show how Igala sentences are BUILT. Copy only the sentence SHAPE - word order, clause length, one thought per sentence. Spell every word as the DICTIONARY spells it, not as these pairs spell it: some pairs use an older scripture orthography.";

/** Header of the corrections block. */
export const CORRECTIONS_INTRO =
  "Native speakers corrected these model answers. Learn what each change fixes, and never repeat the original mistake:";

// ─── source diversity (pure, unit-tested) ───────────────────────────────────

/** A parallel row carrying its provenance, as the v4 SQL selects it. */
export interface RankedPair extends ParallelRow {
  source: string;
}

/**
 * Classifier for the reservation. MUST stay in lockstep with the SQL
 * predicate in buildRetrievalV4 (source !~* '(igl70|bible)'): the SQL decides
 * which rows the reserve QUERY may return, this decides how rows COUNT
 * against the reserve. The Bible rows' provenance string contains both
 * tokens ("BSN IGL70 via HF dalaone/eng_igl_bible"); any future scripture
 * ingest must keep one of them in its source string.
 */
export function isBibleSource(source: string): boolean {
  return /igl70|bible/i.test(source);
}

/**
 * Merge the general ranking with the non-Bible reserve.
 *
 * Contract: `general` is the plain ts_rank top-k (any source), `nonBible` the
 * ts_rank top-`reserve` restricted to non-Bible sources; both rank-ordered.
 * Up to `reserve` of the k slots end up non-Bible WHEN matches exist; Bible
 * rows are only ever displaced from the BOTTOM of the general ranking, so the
 * strongest Bible matches always survive. Added reserve rows go LAST, which
 * in the rendered block places the community-register shapes nearest the
 * question (the position measured strongest - same Cuconasu rationale as the
 * dictionary block). With no non-Bible matches the result IS `general`:
 * today's Bible-only store serves exactly the v2 ranking.
 */
export function diversifyParallel(
  general: RankedPair[],
  nonBible: RankedPair[],
  k: number = PARALLEL_K,
  reserve: number = NON_BIBLE_RESERVE,
): RankedPair[] {
  const base = general.slice(0, k);
  const have = base.filter((p) => !isBibleSource(p.source)).length;
  const inBase = new Set(base.map((p) => p.id));
  // Defensive source check: a mis-ingested row must not eat a reserve slot.
  const additions = nonBible
    .filter((p) => !inBase.has(p.id) && !isBibleSource(p.source))
    .slice(0, Math.max(0, reserve - have));
  if (additions.length === 0) return base;

  // Free exactly enough seats, dropping Bible rows from the bottom of the
  // ranking. Non-Bible rows already in base are never displaced - the
  // reservation exists to protect them.
  const overflow = base.length + additions.length - k;
  let toDrop = Math.max(0, overflow);
  const survivors: RankedPair[] = [];
  for (let i = base.length - 1; i >= 0; i--) {
    if (toDrop > 0 && isBibleSource(base[i].source)) {
      toDrop--;
      continue;
    }
    survivors.unshift(base[i]);
  }
  // toDrop can only remain > 0 if base held fewer Bible rows than the
  // overflow, which cannot happen: additions <= reserve - have, so overflow
  // never exceeds the Bible count. Trim defensively all the same.
  return [...survivors, ...additions].slice(0, k);
}

// ─── corrections retrieval (pure core, unit-tested) ─────────────────────────

/** One correction candidate after the query-side filters. */
export interface CorrectionCandidate {
  id: string;
  /** English text of the prompt the corrected output answered. */
  promptText: string;
  original: string;
  corrected: string;
  /** Composed reason, null when the row carries none. */
  reason: string | null;
}

/**
 * Compose the served Reason from what the row holds: the row-level rationale
 * first (the overall why), then each segment's free-text reason, then tag
 * labels for segments that carry only tags. Fragments are deduplicated (an
 * annotator tagging five spans "wrong word" is one lesson, not five) and the
 * whole line is capped at REASON_SERVE_MAX. Null when the row carries no
 * reason at all - the render then omits the Reason line rather than serving
 * an empty scaffold. Reads the envelope defensively: it is annotator-shaped
 * jsonb, and a malformed envelope must degrade to "no reason", never throw
 * (same rule the editing ground itself follows).
 */
export function correctionReason(
  segments: unknown,
  rationale: string | null,
): string | null {
  const fragments: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t.length > 0 && !fragments.includes(t)) fragments.push(t);
  };
  if (rationale) push(rationale);
  if (segments && typeof segments === "object" && !Array.isArray(segments)) {
    const raw = (segments as { segments?: unknown }).segments;
    if (Array.isArray(raw)) {
      for (const seg of raw) {
        if (!seg || typeof seg !== "object") continue;
        const s = seg as { reason?: unknown; reasonTags?: unknown };
        if (typeof s.reason === "string" && s.reason.trim()) {
          push(s.reason);
        } else if (Array.isArray(s.reasonTags)) {
          const labels = s.reasonTags
            .filter((t): t is string => typeof t === "string")
            .map(editReasonTagLabel);
          if (labels.length > 0) push(labels.join(", "));
        }
      }
    }
  }
  if (fragments.length === 0) return null;
  const joined = fragments.join("; ");
  return joined.length > REASON_SERVE_MAX
    ? `${joined.slice(0, REASON_SERVE_MAX)}...`
    : joined;
}

/**
 * Rank correction candidates by English-side prompt overlap: how many of the
 * serving prompt's content words the edit's prompt shares. Lexical overlap
 * for the same reason every retrieval leg here is lexical - the English side
 * is where the query has signal. Zero-overlap candidates are excluded
 * outright: a correction about eating served to a spelling question is pure
 * noise. Ties break on id for determinism (same audit-trail rule as the SQL
 * legs' `id ASC`).
 */
export function rankCorrections(
  promptWords: string[],
  candidates: CorrectionCandidate[],
  k: number = CORRECTIONS_K,
): CorrectionCandidate[] {
  const wanted = new Set(promptWords);
  return candidates
    .map((c) => ({
      c,
      overlap: contentWords(c.promptText).filter((w) => wanted.has(w)).length,
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) =>
      b.overlap !== a.overlap
        ? b.overlap - a.overlap
        : a.c.id < b.c.id
          ? -1
          : a.c.id > b.c.id
            ? 1
            : 0,
    )
    .slice(0, k)
    .map((x) => x.c);
}

/** Render the corrections block; "" when nothing survived. */
export function renderCorrectionsBlock(
  corrections: CorrectionCandidate[],
): string {
  if (corrections.length === 0) return "";
  return [
    CORRECTIONS_INTRO,
    ...corrections.map((c) =>
      [
        `A model wrote: ${c.original}`,
        `A speaker corrected it to: ${c.corrected}`,
        ...(c.reason ? [`Reason: ${c.reason}`] : []),
      ].join("\n"),
    ),
  ].join("\n\n");
}

// ─── the assembled result ───────────────────────────────────────────────────

export interface RetrievalV4Result extends RetrievalV2Result {
  /** Rendered corrections block, "" when nothing matched. */
  correctionsBlock: string;
}

/**
 * Build the full v4 retrieval context for one prompt. Prisma is injected for
 * the same reason as buildRetrievalV2: unit tests run against an in-memory
 * fake, no database.
 */
export async function buildRetrievalV4(
  prisma: PrismaClient,
  prompt: RetrievalV2Prompt,
): Promise<RetrievalV4Result> {
  const words = contentWords(prompt.text);

  // Slug -> cuid + the prompt's own benchmark gold for the leak guard's
  // protected set; identical resolution to buildRetrievalV2 (see its comment).
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

  // ── 1. DICTIONARY: the shared v2 leg, unchanged ──────────────────────────
  const dictCandidates = await retrieveDictCandidates(prisma, words);

  // ── 2. PARALLEL EXAMPLES: v2's FTS ranking + the non-Bible reservation ───
  // Same relaxed-OR plainto_tsquery as v2 (rationale in retrieval-v2.ts),
  // now selecting `source` so the merge can classify, plus a second bounded
  // query restricted to non-Bible provenance. The restriction predicate and
  // isBibleSource must stay in lockstep - see the classifier's comment.
  let pairRows: RankedPair[] = [];
  if (wantsStructureExamples(prompt.bucket, prompt.text)) {
    const general = await prisma.$queryRaw<RankedPair[]>(Prisma.sql`
    SELECT id, igala, english, source
    FROM wikitongues."ParallelPair"
    WHERE "englishTsv" @@ replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery
    ORDER BY ts_rank("englishTsv", replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery) DESC, id ASC
    LIMIT ${PARALLEL_K}
  `);
    const nonBible = await prisma.$queryRaw<RankedPair[]>(Prisma.sql`
    SELECT id, igala, english, source
    FROM wikitongues."ParallelPair"
    WHERE "englishTsv" @@ replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery
      AND source !~* '(igl70|bible)'
    ORDER BY ts_rank("englishTsv", replace(plainto_tsquery('english', ${prompt.text})::text, ' & ', ' | ')::tsquery) DESC, id ASC
    LIMIT ${NON_BIBLE_RESERVE}
  `);
    pairRows = diversifyParallel(general, nonBible);
  }

  // ── 3. GOLD EXEMPLARS: the shared v2 leg, unchanged ──────────────────────
  const gold = await retrieveGuardedGold(prisma, {
    promptId: promptRow?.id ?? prompt.promptId,
    text: prompt.text,
    bucket: prompt.bucket,
    isHoldout: prompt.isHoldout,
  });

  // ── 4. CORRECTIONS: OutputEdit rows, train-split prompts only ────────────
  // OutputEdit.promptId joins Prompt.id (the cuid) and carries no Prisma
  // relation, so the prompt rows are fetched in a second query and joined
  // here. The whole table is loaded (like the gold pool: hundreds of small
  // text rows at most) because the ranking signal - English prompt overlap -
  // is computed in TS where it is unit-testable.
  const editRows = await prisma.outputEdit.findMany({
    where: { isDemo: false, consentTraining: true },
    select: {
      id: true,
      promptId: true,
      originalText: true,
      correctedText: true,
      rationale: true,
      segments: true,
    },
  });
  const editPromptIds = [...new Set(editRows.map((e) => e.promptId))];
  const editPrompts =
    editPromptIds.length === 0
      ? []
      : await prisma.prompt.findMany({
          where: { id: { in: editPromptIds } },
          select: { id: true, text: true, isHoldout: true },
        });
  const editPromptById = new Map(editPrompts.map((p) => [p.id, p]));
  const correctionCandidates: CorrectionCandidate[] = [];
  for (const e of editRows) {
    const p = editPromptById.get(e.promptId);
    // Train-split only: an edit on a frozen prompt states that prompt's
    // correct answer (the corrections evidence doc excluded them for exactly
    // this reason). Self-exclusion mirrors the gold pool's rule 1: even a
    // train prompt must never be served its own correction.
    if (!p || p.isHoldout) continue;
    if (promptRow && e.promptId === promptRow.id) continue;
    // A no-op edit teaches nothing; an oversized pair is a rewrite whose
    // halves cannot be truncated independently (see MAX_CORRECTION_CHARS).
    if (e.originalText === e.correctedText) continue;
    if (
      e.originalText.length > MAX_CORRECTION_CHARS ||
      e.correctedText.length > MAX_CORRECTION_CHARS
    )
      continue;
    correctionCandidates.push({
      id: e.id,
      promptText: p.text,
      original: e.originalText,
      corrected: e.correctedText,
      reason: correctionReason(e.segments, e.rationale),
    });
  }
  const corrections = rankCorrections(words, correctionCandidates);

  // ── 5. LEAK GUARD over every piece, holdout prompts only ─────────────────
  // Identical mechanics to v2, with the corrections included: the guard
  // checks each piece's SERVED text - for a correction that is both faces of
  // the pair AND the reason, because an annotator's reason can quote the
  // right answer ("the correct word is ...").
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
      ...corrections.map((c) => ({
        where: `edit:${c.id}`,
        text: `${c.original}\n${c.corrected}\n${c.reason ?? ""}`,
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

  // ── 6. RENDER ────────────────────────────────────────────────────────────
  const keptDict = dictCandidates.filter((c) => kept(`lex:${c.sense.id}`));
  const { dictionaryBlock, dictIds } = renderDictionaryBlock(words, keptDict);

  const keptPairs = pairRows.filter((p) => kept(`pp:${p.id}`));
  const parallelBlock =
    keptPairs.length === 0
      ? ""
      : [
          PARALLEL_INTRO_V4,
          ...keptPairs.map((p) => `English: ${p.english}\nIgala: ${p.igala}`),
        ].join("\n\n");

  const keptCorrections = corrections.filter((c) => kept(`edit:${c.id}`));
  const correctionsBlock = renderCorrectionsBlock(keptCorrections);

  const keptGold = gold.filter((g) => kept(`gold:${g.id}`));
  // Weakest match first, so the closest exemplar sits nearest the real
  // question - same ordering rationale as v2.
  const exampleTurns = [...keptGold]
    .reverse()
    .map((g) => ({ question: g.question, answer: g.answer }));

  return {
    dictionaryBlock,
    exampleTurns,
    parallelBlock,
    correctionsBlock,
    contextIds: [
      ...dictIds,
      ...keptPairs.map((p) => `pp:${p.id}`),
      ...keptCorrections.map((c) => `edit:${c.id}`),
      ...keptGold.map((g) => `gold:${g.id}`),
    ],
    leakReport,
  };
}
