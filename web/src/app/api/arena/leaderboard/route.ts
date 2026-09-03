import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import {
  buildEraSlice,
  eraSplit,
  POOL_PIVOT_AT,
  type ArenaComparisonRow,
  type EraSlice,
} from "@/lib/arena/era";
import { BUCKETS } from "@/lib/buckets";

/**
 * The rubric arena leaderboard: a candidate x 8-category matrix ranked by human
 * pairwise (Bradley-Terry, per category), served for TWO windows.
 *
 * The window matters more than the fit. Fitted over all history the table is
 * dominated by the era before the annotation pivot, when speakers rejected both
 * answers in nearly every comparison, so the decided winners spread thin and
 * almost every cell reports an absence of evidence. Both eras are computed here
 * and shipped together - the client switches without a refetch, and neither
 * window is hidden from the reader. See src/lib/arena/era.ts for the derivation
 * of the pivot and the sparsity gate.
 *
 * The population is the one every other arena surface counts: non-demo
 * comparisons by real annotators. The page that renders this table quotes its
 * own all-time and current-pool counts from computeAnnotationInsights, so if
 * the two queries disagreed the reader would meet two different counts of the
 * same thing in the same scroll.
 */

/** Same seed-account exclusion, same reason, as src/lib/annotation-insights.ts,
 * src/lib/method-metrics.ts and /api/public/stats: a bring-up test login is not
 * a speaker, and its comparisons are not evidence about a model. */
const SEED_ACCOUNT_EMAIL_SUFFIX = "@test.com";
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
      inPairingPool: true,
    },
  });

  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  // Pairwise: map each comparison's two outputs to their candidates. createdAt
  // rides along because the era window is a time window, and the pool flag
  // rides along because the window's start is derived from it.
  const comparisons = await prisma.pairwiseComparison.findMany({
    where: {
      isDemo: false,
      annotator: { email: { not: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } } },
    },
    select: {
      winner: true,
      bucket: true,
      createdAt: true,
      modelOutputA: { select: { candidateModelId: true, bucket: true } },
      modelOutputB: { select: { candidateModelId: true, bucket: true } },
    },
  });

  const rows: ArenaComparisonRow[] = [];
  for (const c of comparisons) {
    const a = c.modelOutputA?.candidateModelId;
    const b = c.modelOutputB?.candidateModelId;
    if (!a || !b || a === b) continue;
    const candA = candidateById.get(a);
    const candB = candidateById.get(b);
    if (!candA || !candB) continue;
    rows.push({
      candidateA: a,
      candidateB: b,
      // The raw verdict, not folded: "both_inadequate" is a rejection of both
      // answers, and the sparsity gate must never count it as evidence.
      outcome: c.winner,
      bucket: c.bucket ?? c.modelOutputA?.bucket ?? null,
      createdAt: c.createdAt,
      aInPool: candA.inPairingPool,
      bInPool: candB.inPairingPool,
    });
  }

  // The frozen benchmark: prompts whose community gold never enters training.
  const heldOutPrompts = await prisma.prompt.count({
    where: { language: "igala", split: "test" },
  });

  // Rubric v2 volume, for the "n rubric scores" line. N/A (null) scores are
  // stored but never counted as a score.
  const rubricScores = await prisma.rubricAxisScore.count({
    where: { isDemo: false, score: { not: null } },
  });

  const pivotAt = new Date(POOL_PIVOT_AT);
  const candidateIds = candidates.map((c) => c.id);
  const sincePivot = buildEraSlice(rows, {
    era: "since_pivot",
    pivotAt,
    candidateIds,
  });
  const allTime = buildEraSlice(rows, {
    era: "all_time",
    pivotAt,
    candidateIds,
  });

  const shapeEra = (slice: EraSlice) => ({
    ...slice,
    rows: slice.rows.map((r) => ({
      ...r,
      candidate: candidateById.get(r.candidateId) ?? null,
    })),
    belowGate: slice.belowGate.map((s) => ({
      ...s,
      candidate: candidateById.get(s.candidateId) ?? null,
    })),
  });

  const buckets = BUCKETS.map((b) => ({
    key: b.key,
    num: b.num,
    short: b.short,
    label: b.label,
  }));

  return NextResponse.json({
    buckets,
    /** ISO start of the post-pivot window, derived from the data. */
    pivotAt: pivotAt ? pivotAt.toISOString() : null,
    eras: {
      since_pivot: shapeEra(sincePivot),
      all_time: shapeEra(allTime),
    },
    /** The two windows' comparison and decided counts, for the copy that
     * explains why the post-pivot window is the default. */
    split: eraSplit(allTime, sincePivot),
    totals: {
      candidates: candidates.length,
      pairwise: allTime.comparisons,
      rubric: rubricScores,
      overallDistinguishable: allTime.overallDistinguishable,
      // Live inputs for the leaderboard explainer, all-time.
      signal: {
        comparisons: allTime.comparisons,
        decided: allTime.decided,
        ties: allTime.ties,
        bothInadequate: allTime.bothInadequate,
        heldOutPrompts,
      },
    },
  });
}
