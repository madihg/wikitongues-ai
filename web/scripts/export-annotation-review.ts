import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";

/**
 * Export what the speakers have said about the model, for designing the next
 * prompt bank. Read-only. Written 2026-10-08.
 *
 * What it writes (to --out <dir>):
 *   comparisons.json  every non-demo pairwise judgment with both answers, the
 *                     arm each came from, the winner, the explanation and the
 *                     failure tags
 *   edits.json        speaker corrections of model answers (TRAIN prompts only)
 *   gold.json         speaker-authored answers (TRAIN prompts only)
 *   prompts.json      the whole bank, with per-prompt counts; frozen prompts
 *                     carry isHoldout true so a new bank can be checked for
 *                     near-duplicates against them
 *   v44-train.json    the unjudged v4.4 train answers, to read against gold
 *   stats.json        win rates by arm, bucket, annotator, batch and tag
 *
 * SCOPE-A: no gold answer of a FROZEN prompt leaves the database here. Edits
 * and cold answers on isHoldout prompts are excluded by the query, not by a
 * later filter, so nothing downstream can forget to drop them. Annotators are
 * pseudonymised (annotator_N by first appearance).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/export-annotation-review.ts --out <dir>
 */

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--out");
  const out = at >= 0 ? argv[at + 1] : undefined;
  if (!out) throw new Error("usage: --out <dir>");
  mkdirSync(out, { recursive: true });

  const pseud = new Map<string, string>();
  const who = (id: string) => {
    if (!pseud.has(id)) pseud.set(id, `annotator_${pseud.size + 1}`);
    return pseud.get(id)!;
  };

  const prompts = await prisma.prompt.findMany({
    orderBy: { promptId: "asc" },
    select: {
      id: true,
      promptId: true,
      bucket: true,
      text: true,
      provenance: true,
      isHoldout: true,
      difficultyLevel: true,
      createdAt: true,
    },
  });
  // Older rows may carry the prompt code where newer ones carry the cuid.
  const byDbId = new Map(prompts.map((p) => [p.id, p]));
  for (const p of prompts) byDbId.set(p.promptId, p);

  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { isDemo: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      promptId: true,
      winner: true,
      confidence: true,
      explanation: true,
      failureTagsA: true,
      failureTagsB: true,
      annotatorId: true,
      createdAt: true,
      modelOutputA: {
        select: {
          id: true,
          promptId: true,
          outputText: true,
          repaired: true,
          candidateModel: { select: { slug: true, versionLabel: true } },
        },
      },
      modelOutputB: {
        select: {
          id: true,
          outputText: true,
          repaired: true,
          candidateModel: { select: { slug: true, versionLabel: true } },
        },
      },
    },
  });
  const cmp = comparisons.map((c) => {
    const p = byDbId.get(c.promptId) ?? byDbId.get(c.modelOutputA.promptId)!;
    return {
      id: c.id,
      promptId: p.promptId,
      bucket: p.bucket,
      isHoldout: p.isHoldout,
      prompt: p.text,
      winner: c.winner,
      confidence: c.confidence,
      explanation: c.explanation,
      failureTagsA: c.failureTagsA,
      failureTagsB: c.failureTagsB,
      annotator: who(c.annotatorId),
      createdAt: c.createdAt.toISOString(),
      batch: c.createdAt >= new Date("2026-09-13") ? "since_sep13" : "aug20_sep12",
      a: {
        slug: c.modelOutputA.candidateModel?.slug ?? null,
        label: c.modelOutputA.candidateModel?.versionLabel ?? null,
        text: c.modelOutputA.outputText,
        repaired: c.modelOutputA.repaired,
      },
      b: {
        slug: c.modelOutputB.candidateModel?.slug ?? null,
        label: c.modelOutputB.candidateModel?.versionLabel ?? null,
        text: c.modelOutputB.outputText,
        repaired: c.modelOutputB.repaired,
      },
    };
  });

  // TRAIN prompts only: the frozen gold never leaves the database.
  const edits = await prisma.outputEdit.findMany({
    where: { isDemo: false, modelOutput: { prompt: { isHoldout: false } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      promptId: true,
      originalText: true,
      correctedText: true,
      rationale: true,
      segments: true,
      provenance: true,
      annotatorId: true,
      createdAt: true,
      modelOutput: {
        select: { candidateModel: { select: { slug: true } } },
      },
    },
  });
  const ed = edits.map((e) => {
    const p = byDbId.get(e.promptId)!;
    return {
      id: e.id,
      promptId: p.promptId,
      bucket: p.bucket,
      prompt: p.text,
      arm: e.modelOutput.candidateModel?.slug ?? null,
      originalText: e.originalText,
      correctedText: e.correctedText,
      rationale: e.rationale,
      segments: e.segments,
      provenance: e.provenance,
      annotator: who(e.annotatorId),
      createdAt: e.createdAt.toISOString(),
    };
  });

  const gold = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, prompt: { isHoldout: false } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      promptId: true,
      answerText: true,
      englishGloss: true,
      dialect: true,
      annotatorId: true,
      createdAt: true,
    },
  });
  const go = gold.map((g) => {
    const p = byDbId.get(g.promptId)!;
    return {
      id: g.id,
      promptId: p.promptId,
      bucket: p.bucket,
      prompt: p.text,
      answerText: g.answerText,
      englishGloss: g.englishGloss,
      dialect: g.dialect,
      annotator: who(g.annotatorId),
      createdAt: g.createdAt.toISOString(),
    };
  });

  const v44 = await prisma.modelOutput.findMany({
    where: {
      isDemo: false,
      candidateModel: { slug: "gemini-3-1-pro-rag-v4-4" },
      prompt: { isHoldout: false },
    },
    select: {
      promptId: true,
      outputText: true,
      repaired: true,
      repairViolations: true,
    },
  });
  const v44Rows = v44.map((o) => {
    const p = byDbId.get(o.promptId)!;
    return {
      promptId: p.promptId,
      bucket: p.bucket,
      prompt: p.text,
      text: o.outputText,
      repaired: o.repaired,
      repairViolations: o.repairViolations,
    };
  });

  const nCmp = new Map<string, number>();
  const nGold = new Map<string, number>();
  for (const c of cmp) nCmp.set(c.promptId, (nCmp.get(c.promptId) ?? 0) + 1);
  for (const g of go) nGold.set(g.promptId, (nGold.get(g.promptId) ?? 0) + 1);
  const pr = prompts.map((p) => ({
    promptId: p.promptId,
    bucket: p.bucket,
    text: p.text,
    provenance: p.provenance,
    isHoldout: p.isHoldout,
    difficulty: p.difficultyLevel,
    comparisons: nCmp.get(p.promptId) ?? 0,
    goldAnswers: p.isHoldout ? null : (nGold.get(p.promptId) ?? 0),
  }));

  // Win rates: a verdict for an arm is win / loss / tie / both_inadequate.
  type Tally = { win: number; loss: number; tie: number; both: number };
  const tally = new Map<string, Tally>();
  const bump = (k: string, f: keyof Tally) => {
    const t = tally.get(k) ?? { win: 0, loss: 0, tie: 0, both: 0 };
    t[f]++;
    tally.set(k, t);
  };
  for (const c of cmp) {
    for (const side of ["a", "b"] as const) {
      const arm = c[side].slug ?? "?";
      const f: keyof Tally =
        c.winner === "both_inadequate"
          ? "both"
          : c.winner === "tie"
            ? "tie"
            : c.winner === side
              ? "win"
              : "loss";
      bump(`arm|${arm}`, f);
      bump(`arm+bucket|${arm}|${c.bucket}`, f);
      bump(`arm+batch|${arm}|${c.batch}`, f);
      bump(`arm+annotator|${arm}|${c.annotator}`, f);
    }
    bump(`bucket|${c.bucket}`, c.winner === "both_inadequate" ? "both" : c.winner === "tie" ? "tie" : "win");
  }
  const tags = new Map<string, number>();
  for (const c of cmp)
    for (const [side, ts] of [["a", c.failureTagsA], ["b", c.failureTagsB]] as const)
      for (const t of ts) {
        const k = `${c[side].slug}|${t}`;
        tags.set(k, (tags.get(k) ?? 0) + 1);
      }
  const stats = {
    exportedAt: new Date().toISOString(),
    counts: {
      prompts: pr.length,
      frozenPrompts: pr.filter((p) => p.isHoldout).length,
      comparisons: cmp.length,
      editsTrain: ed.length,
      goldTrain: go.length,
      v44Train: v44Rows.length,
      annotators: pseud.size,
    },
    tally: Object.fromEntries([...tally.entries()].sort()),
    failureTagsByArm: Object.fromEntries([...tags.entries()].sort()),
  };

  const w = (name: string, data: unknown) =>
    writeFileSync(join(out, name), JSON.stringify(data, null, 1));
  w("comparisons.json", cmp);
  w("edits.json", ed);
  w("gold.json", go);
  w("prompts.json", pr);
  w("v44-train.json", v44Rows);
  w("stats.json", stats);
  console.log(JSON.stringify(stats.counts));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
