import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RUBRIC_V2 } from "@/lib/buckets";

/**
 * Inter-annotator agreement per rubric v2 axis (std-dev proxy).
 * Groups axis scores by (modelOutputId, axis); only items scored by 2+
 * annotators count. N/A (null) scores are excluded from the numeric proxy.
 */

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Convert average std dev to a 0-1 agreement proxy.
// Lower std dev = higher agreement. Max plausible std dev on a 0-5 scale ~2.5.
function stdDevToAgreement(avgStdDev: number): number {
  const maxStdDev = 2.5;
  return Math.max(0, Math.min(1, 1 - avgStdDev / maxStdDev));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const axisScores = await prisma.rubricAxisScore.findMany({
    where: { isDemo: false, score: { not: null } },
    select: {
      modelOutputId: true,
      annotatorId: true,
      axis: true,
      score: true,
    },
  });

  // Group by (modelOutputId, axis).
  const byItem = new Map<string, { annotatorId: string; score: number }[]>();
  for (const s of axisScores) {
    if (s.score === null) continue;
    const key = `${s.modelOutputId}:${s.axis}`;
    const arr = byItem.get(key) ?? [];
    arr.push({ annotatorId: s.annotatorId, score: s.score });
    byItem.set(key, arr);
  }

  const agreement = RUBRIC_V2.map((axisDef) => {
    const stdDevs: number[] = [];
    for (const [key, scores] of byItem.entries()) {
      if (!key.endsWith(`:${axisDef.key}`)) continue;
      const annotators = new Set(scores.map((s) => s.annotatorId));
      if (annotators.size < 2) continue;
      stdDevs.push(standardDeviation(scores.map((s) => s.score)));
    }

    if (stdDevs.length === 0) {
      return {
        dimension: axisDef.label,
        alpha: null,
        interpretation: "No multi-annotator data available",
        itemCount: 0,
      };
    }

    const avgStdDev = stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length;
    const alpha = Math.round(stdDevToAgreement(avgStdDev) * 1000) / 1000;
    let interpretation: string;
    if (alpha >= 0.8) interpretation = "Good";
    else if (alpha >= 0.6) interpretation = "Tentative";
    else if (alpha >= 0.4) interpretation = "Moderate";
    else interpretation = "Low";

    return {
      dimension: axisDef.label,
      alpha,
      interpretation,
      itemCount: stdDevs.length,
    };
  });

  return NextResponse.json({
    agreement,
    method: "std_dev_proxy",
    note: "Agreement per rubric v2 axis, computed as a standard-deviation proxy over items scored by 2+ annotators. Full Krippendorff's alpha lands with the calibration mode.",
  });
}
