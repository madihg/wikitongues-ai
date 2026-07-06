import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { bradleyTerry } from "@/lib/arena/bradley-terry";
import { BUCKETS } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

/**
 * Per-bucket champion trajectory across epochs.
 *
 * For each Epoch (ordered by epochNumber) and each bucket we gather the human
 * PairwiseComparisons belonging to that epoch, map the two compared outputs to
 * their candidates, run Bradley-Terry, and report the top candidate's strength.
 * This traces "how strong was the best model in this bucket at each epoch".
 *
 * Never throws: with no epochs/data it returns { epochs: [], buckets }.
 */
export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const bucketMeta = BUCKETS.map((b) => ({
    key: b.key,
    num: b.num,
    short: b.short,
    label: b.label,
  }));

  const epochs = await prisma.epoch.findMany({
    where: { language: "igala" },
    orderBy: { epochNumber: "asc" },
    select: { id: true, epochNumber: true, notes: true, completedAt: true },
  });

  if (epochs.length === 0) {
    return NextResponse.json({ epochs: [], buckets: bucketMeta });
  }

  const epochIds = epochs.map((e) => e.id);

  // Pull comparisons tied to these epochs. A comparison's epoch can come either
  // directly (comparison.epochId) or via its eval run (evalRun.epochId).
  const comparisons = await prisma.pairwiseComparison.findMany({
    where: {
      isDemo: false,
      OR: [
        { epochId: { in: epochIds } },
        { evalRun: { epochId: { in: epochIds } } },
      ],
    },
    select: {
      winner: true,
      bucket: true,
      epochId: true,
      evalRun: { select: { epochId: true } },
      modelOutputA: { select: { candidateModelId: true, bucket: true } },
      modelOutputB: { select: { candidateModelId: true, bucket: true } },
    },
  });

  // Names for the reported champions.
  const candidates = await prisma.candidateModel.findMany({
    select: { id: true, name: true, color: true },
  });
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  // Group observations by epoch -> bucket.
  type Obs = { a: string; b: string; winner: "a" | "b" | "tie" };
  const byEpochBucket = new Map<string, Map<EvalBucket, Obs[]>>();
  for (const id of epochIds) byEpochBucket.set(id, new Map());

  for (const c of comparisons) {
    const epochId = c.epochId ?? c.evalRun?.epochId ?? null;
    if (!epochId || !byEpochBucket.has(epochId)) continue;
    const ca = c.modelOutputA?.candidateModelId;
    const cb = c.modelOutputB?.candidateModelId;
    if (!ca || !cb || ca === cb) continue;
    const bucket = (c.bucket ??
      c.modelOutputA?.bucket ??
      c.modelOutputB?.bucket) as EvalBucket | null;
    if (!bucket) continue;
    const bucketMap = byEpochBucket.get(epochId)!;
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
    bucketMap.get(bucket)!.push({
      a: ca,
      b: cb,
      winner: c.winner === "a" || c.winner === "b" ? c.winner : "tie",
    });
  }

  const epochResults = epochs.map((e) => {
    const bucketMap = byEpochBucket.get(e.id) ?? new Map<EvalBucket, Obs[]>();
    const buckets: Record<
      string,
      {
        strength: number;
        championId: string;
        championName: string;
        distinguishable: boolean;
        games: number;
      } | null
    > = {};

    for (const meta of BUCKETS) {
      const obs = bucketMap.get(meta.key) ?? [];
      if (obs.length === 0) {
        buckets[meta.key] = null;
        continue;
      }
      const bt = bradleyTerry(obs);
      const top = bt.candidates[0];
      if (!top) {
        buckets[meta.key] = null;
        continue;
      }
      const champ = candidateById.get(top.id);
      buckets[meta.key] = {
        strength: Math.round(top.strength * 10) / 10,
        championId: top.id,
        championName: champ?.name ?? top.id,
        distinguishable: bt.distinguishable,
        games: top.games,
      };
    }

    return {
      epochNumber: e.epochNumber,
      notes: e.notes,
      completedAt: e.completedAt,
      buckets,
    };
  });

  return NextResponse.json({ epochs: epochResults, buckets: bucketMeta });
}
