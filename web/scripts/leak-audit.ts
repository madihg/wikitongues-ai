import { PrismaClient } from "@prisma/client";
import { chrfMulti } from "../src/lib/eval/chrf";
import { bootstrapMean } from "../src/lib/eval/stats";
import {
  buildProtectedSet,
  filterAssembled,
  leakFreePrompts,
  type LeakHit,
} from "../src/lib/eval/leak-guard";
import { stripAnswer, verbosityStats } from "../src/lib/eval/answer-strip";

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
 * Run: npx tsx --env-file=.env.local scripts/leak-audit.ts
 */

const prisma = new PrismaClient();

/**
 * ragContextIds mixes bare RagEntry ids with `gold:<ColdAuthorAnswerId>`.
 * Joining the raw array to RagEntry resolves only a third of them and
 * under-reports leakage badly, so the split is done here once, explicitly.
 */
function splitContextIds(ids: string[]): {
  ragEntryIds: string[];
  goldIds: string[];
} {
  const ragEntryIds: string[] = [];
  const goldIds: string[] = [];
  for (const id of ids) {
    if (id.startsWith("gold:")) goldIds.push(id.slice("gold:".length));
    else ragEntryIds.push(id);
  }
  return { ragEntryIds, goldIds };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "n/a";
}

async function main() {
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
  console.log(
    `frozen prompts: ${frozen.length}  gold answers: ${golds.length}  protected strings: ${protectedSet.length}\n`,
  );

  // ── resolve the context actually served, per output ──────────────────────
  const outputs = await prisma.modelOutput.findMany({
    where: { promptId: { in: [...frozenIds] }, isDemo: false },
    select: {
      id: true,
      promptId: true,
      outputText: true,
      ragContextIds: true,
      candidateModel: { select: { name: true, ragEnabled: true } },
    },
  });

  const allRagIds = new Set<string>();
  const allGoldIds = new Set<string>();
  for (const o of outputs) {
    const { ragEntryIds, goldIds } = splitContextIds(o.ragContextIds);
    ragEntryIds.forEach((i) => allRagIds.add(i));
    goldIds.forEach((i) => allGoldIds.add(i));
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

  // ── per-prompt leak detection over the ASSEMBLED context ─────────────────
  const hits: LeakHit[] = [];
  const leakedPrompts = new Set<string>();
  for (const o of outputs) {
    const slug = slugOf.get(o.promptId);
    if (!slug) continue;
    const { ragEntryIds, goldIds } = splitContextIds(o.ragContextIds);
    const pieces = [
      ...ragEntryIds.map((id) => ({
        where: `rag:${id}`,
        text: ragById.get(id)?.content ?? "",
      })),
      ...goldIds.map((id) => ({
        where: `exemplar:${id}`,
        text: exemplarById.get(id)?.answerText ?? "",
      })),
    ].filter((p) => p.text);
    const { report } = filterAssembled(slug, pieces, protectedSet);
    if (!report.pass) {
      hits.push(...report.hits);
      leakedPrompts.add(slug);
    }
  }

  const allSlugs = frozen.map((p) => p.promptId);
  const clean = leakFreePrompts(allSlugs, hits);
  console.log("── LEAK AUDIT ──────────────────────────────────────────────");
  console.log(
    `prompts whose OWN gold was in their served context: ${leakedPrompts.size}/${allSlugs.length} (${((100 * leakedPrompts.size) / allSlugs.length).toFixed(1)}%)`,
  );
  console.log(`leak-free subset: ${clean.length} prompts\n`);

  // ── rescore every candidate four ways ────────────────────────────────────
  const byCandidate = new Map<string, typeof outputs>();
  for (const o of outputs) {
    // candidateModel is nullable in the schema: outputs can outlive a deleted
    // candidate. Skip those rather than crashing an audit that must be runnable
    // against whatever is in the table.
    const k = o.candidateModel?.name;
    if (!k) continue;
    byCandidate.set(k, [...(byCandidate.get(k) ?? []), o]);
  }

  const cleanSet = new Set(clean);
  type Row = {
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
  };
  const rows: Row[] = [];

  for (const [name, outs] of byCandidate) {
    const scored = outs
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
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (scored.length === 0) continue;

    const cleanRows = scored.filter((s) => cleanSet.has(s.slug));
    const v = verbosityStats(
      scored.map((s) => ({ hypothesis: s.hyp, references: s.refs })),
    );
    const ciClean =
      cleanRows.length > 1 ? bootstrapMean(cleanRows.map((s) => s.str)) : null;

    rows.push({
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
    });
  }

  rows.sort((a, b) => b.strClean - a.strClean);

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
  console.log(
    `\nrawAll/strAll = all ${allSlugs.length} frozen prompts; rawLF/strLF = the ${clean.length} leak-free ones.`,
  );
  console.log(
    "str = English packaging stripped. verb× = median output length / shortest gold; ! = >1.5, chrF not interpretable as a language result.",
  );
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
