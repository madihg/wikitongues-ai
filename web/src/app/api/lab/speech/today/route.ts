import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { sanitizeQuality, sessionLine } from "@/lib/speech/analyse";
import { REJECTED_REVIEW_STATUSES } from "@/lib/speech/limits";

/**
 * The session line under the Lab header (GET /api/lab/speech/today). For the
 * speaker side of the lab (researchers; annotators with the layer flag on);
 * 404 when the flag is off. Counts the caller's OWN
 * confirmed, non-demo clips made since the start of "today", which the
 * browser sends as `?since=<ISO time>` (its local midnight; the server
 * clamps it to the last 36 hours so a bad value cannot scan the table).
 * No new table: "re-recorded" is the sum of `retakes` the recorder stored in
 * each clip's quality metrics (takes thrown away before the one kept).
 * `minutesToday` is the length of those clips; `poolHours` is the whole
 * pool: confirmed, consented, non-demo clips of every tier that are not
 * flagged bad_audio or wrong_text. The line reads "You added N minutes
 * today. The pool is at H hours."
 */

const MAX_LOOKBACK_MS = 36 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;

  const raw = new URL(req.url).searchParams.get("since");
  const floor = Date.now() - MAX_LOOKBACK_MS;
  let since = new Date(Math.max(Date.parse(raw ?? "") || 0, floor));
  if (since.getTime() > Date.now()) since = new Date(floor);

  const rows = await prisma.speechRecording.findMany({
    where: {
      annotatorId: gate.userId,
      isDemo: false,
      uploadedAt: { not: null },
      createdAt: { gte: since },
    },
    // Tier and metrics only: never the audio.
    select: { tier: true, quality: true, durationMs: true },
  });
  const pool = await prisma.speechRecording.aggregate({
    where: {
      isDemo: false,
      uploadedAt: { not: null },
      consentId: { not: null },
      OR: [
        { reviewStatus: null },
        { reviewStatus: { notIn: [...REJECTED_REVIEW_STATUSES] } },
      ],
    },
    _sum: { durationMs: true },
  });

  const counts = {
    kept: rows.length,
    retakes: 0,
    communityOnly: 0,
    licensed: 0,
    open: 0,
  };
  let todayMs = 0;
  for (const r of rows) {
    todayMs += r.durationMs;
    counts.retakes += sanitizeQuality(r.quality)?.retakes ?? 0;
    if (r.tier === "community_only") counts.communityOnly++;
    else if (r.tier === "licensed") counts.licensed++;
    else if (r.tier === "open") counts.open++;
  }
  const minutesToday = todayMs / 60_000;
  const poolHours = (pool._sum.durationMs ?? 0) / 3_600_000;
  return NextResponse.json({
    counts,
    minutesToday,
    poolHours,
    line: sessionLine(minutesToday, poolHours),
  });
}
