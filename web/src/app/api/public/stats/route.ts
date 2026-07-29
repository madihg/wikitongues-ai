import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPublicStats } from "@/lib/public-stats";

/**
 * GET /api/public/stats - UNAUTHENTICATED, aggregate-only project statistics.
 *
 * Feeds the public marketing site's Research page. Exposes counts and rates
 * only: no names, no emails, no raw Igala answers. The Igala corpus is the
 * community's asset - only numbers about it cross this public boundary.
 *
 * Cached for 5 minutes (route-segment `revalidate`) so it can never become a
 * load vector: the underlying queries run at most once per window, not per hit.
 * Every query filters isDemo=false where the model carries that flag, so demo
 * / testing sessions never leak into public numbers.
 */
export const revalidate = 300;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET() {
  const [
    totalPrompts,
    heldOutBenchmark,
    promptsByBucketRaw,
    languagesRaw,
    coldAuthoredAnswers,
    corrections,
    pairwiseTotal,
    bothInadequate,
    decidedWinner,
    pairwiseAnnotators,
    coldAnnotators,
    editAnnotators,
  ] = await Promise.all([
    prisma.prompt.count(),
    prisma.prompt.count({ where: { split: "test" } }),
    prisma.prompt.groupBy({ by: ["bucket"], _count: { _all: true } }),
    prisma.prompt.groupBy({ by: ["language"], _count: { _all: true } }),
    prisma.coldAuthorAnswer.count({ where: { isDemo: false } }),
    prisma.outputEdit.count({ where: { isDemo: false } }),
    prisma.pairwiseComparison.count({ where: { isDemo: false } }),
    prisma.pairwiseComparison.count({
      where: { isDemo: false, winner: "both_inadequate" },
    }),
    prisma.pairwiseComparison.count({
      where: { isDemo: false, winner: { in: ["a", "b"] } },
    }),
    // Distinct contributing annotators per signal type. We select only the id
    // (a cuid, never returned to the client) purely to count distinct people.
    prisma.pairwiseComparison.findMany({
      where: { isDemo: false },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { isDemo: false },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
    prisma.outputEdit.findMany({
      where: { isDemo: false },
      distinct: ["annotatorId"],
      select: { annotatorId: true },
    }),
  ]);

  const activeAnnotators = new Set<string>([
    ...pairwiseAnnotators.map((r) => r.annotatorId),
    ...coldAnnotators.map((r) => r.annotatorId),
    ...editAnnotators.map((r) => r.annotatorId),
  ]).size;

  const stats = buildPublicStats({
    totalPrompts,
    heldOutBenchmark,
    promptsByBucket: promptsByBucketRaw.map((r) => ({
      bucket: r.bucket,
      count: r._count._all,
    })),
    languages: languagesRaw.map((r) => r.language),
    coldAuthoredAnswers,
    corrections,
    pairwiseTotal,
    bothInadequate,
    decidedWinner,
    activeAnnotators,
  });

  return NextResponse.json(stats, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
