import { PrismaClient } from "@prisma/client";
import { chrfMulti } from "../src/lib/eval/chrf";
import { bootstrapMean } from "../src/lib/eval/stats";
import {
  buildProtectedSet,
  filterAssembled,
  leakFreePrompts,
  renderLexPieceForGuard,
  renderEditPieceForGuard,
  type LeakHit,
  type ProtectedString,
} from "../src/lib/eval/leak-guard";
import { stripAnswer, verbosityStats } from "../src/lib/eval/answer-strip";
import { correctionReason } from "../src/lib/arena/retrieval-v4";

/**
 * STEP 0 - re-score what we already have, before spending a cent on new arms.
 *
 * Two corrections are applied to every published number, and either one alone
 * changes the reading:
 *
 * 1. LEAKAGE. For each frozen prompt, resolve the context that was actually
 *    served (ModelOutput.ragContextIds) and check whether it contained that
 *    prompt's own gold answer. Prompts where it did cannot measure competence -
 *    they measure copying - so they are reported separately, with membership
 *    derived mechanically rather than hand-picked.
 *
 * 2. VERBOSITY. Models write ~64 words where speakers write ~7, and chrF is
 *    character overlap on a short target, so English packaging dominates the
 *    score. Report chrF on the stripped answer as the language number and the
 *    raw score as a format-compliance number, never one in place of the other.
 *
 * This spends nothing: it reads stored outputs and rescoring is local.
 *
 * The loading, leak-detection and scoring cores are exported so downstream
 * comparisons (scripts/sniff-test-v2.ts) rescore through the exact same code
 * path - a v1/v2 number that came from two implementations of "chrF on the
 * leak-free subset" would not be a comparison at all.
 *
 * Run: npx tsx --env-file=.env.local scripts/leak-audit.ts
 */

/**
 * ragContextIds mixes bare RagEntry ids with prefixed ids: `gold:<id>` for
 * ColdAuthorAnswer exemplars (v1 and v2), `lex:<LexEntryId>` /
 * `pp:<ParallelPairId>` on the v2 serving path, and `edit:<OutputEditId>` for
 * corrections (v4+). Joining the raw array to RagEntry resolves only a
 * fraction of them and under-reports leakage badly, so the split is done
 * here once, explicitly. `edit:` was added for finding 18
 * (tasks/project-audit-2026-09-01.md): 210 of 215 v4/v4.1 frozen outputs
 * carry edit: ids that a splitter checking only gold/lex/pp silently drops.
 */
export function splitContextIds(ids: string[]): {
  ragEntryIds: string[];
  goldIds: string[];
  lexIds: string[];
  pairIds: string[];
  editIds: string[];
} {
  const ragEntryIds: string[] = [];
  const goldIds: string[] = [];
  const lexIds: string[] = [];
  const pairIds: string[] = [];
  const editIds: string[] = [];
  for (const id of ids) {
    if (id.startsWith("gold:")) goldIds.push(id.slice("gold:".length));
    else if (id.startsWith("lex:")) lexIds.push(id.slice("lex:".length));
    else if (id.startsWith("pp:")) pairIds.push(id.slice("pp:".length));
    else if (id.startsWith("edit:")) editIds.push(id.slice("edit:".length));
    else ragEntryIds.push(id);
  }
  return { ragEntryIds, goldIds, lexIds, pairIds, editIds };
}

/** One stored frozen-bank output plus who produced it. */
export interface AuditedOutput {
  id: string;
  promptId: string;
  outputText: string;
  ragContextIds: string[];
  candidateName: string | null;
}

/** Everything the audit and the rescore need, loaded once. */
export interface LeakAuditData {
  frozen: {
    id: string;
    promptId: string;
    text: string;
    bucket: string | null;
  }[];
  /** Prompt cuid -> human slug (ig_bank_orth_001 ...). */
  slugOf: Map<string, string>;
  /** Prompt cuid -> benchmark gold answers. */
  goldByPrompt: Map<string, string[]>;
  protectedSet: ProtectedString[];
  outputs: AuditedOutput[];
  /** Slugs of prompts whose own gold appeared in ANY served context. */
  leakedPrompts: Set<string>;
  /** Slugs still scoreable honestly - the leak-free subset. */
  clean: string[];
  hits: LeakHit[];
}

/**
 * Load the frozen bank, its gold, every stored output, and run per-prompt
 * leak detection over each output's ASSEMBLED context. All four id families
 * are resolved to the text that was actually served (RagEntry content, gold
 * answer text, LexEntry headword+gloss, ParallelPair both faces), because the
 * v1 hole was precisely that id-level bookkeeping missed content-level leaks.
 */
export async function loadLeakAudit(
  prisma: PrismaClient,
): Promise<LeakAuditData> {
  // ── the frozen benchmark and its gold ────────────────────────────────────
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true, text: true, bucket: true },
  });
  const frozenIds = new Set(frozen.map((p) => p.id));
  const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));

  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: [...frozenIds] },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  const goldByPrompt = new Map<string, string[]>();
  for (const g of golds) {
    const list = goldByPrompt.get(g.promptId) ?? [];
    list.push(g.answerText);
    goldByPrompt.set(g.promptId, list);
  }

  const protectedSet = buildProtectedSet(
    golds.map((g) => ({
      promptId: slugOf.get(g.promptId) ?? g.promptId,
      answerText: g.answerText,
    })),
  );

  // ── resolve the context actually served, per output ──────────────────────
  const outputs: AuditedOutput[] = (
    await prisma.modelOutput.findMany({
      where: { promptId: { in: [...frozenIds] }, isDemo: false },
      select: {
        id: true,
        promptId: true,
        outputText: true,
        ragContextIds: true,
        candidateModel: { select: { name: true } },
      },
    })
  ).map((o) => ({
    id: o.id,
    promptId: o.promptId,
    outputText: o.outputText,
    ragContextIds: o.ragContextIds,
    candidateName: o.candidateModel?.name ?? null,
  }));

  const allRagIds = new Set<string>();
  const allGoldIds = new Set<string>();
  const allLexIds = new Set<string>();
  const allPairIds = new Set<string>();
  const allEditIds = new Set<string>();
  for (const o of outputs) {
    const { ragEntryIds, goldIds, lexIds, pairIds, editIds } = splitContextIds(
      o.ragContextIds,
    );
    ragEntryIds.forEach((i) => allRagIds.add(i));
    goldIds.forEach((i) => allGoldIds.add(i));
    lexIds.forEach((i) => allLexIds.add(i));
    pairIds.forEach((i) => allPairIds.add(i));
    editIds.forEach((i) => allEditIds.add(i));
  }
  const ragRows = await prisma.ragEntry.findMany({
    where: { id: { in: [...allRagIds] } },
    select: { id: true, topic: true, content: true },
  });
  const ragById = new Map(ragRows.map((r) => [r.id, r]));
  const exemplarRows = await prisma.coldAuthorAnswer.findMany({
    where: { id: { in: [...allGoldIds] } },
    select: { id: true, answerText: true },
  });
  const exemplarById = new Map(exemplarRows.map((r) => [r.id, r]));
  const lexRows = await prisma.lexEntry.findMany({
    where: { id: { in: [...allLexIds] } },
    select: { id: true, headword: true, gloss: true },
  });
  const lexById = new Map(lexRows.map((r) => [r.id, r]));
  const pairRows = await prisma.parallelPair.findMany({
    where: { id: { in: [...allPairIds] } },
    select: { id: true, igala: true, english: true },
  });
  const pairById = new Map(pairRows.map((r) => [r.id, r]));
  const editRows = await prisma.outputEdit.findMany({
    where: { id: { in: [...allEditIds] } },
    select: {
      id: true,
      originalText: true,
      correctedText: true,
      rationale: true,
      segments: true,
    },
  });
  const editById = new Map(editRows.map((r) => [r.id, r]));

  // ── per-prompt leak detection over the ASSEMBLED context ─────────────────
  const hits: LeakHit[] = [];
  const leakedPrompts = new Set<string>();
  for (const o of outputs) {
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const { ragEntryIds, goldIds, lexIds, pairIds, editIds } = splitContextIds(
      o.ragContextIds,
    );
    // Each piece is reconstructed the way it was SERVED: same faces, same
    // concatenation as the serving path (retrieval-v2.ts / retrieval-v4.ts
    // build the identical strings for their own build-time guards, so a hit
    // here would mean a build-time guard failed - which is exactly what this
    // audit exists to catch). The dictionary line goes through
    // renderLexPieceForGuard (finding 19: toOrthography, not the raw
    // headword) and the correction goes through renderEditPieceForGuard
    // (finding 18), both shared with computeMethodMetrics so the two can
    // never disagree about what was served.
    const pieces = [
      ...ragEntryIds.map((id) => ({
        where: `rag:${id}`,
        text: ragById.get(id)?.content ?? "",
      })),
      ...goldIds.map((id) => ({
        where: `exemplar:${id}`,
        text: exemplarById.get(id)?.answerText ?? "",
      })),
      ...lexIds.map((id) => {
        const l = lexById.get(id);
        return {
          where: `lex:${id}`,
          text: l ? renderLexPieceForGuard(l.headword, l.gloss) : "",
        };
      }),
      ...pairIds.map((id) => {
        const p = pairById.get(id);
        return { where: `pp:${id}`, text: p ? `${p.english}\n${p.igala}` : "" };
      }),
      ...editIds.map((id) => {
        const e = editById.get(id);
        return {
          where: `edit:${id}`,
          text: e
            ? renderEditPieceForGuard(
                e.originalText,
                e.correctedText,
                correctionReason(e.segments, e.rationale),
              )
            : "",
        };
      }),
    ].filter((p) => p.text);
    const { report } = filterAssembled(slug, pieces, protectedSet);
    if (!report.pass) {
      hits.push(...report.hits);
      leakedPrompts.add(slug);
    }
  }

  const clean = leakFreePrompts(
    frozen.map((p) => p.promptId),
    hits,
  );

  return {
    frozen,
    slugOf,
    goldByPrompt,
    protectedSet,
    outputs,
    leakedPrompts,
    clean,
    hits,
  };
}

/** One output scored both ways against its prompt's gold. */
export interface ScoredOutput {
  slug: string;
  refs: string[];
  /** chrF x100 on the raw output - the format-compliance number. */
  raw: number;
  /** chrF x100 on the stripped output - the language number. */
  str: number;
  hyp: string;
}

/**
 * Score a candidate's outputs against gold, raw and stripped. Outputs whose
 * prompt has no gold are dropped (nothing to score against), same as before
 * the refactor.
 */
export function scoreOutputs(
  outs: { promptId: string; outputText: string }[],
  slugOf: Map<string, string>,
  goldByPrompt: Map<string, string[]>,
): ScoredOutput[] {
  return outs
    .map((o) => {
      const slug = slugOf.get(o.promptId);
      const refs = goldByPrompt.get(o.promptId) ?? [];
      if (!slug || refs.length === 0) return null;
      return {
        slug,
        refs,
        raw: chrfMulti(o.outputText, refs).best * 100,
        str: chrfMulti(stripAnswer(o.outputText).stripped, refs).best * 100,
        hyp: o.outputText,
      };
    })
    .filter((x): x is ScoredOutput => x !== null);
}

/** One table row: a candidate rescored four ways plus its verbosity. */
export interface RescoreRow {
  name: string;
  n: number;
  rawAll: number;
  strAll: number;
  rawClean: number;
  strClean: number;
  nClean: number;
  verbMedian: number;
  nonCompliant: boolean;
  ci: string;
}

/** Aggregate per-output scores into the printed row for one candidate. */
export function buildRescoreRow(
  name: string,
  scored: ScoredOutput[],
  cleanSet: Set<string>,
): RescoreRow {
  const cleanRows = scored.filter((s) => cleanSet.has(s.slug));
  const v = verbosityStats(
    scored.map((s) => ({ hypothesis: s.hyp, references: s.refs })),
  );
  const ciClean =
    cleanRows.length > 1 ? bootstrapMean(cleanRows.map((s) => s.str)) : null;
  return {
    name,
    n: scored.length,
    rawAll: avg(scored.map((s) => s.raw)),
    strAll: avg(scored.map((s) => s.str)),
    rawClean: avg(cleanRows.map((s) => s.raw)),
    strClean: avg(cleanRows.map((s) => s.str)),
    nClean: cleanRows.length,
    verbMedian: v.median,
    nonCompliant: v.formatNonCompliant,
    ci: ciClean ? `[${fmt(ciClean.ciLow)}-${fmt(ciClean.ciHigh)}]` : "",
  };
}

export function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "n/a";
}

export function printRescoreTable(rows: RescoreRow[]): void {
  console.log("── RESCORED ────────────────────────────────────────────────");
  console.log(
    "candidate".padEnd(38) +
      "n".padStart(4) +
      "rawAll".padStart(8) +
      "strAll".padStart(8) +
      "  |" +
      "rawLF".padStart(7) +
      "strLF".padStart(7) +
      "  95% CI (strLF)".padEnd(20) +
      "verb×".padStart(7),
  );
  for (const r of rows) {
    console.log(
      r.name.slice(0, 37).padEnd(38) +
        String(r.n).padStart(4) +
        fmt(r.rawAll).padStart(8) +
        fmt(r.strAll).padStart(8) +
        "  |" +
        fmt(r.rawClean).padStart(7) +
        fmt(r.strClean).padStart(7) +
        `  ${r.ci}`.padEnd(20) +
        (fmt(r.verbMedian) + (r.nonCompliant ? " !" : "  ")).padStart(7),
    );
  }
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const audit = await loadLeakAudit(prisma);
    console.log(
      `frozen prompts: ${audit.frozen.length}  gold answers: ${[...audit.goldByPrompt.values()].flat().length}  protected strings: ${audit.protectedSet.length}\n`,
    );

    const allSlugs = audit.frozen.map((p) => p.promptId);
    console.log("── LEAK AUDIT ──────────────────────────────────────────────");
    console.log(
      `prompts whose OWN gold was in their served context: ${audit.leakedPrompts.size}/${allSlugs.length} (${((100 * audit.leakedPrompts.size) / allSlugs.length).toFixed(1)}%)`,
    );
    console.log(`leak-free subset: ${audit.clean.length} prompts\n`);

    // ── rescore every candidate four ways ──────────────────────────────────
    const byCandidate = new Map<string, AuditedOutput[]>();
    for (const o of audit.outputs) {
      // candidateName is null when the output outlived a deleted candidate.
      // Skip those rather than crashing an audit that must be runnable against
      // whatever is in the table.
      if (!o.candidateName) continue;
      byCandidate.set(o.candidateName, [
        ...(byCandidate.get(o.candidateName) ?? []),
        o,
      ]);
    }

    const cleanSet = new Set(audit.clean);
    const rows: RescoreRow[] = [];
    for (const [name, outs] of byCandidate) {
      const scored = scoreOutputs(outs, audit.slugOf, audit.goldByPrompt);
      if (scored.length === 0) continue;
      rows.push(buildRescoreRow(name, scored, cleanSet));
    }
    rows.sort((a, b) => b.strClean - a.strClean);

    printRescoreTable(rows);
    console.log(
      `\nrawAll/strAll = all ${allSlugs.length} frozen prompts; rawLF/strLF = the ${audit.clean.length} leak-free ones.`,
    );
    console.log(
      "str = English packaging stripped. verb× = median output length / shortest gold; ! = >1.5, chrF not interpretable as a language result.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Import-safe: the audit runs only when this file is the entrypoint, so
// sniff-test-v2.ts can import the core without triggering a full audit run.
if (process.argv[1]?.endsWith("leak-audit.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
