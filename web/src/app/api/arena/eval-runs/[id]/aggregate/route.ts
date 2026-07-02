import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { BUCKET_KEYS } from "@/lib/buckets";
import type { EvalBucket, Prisma } from "@prisma/client";

/**
 * Aggregate one eval run: roll the human pairwise + rubric collected on this
 * run's outputs into per-bucket EvalScore rows and update the run's rollups.
 * Idempotent — re-running replaces the run's scores.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;
  const { id } = await params;

  const run = await prisma.evalRun.findUnique({ where: { id } });
  if (!run)
    return NextResponse.json({ error: "Eval run not found" }, { status: 404 });

  // Outputs this run generated.
  const outputs = await prisma.modelOutput.findMany({
    where: { evalRunId: id },
    select: { id: true, bucket: true },
  });
  const outputIds = outputs.map((o) => o.id);
  const bucketByOutput = new Map(outputs.map((o) => [o.id, o.bucket]));

  // Pairwise where this run's output is on either side.
  const comparisons = outputIds.length
    ? await prisma.pairwiseComparison.findMany({
        where: {
          OR: [
            { modelOutputAId: { in: outputIds } },
            { modelOutputBId: { in: outputIds } },
          ],
        },
        select: {
          modelOutputAId: true,
          modelOutputBId: true,
          winner: true,
          bucket: true,
        },
      })
    : [];

  // Rubric v2 on this run's outputs: one row per scored axis (N/A excluded).
  const rubrics = outputIds.length
    ? await prisma.rubricAxisScore.findMany({
        where: { modelOutputId: { in: outputIds }, score: { not: null } },
        select: {
          modelOutputId: true,
          bucket: true,
          axis: true,
          score: true,
        },
      })
    : [];

  // Per-bucket tallies.
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  const rubricSum: Record<string, number> = {};
  const rubricN: Record<string, number> = {};
  for (const b of BUCKET_KEYS) {
    wins[b] = games[b] = rubricSum[b] = rubricN[b] = 0;
  }

  for (const c of comparisons) {
    const isA = outputIds.includes(c.modelOutputAId);
    const ownId = isA ? c.modelOutputAId : c.modelOutputBId;
    const bucket = (c.bucket ??
      bucketByOutput.get(ownId) ??
      null) as EvalBucket | null;
    if (!bucket) continue;
    games[bucket] += 1;
    const ownWon = (isA && c.winner === "a") || (!isA && c.winner === "b");
    if (ownWon) wins[bucket] += 1;
  }

  for (const r of rubrics) {
    const bucket = (r.bucket ??
      bucketByOutput.get(r.modelOutputId) ??
      null) as EvalBucket | null;
    if (!bucket || r.score === null) continue;
    rubricSum[bucket] += r.score;
    rubricN[bucket] += 1;
  }

  // Replace this run's scores idempotently.
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.evalScore.deleteMany({ where: { evalRunId: id } }),
  ];
  let totalWins = 0;
  let totalGames = 0;
  let rubricMeanSum = 0;
  let rubricMeanCount = 0;

  for (const bucket of BUCKET_KEYS) {
    const n = games[bucket];
    const rn = rubricN[bucket];
    if (n === 0 && rn === 0) continue;
    const winRate = n > 0 ? wins[bucket] / n : null;
    const meanScore = rn > 0 ? rubricSum[bucket] / rn : null;
    totalWins += wins[bucket];
    totalGames += n;
    if (meanScore !== null) {
      rubricMeanSum += meanScore;
      rubricMeanCount += 1;
    }
    writes.push(
      prisma.evalScore.create({
        data: {
          evalRunId: id,
          bucket,
          bucketWinRate: winRate,
          bucketMeanScore: meanScore,
          bucketN: n,
          // Honest: a 1-vs-champion win rate needs enough games to be meaningful.
          distinguishable:
            n >= 8 && winRate !== null && Math.abs(winRate - 0.5) >= 0.2,
        },
      }),
    );
  }

  writes.push(
    prisma.evalRun.update({
      where: { id },
      data: {
        status: "complete",
        published: true,
        winRate: totalGames > 0 ? totalWins / totalGames : null,
        meanRubric:
          rubricMeanCount > 0 ? rubricMeanSum / rubricMeanCount : null,
        completedAt: new Date(),
      },
    }),
  );

  await prisma.$transaction(writes);

  return NextResponse.json({
    ok: true,
    buckets: BUCKET_KEYS.filter((b) => games[b] > 0 || rubricN[b] > 0).length,
    pairwise: comparisons.length,
    rubric: rubrics.length,
  });
}
