import type { PrismaClient } from "@prisma/client";
import { chrfMulti } from "@/lib/eval/chrf";
import { stripAnswer } from "@/lib/eval/answer-strip";
import {
  buildProtectedSet,
  filterAssembled,
  leakFreePrompts,
  type LeakHit,
} from "@/lib/eval/leak-guard";

/**
 * Live metrics for the "How it works" page.
 *
 * Everything here is computed from the database AT REQUEST TIME - no cached
 * scores, no hardcoded counts. The project has been burned repeatedly by
 * stale numbers surviving in prose after the data moved, so this module is
 * the page's only source of figures: pure JS over well under 2,000 rows,
 * cheap enough to run per request.
 *
 * The scoring path deliberately composes the SAME pure functions as
 * scripts/leak-audit.ts (chrfMulti, stripAnswer, buildProtectedSet,
 * filterAssembled, leakFreePrompts), so a number on the page and a number in
 * the audit CLI can never come from two implementations of "stripped chrF on
 * the leak-free subset".
 *
 * Prisma is injected so the whole thing is unit-testable with a recorder
 * fake - the same pattern as collectEvalBundle (src/lib/eval/collect.test.ts).
 */

// ─── shapes ─────────────────────────────────────────────────────────────────

/** Corpus-wide counts, all excluding demo rows where the flag exists. */
export interface CorpusCounts {
  goldAnswers: number;
  pairwiseComparisons: number;
  /** "Both inadequate" verdicts, for the live no-preference rate. */
  pairwiseBothInadequate: number;
  parallelPairs: number;
  lexEntries: number;
  /** Distinct real contributors - seed @test.com accounts excluded, same rule
   * and same reason as GET /api/public/stats. */
  annotators: number;
}

/** The frozen benchmark and what the leak audit says about it. */
export interface BenchmarkShape {
  frozenPrompts: number;
  promptsWithGold: number;
  /** Frozen prompts whose OWN gold appeared in a served context. */
  leakedPrompts: number;
  leakFreePrompts: number;
}

/** One leave-one-out inter-gold ceiling, on all prompts and the clean subset. */
export interface CeilingResult {
  /** Mean chrF x100 across frozen prompts with >= 2 golds; null when none. */
  chrfAll: number | null;
  /** Same, restricted to the leak-free subset. */
  chrfClean: number | null;
  nPromptsAll: number;
  nPromptsClean: number;
}

export type Approach =
  | "untouched"
  | "retrieval v1"
  | "retrieval v2"
  | "retrieval v3"
  | "fine-tuned"
  | "other";

/** One scoreboard row: a non-archived candidate scored both ways. */
export interface CandidateScore {
  name: string;
  approach: Approach;
  /** Outputs scored (frozen prompts with gold). */
  n: number;
  nClean: number;
  /** Stripped chrF x100, all frozen prompts with gold. */
  strippedChrfAll: number | null;
  /** Stripped chrF x100, leak-free subset only - the honest column. */
  strippedChrfClean: number | null;
}

export interface MethodMetrics {
  computedAt: string;
  corpus: CorpusCounts;
  benchmark: BenchmarkShape;
  ceilings: {
    /** Every stored gold counted, including repeat submissions by the same
     * person - the inflated number the harness originally shipped. */
    asShipped: CeilingResult;
    /** One answer per annotator per prompt (each person's first). The honest
     * inter-SPEAKER ceiling: a repeat submission is not a second speaker. */
    onePerAnnotator: CeilingResult;
  };
  /** Sorted by leak-free score, best first; unscoreable rows last. */
  candidates: CandidateScore[];
}

// ─── pure helpers (exported for tests) ──────────────────────────────────────

/**
 * Human-readable method label from candidate metadata. versionLabel="rag-v2"
 * / "rag-v3" is how the serving routes themselves distinguish those paths
 * (see scripts/register-rag-v2.ts and scripts/register-rag-v3.ts), so the
 * scoreboard branches on the same field rather than on a name convention
 * that could drift.
 */
export function approachLabel(
  kind: string,
  versionLabel: string | null,
): Approach {
  if (kind === "baseline") return "untouched";
  if (kind === "rag") {
    if (versionLabel === "rag-v3") return "retrieval v3";
    return versionLabel === "rag-v2" ? "retrieval v2" : "retrieval v1";
  }
  if (kind === "sft" || kind === "dpo") return "fine-tuned";
  return "other";
}

export interface GoldRow {
  promptSlug: string;
  answerText: string;
  annotatorId: string;
  createdAt: Date;
}

/**
 * Keep each annotator's FIRST answer per prompt. This is the deduplication
 * that separates "two speakers agree" from "one speaker repeats themselves":
 * with it off, the shipped ceiling counted 58 same-annotator exact duplicates
 * as inter-speaker agreement and printed 63.2 where the honest figure is ~46
 * (tasks/latest-learnings-2026-08-09.md, section 1).
 */
export function onePerAnnotator(rows: GoldRow[]): GoldRow[] {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const seen = new Set<string>();
  const out: GoldRow[] = [];
  for (const r of sorted) {
    const key = `${r.promptSlug}::${r.annotatorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Leave-one-out inter-gold chrF, aggregated the way the eval harness does it
 * (src/lib/eval/reference.ts interGoldAgreement + runner.ts): per prompt,
 * hold out each gold in turn and score it against the rest with the
 * best-of-references rule; average the draws per prompt; average prompts.
 */
export function looCeilingChrf(goldsByPrompt: Map<string, string[]>): {
  mean: number | null;
  nPrompts: number;
} {
  const perPrompt: number[] = [];
  for (const golds of goldsByPrompt.values()) {
    if (golds.length < 2) continue;
    const draws: number[] = [];
    for (let i = 0; i < golds.length; i++) {
      const rest = golds.filter((_, j) => j !== i);
      draws.push(chrfMulti(golds[i], rest).best * 100);
    }
    perPrompt.push(avg(draws));
  }
  return {
    mean: perPrompt.length > 0 ? avg(perPrompt) : null,
    nPrompts: perPrompt.length,
  };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function avgOrNull(xs: number[]): number | null {
  return xs.length > 0 ? avg(xs) : null;
}

/**
 * ragContextIds mixes bare RagEntry ids with prefixed `gold:` / `lex:` / `pp:`
 * ids. Mirrors splitContextIds in scripts/leak-audit.ts (src cannot import
 * from scripts): joining the raw array to one table resolves only a third of
 * the served pieces and under-reports leakage badly, so the split is explicit.
 */
export function splitServedIds(ids: string[]): {
  ragEntryIds: string[];
  goldIds: string[];
  lexIds: string[];
  pairIds: string[];
} {
  const ragEntryIds: string[] = [];
  const goldIds: string[] = [];
  const lexIds: string[] = [];
  const pairIds: string[] = [];
  for (const id of ids) {
    if (id.startsWith("gold:")) goldIds.push(id.slice("gold:".length));
    else if (id.startsWith("lex:")) lexIds.push(id.slice("lex:".length));
    else if (id.startsWith("pp:")) pairIds.push(id.slice("pp:".length));
    else ragEntryIds.push(id);
  }
  return { ragEntryIds, goldIds, lexIds, pairIds };
}

// ─── the computation ────────────────────────────────────────────────────────

/** Same seed-account exclusion, same reason, as /api/public/stats: counting a
 * bring-up test login as a community contributor overstates a language
 * community on a page meant for its members. */
const SEED_ACCOUNT_EMAIL_SUFFIX = "@test.com";
const REAL_CONTRIBUTOR = {
  annotator: { email: { not: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } } },
} as const;

export async function computeMethodMetrics(
  prisma: PrismaClient,
): Promise<MethodMetrics> {
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true },
  });
  const frozenIds = frozen.map((p) => p.id);
  const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));

  const [
    golds,
    outputs,
    goldAnswers,
    pairwiseComparisons,
    pairwiseBothInadequate,
    parallelPairs,
    lexEntries,
    pairwiseAnnotators,
    coldAnnotators,
    editAnnotators,
  ] = await Promise.all([
    // The ONE benchmark-gold read. consentBenchmark is enforced in the query,
    // never downstream - the same consent rule collect.ts carries, for the
    // same reason: 8 real speakers withheld this permission.
    prisma.coldAuthorAnswer.findMany({
      where: {
        promptId: { in: frozenIds },
        isDemo: false,
        consentBenchmark: true,
      },
      select: {
        promptId: true,
        answerText: true,
        annotatorId: true,
        createdAt: true,
      },
    }),
    // ALL stored frozen-bank outputs, archived candidates included: a prompt
    // whose answer key was ever served is compromised no matter which
    // candidate it was served to. Archived rows are excluded from the
    // scoreboard below, not from leak detection.
    prisma.modelOutput.findMany({
      where: { promptId: { in: frozenIds }, isDemo: false },
      select: {
        promptId: true,
        outputText: true,
        ragContextIds: true,
        candidateModel: {
          select: {
            name: true,
            kind: true,
            versionLabel: true,
            archived: true,
          },
        },
      },
    }),
    prisma.coldAuthorAnswer.count({ where: { isDemo: false } }),
    prisma.pairwiseComparison.count({ where: { isDemo: false } }),
    prisma.pairwiseComparison.count({
      where: { isDemo: false, winner: "both_inadequate" },
    }),
    prisma.parallelPair.count(),
    prisma.lexEntry.count(),
    prisma.pairwiseComparison.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.outputEdit.findMany({
      where: { isDemo: false, ...REAL_CONTRIBUTOR },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
  ]);

  const annotators = new Set<string>([
    ...pairwiseAnnotators.map((r) => r.annotatorId),
    ...coldAnnotators.map((r) => r.annotatorId),
    ...editAnnotators.map((r) => r.annotatorId),
  ]).size;

  // The gold query is already scoped to frozen prompt ids, so every row
  // resolves; the fallback only guards against a race with a concurrent
  // prompt edit.
  const goldRows: GoldRow[] = golds.map((g) => ({
    promptSlug: slugOf.get(g.promptId) ?? g.promptId,
    answerText: g.answerText,
    annotatorId: g.annotatorId,
    createdAt: g.createdAt,
  }));

  const goldBySlug = new Map<string, string[]>();
  for (const g of goldRows) {
    const list = goldBySlug.get(g.promptSlug) ?? [];
    list.push(g.answerText);
    goldBySlug.set(g.promptSlug, list);
  }

  // ── leak detection over the ASSEMBLED served context ──────────────────────
  // Every id family is resolved to the text that was actually served, because
  // the v1 hole was precisely that id-level bookkeeping missed content-level
  // leaks (scripts/leak-audit.ts documents the composition).
  const allRagIds = new Set<string>();
  const allGoldIds = new Set<string>();
  const allLexIds = new Set<string>();
  const allPairIds = new Set<string>();
  for (const o of outputs) {
    const s = splitServedIds(o.ragContextIds);
    s.ragEntryIds.forEach((i) => allRagIds.add(i));
    s.goldIds.forEach((i) => allGoldIds.add(i));
    s.lexIds.forEach((i) => allLexIds.add(i));
    s.pairIds.forEach((i) => allPairIds.add(i));
  }

  const [ragRows, exemplarRows, lexRows, pairRows] = await Promise.all([
    prisma.ragEntry.findMany({
      where: { id: { in: [...allRagIds] } },
      select: { id: true, content: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { id: { in: [...allGoldIds] } },
      select: { id: true, answerText: true },
    }),
    prisma.lexEntry.findMany({
      where: { id: { in: [...allLexIds] } },
      select: { id: true, headword: true, gloss: true },
    }),
    prisma.parallelPair.findMany({
      where: { id: { in: [...allPairIds] } },
      select: { id: true, igala: true, english: true },
    }),
  ]);
  const ragById = new Map(ragRows.map((r) => [r.id, r.content]));
  const exemplarById = new Map(exemplarRows.map((r) => [r.id, r.answerText]));
  const lexById = new Map(
    lexRows.map((r) => [r.id, `${r.headword} ${r.gloss}`]),
  );
  const pairById = new Map(
    pairRows.map((r) => [r.id, `${r.english}\n${r.igala}`]),
  );

  const protectedSet = buildProtectedSet(
    goldRows.map((g) => ({ promptId: g.promptSlug, answerText: g.answerText })),
  );

  const hits: LeakHit[] = [];
  for (const o of outputs) {
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const s = splitServedIds(o.ragContextIds);
    const pieces = [
      ...s.ragEntryIds.map((id) => ({
        where: `rag:${id}`,
        text: ragById.get(id) ?? "",
      })),
      ...s.goldIds.map((id) => ({
        where: `exemplar:${id}`,
        text: exemplarById.get(id) ?? "",
      })),
      ...s.lexIds.map((id) => ({
        where: `lex:${id}`,
        text: lexById.get(id) ?? "",
      })),
      ...s.pairIds.map((id) => ({
        where: `pp:${id}`,
        text: pairById.get(id) ?? "",
      })),
    ].filter((p) => p.text);
    const { report } = filterAssembled(slug, pieces, protectedSet);
    if (!report.pass) hits.push(...report.hits);
  }
  const clean = leakFreePrompts(
    frozen.map((p) => p.promptId),
    hits,
  );
  const cleanSet = new Set(clean);

  // ── per-candidate stripped chrF, both ways ────────────────────────────────
  const byCandidate = new Map<
    string,
    {
      kind: string;
      versionLabel: string | null;
      scores: { slug: string; str: number }[];
    }
  >();
  for (const o of outputs) {
    const cm = o.candidateModel;
    if (!cm || cm.archived) continue;
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const refs = goldBySlug.get(slug);
    if (!refs || refs.length === 0) continue;
    const str = chrfMulti(stripAnswer(o.outputText).stripped, refs).best * 100;
    const entry = byCandidate.get(cm.name) ?? {
      kind: cm.kind,
      versionLabel: cm.versionLabel,
      scores: [],
    };
    entry.scores.push({ slug, str });
    byCandidate.set(cm.name, entry);
  }

  const candidates: CandidateScore[] = [...byCandidate.entries()]
    .map(([name, c]) => {
      const cleanScores = c.scores.filter((s) => cleanSet.has(s.slug));
      return {
        name,
        approach: approachLabel(c.kind, c.versionLabel),
        n: c.scores.length,
        nClean: cleanScores.length,
        strippedChrfAll: avgOrNull(c.scores.map((s) => s.str)),
        strippedChrfClean: avgOrNull(cleanScores.map((s) => s.str)),
      };
    })
    .sort(
      (a, b) =>
        (b.strippedChrfClean ?? Number.NEGATIVE_INFINITY) -
        (a.strippedChrfClean ?? Number.NEGATIVE_INFINITY),
    );

  // ── the two ceilings ──────────────────────────────────────────────────────
  const ceilingFor = (rows: GoldRow[]): CeilingResult => {
    const bySlug = new Map<string, string[]>();
    for (const g of rows) {
      const list = bySlug.get(g.promptSlug) ?? [];
      list.push(g.answerText);
      bySlug.set(g.promptSlug, list);
    }
    const all = looCeilingChrf(bySlug);
    const cleanOnly = new Map(
      [...bySlug.entries()].filter(([slug]) => cleanSet.has(slug)),
    );
    const cleanRes = looCeilingChrf(cleanOnly);
    return {
      chrfAll: all.mean,
      chrfClean: cleanRes.mean,
      nPromptsAll: all.nPrompts,
      nPromptsClean: cleanRes.nPrompts,
    };
  };

  return {
    computedAt: new Date().toISOString(),
    corpus: {
      goldAnswers,
      pairwiseComparisons,
      pairwiseBothInadequate,
      parallelPairs,
      lexEntries,
      annotators,
    },
    benchmark: {
      frozenPrompts: frozen.length,
      promptsWithGold: goldBySlug.size,
      leakedPrompts: new Set(hits.map((h) => h.promptId)).size,
      leakFreePrompts: clean.length,
    },
    ceilings: {
      asShipped: ceilingFor(goldRows),
      onePerAnnotator: ceilingFor(onePerAnnotator(goldRows)),
    },
    candidates,
  };
}
