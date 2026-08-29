import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMethodMetrics } from "@/lib/method-metrics";
import { toPublicMethodMetrics } from "@/lib/public-method-metrics";

/**
 * GET /api/public/method-metrics - UNAUTHENTICATED, aggregate-only method
 * metrics for the public marketing site's How-it-works story.
 *
 * Same conventions as GET /api/public/stats: CORS-open, cached 5 minutes,
 * counts and scores only - no names, no emails, no raw Igala answers, no
 * frozen prompt text, no gold answer strings.
 *
 * The numbers come from computeMethodMetrics - the SAME implementation that
 * feeds the researcher-gated How-it-works page - so a figure on the public
 * site and a figure on the internal page can never come from two
 * implementations of the method. consentBenchmark, isDemo exclusions and the
 * @test.com seed-account exclusion are all enforced inside that computation.
 * This route only projects the result through toPublicMethodMetrics, whose
 * tests serialize the payload and run it through the leak guard.
 *
 * Cached for 5 minutes (route-segment `revalidate`) so it can never become a
 * load vector: the computation runs at most once per window, not per hit.
 */
export const revalidate = 300;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET() {
  const metrics = await computeMethodMetrics(prisma);
  return NextResponse.json(toPublicMethodMetrics(metrics), {
    headers: CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
