import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import {
  buildArenaMatrix,
  type PairwiseRow,
  type RubricRow,
} from "@/lib/arena/aggregate";
import { BUCKETS } from "@/lib/buckets";

/**
 * The arena leaderboard: a candidate x 8-bucket matrix ranked by human pairwise
 * (Bradley-Terry, per bucket), with rubric means and "not distinguishable" flags.
 */
export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const candidates = await prisma.candidateModel.findMany({
    where: { language: "igala", archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      family: true,
      kind: true,
      versionLabel: true,
      color: true,
      isChampion: true,
      ragEnabled: true,
    },
  });

  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  // Pairwise: map each comparison's two outputs to their candidates.
  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { isDemo: false },
    select: {
      winner: true,
      bucket: true,
      modelOutputA: { select: { candidateModelId: true, bucket: true } },
      modelOutputB: { select: { candidateModelId: true, bucket: true } },
    },
  });

  const pairwise: PairwiseRow[] = [];
  for (const c of comparisons) {
    const a = c.modelOutputA?.candidateModelId;
    const b = c.modelOutputB?.candidateModelId;
    if (!a || !b || a === b) continue;
    if (!candidateById.has(a) || !candidateById.has(b)) continue;
    pairwise.push({
      candidateA: a,
      candidateB: b,
      winner: c.winner === "a" || c.winner === "b" ? c.winner : "tie",
      bucket: c.bucket ?? c.modelOutputA?.bucket ?? null,
    });
  }

  // Rubric v2: one row per scored axis. N/A (null) scores are stored but
  // excluded from ranking math.
  const axisScores = await prisma.rubricAxisScore.findMany({
    where: { isDemo: false, score: { not: null } },
    select: {
      bucket: true,
      axis: true,
      score: true,
      modelOutput: { select: { candidateModelId: true, bucket: true } },
    },
  });

  const rubric: RubricRow[] = [];
  for (const r of axisScores) {
    const cid = r.modelOutput?.candidateModelId;
    if (!cid || !candidateById.has(cid) || r.score === null) continue;
    rubric.push({
      candidateId: cid,
      bucket: r.bucket ?? r.modelOutput?.bucket ?? null,
      axis: r.axis,
      score: r.score,
    });
  }

  const matrix = buildArenaMatrix(pairwise, rubric);

  // Shape the response as a candidate x bucket table the UI can render directly.
  const buckets = BUCKETS.map((b) => ({
    key: b.key,
    num: b.num,
    short: b.short,
    label: b.label,
  }));

  const rows = candidates.map((cand) => {
    const cells = BUCKETS.map((b) => {
      const bt = matrix.byBucket[b.key];
      const entry = bt?.candidates.find((c) => c.id === cand.id);
      const rubricMean = matrix.rubric[cand.id]?.[b.key]?.overall ?? null;
      return {
        bucket: b.key,
        strength: entry?.strength ?? null,
        ciLow: entry?.ciLow ?? null,
        ciHigh: entry?.ciHigh ?? null,
        rank: entry?.rank ?? null,
        games: entry?.games ?? 0,
        distinguishable: bt?.distinguishable ?? false,
        rubricMean,
      };
    });
    const overallEntry = matrix.overall.candidates.find(
      (c) => c.id === cand.id,
    );
    return {
      candidate: cand,
      overall: {
        strength: overallEntry?.strength ?? null,
        rank: overallEntry?.rank ?? null,
        games: overallEntry?.games ?? 0,
        distinguishable: matrix.overall.distinguishable,
        rubricMean: matrix.rubric[cand.id]?.["__overall__"]?.overall ?? null,
      },
      cells,
    };
  });

  // Order rows by overall rank (nulls last).
  rows.sort((a, b) => {
    const ra = a.overall.rank ?? Infinity;
    const rb = b.overall.rank ?? Infinity;
    return ra - rb;
  });

  return NextResponse.json({
    buckets,
    rows,
    totals: {
      candidates: candidates.length,
      pairwise: pairwise.length,
      rubric: rubric.length,
      overallDistinguishable: matrix.overall.distinguishable,
    },
  });
}
