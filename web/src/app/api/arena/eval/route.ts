import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { collectEvalBundle, type EvalBundle } from "@/lib/eval/collect";
import { METRIC_LABELS } from "@/lib/eval/reference";
import { PROFILE_PROVENANCE, LANGUAGE_LABELS } from "@/lib/eval/langid";

/**
 * The AUTOMATIC eval: reference-based scoring against community gold, the
 * language-identity gate, the inter-gold ceiling, and the autorater's measured
 * agreement with the human labels we hold.
 *
 * This is deliberately a SEPARATE surface from /api/arena/leaderboard. That one
 * reports human pairwise judgment, which is the ground truth. This one reports
 * automatic proxies, which are not. Merging them into one table would invite
 * exactly the confusion the project cannot afford.
 *
 * Cached in-process for 5 minutes: the computation reads the whole gold corpus
 * and runs a 5-fold cross-validation plus several thousand bootstrap resamples,
 * which is a few seconds of CPU and should not run once per page paint.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; bundle: EvalBundle } | null = null;

export async function GET(request: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const now = Date.now();
  if (refresh || !cache || now - cache.at > CACHE_TTL_MS) {
    cache = { at: now, bundle: await collectEvalBundle(prisma) };
  }

  return NextResponse.json({
    ...cache.bundle,
    computedAt: new Date(cache.at).toISOString(),
    cached: !refresh && now - cache.at > 0,
    metricLabels: METRIC_LABELS,
    languageLabels: LANGUAGE_LABELS,
    profileProvenance: PROFILE_PROVENANCE,
  });
}
