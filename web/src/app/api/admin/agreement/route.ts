import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DIMENSIONS = [
  "culturalAccuracy",
  "linguisticAuthenticity",
  "creativeDepth",
  "factualCorrectness",
] as const;

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Convert average std dev to a 0-1 agreement proxy
// Lower std dev = higher agreement. Max possible std dev on 1-5 scale is ~2.
// We invert so that higher = better agreement (like Krippendorff's alpha)
function stdDevToAgreement(avgStdDev: number): number {
  const maxStdDev = 2.0;
  return Math.max(0, Math.min(1, 1 - avgStdDev / maxStdDev));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all rubric scores grouped by modelOutputId
  const rubricScores = await prisma.rubricScore.findMany({
    select: {
      modelOutputId: true,
      annotatorId: true,
      culturalAccuracy: true,
      linguisticAuthenticity: true,
      creativeDepth: true,
      factualCorrectness: true,
    },
  });

  // Group scores by modelOutputId
  const byOutput = new Map<string, typeof rubricScores>();
  for (const score of rubricScores) {
    const existing = byOutput.get(score.modelOutputId) ?? [];
    existing.push(score);
    byOutput.set(score.modelOutputId, existing);
  }

  // Only consider items with multiple annotators
  const multiAnnotated = Array.from(byOutput.entries()).filter(([, scores]) => {
    const annotators = new Set(scores.map((s) => s.annotatorId));
    return annotators.size >= 2;
  });

  if (multiAnnotated.length === 0) {
    return NextResponse.json({
      agreement: DIMENSIONS.map((dim) => ({
        dimension: dim,
        alpha: null,
        interpretation: "No multi-annotator data available",
        itemCount: 0,
      })),
      method: "std_dev_proxy",
      note: "Agreement scores are computed as a standard deviation proxy. Full Krippendorff's alpha requires the krippendorff Python package.",
    });
  }

  const dimensionAgreement = DIMENSIONS.map((dim) => {
    const stdDevs: number[] = [];

    for (const [, scores] of multiAnnotated) {
      const values = scores.map((s) => s[dim]);
      const sd = standardDeviation(values);
      stdDevs.push(sd);
    }

    const avgStdDev =
      stdDevs.length > 0
        ? stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length
        : 0;
    const alpha = Math.round(stdDevToAgreement(avgStdDev) * 1000) / 1000;

    let interpretation: string;
    if (alpha >= 0.8) interpretation = "Good";
    else if (alpha >= 0.6) interpretation = "Tentative";
    else if (alpha >= 0.4) interpretation = "Moderate";
    else interpretation = "Low";

    return {
      dimension: dim as string,
      alpha,
      interpretation,
      itemCount: multiAnnotated.length,
    };
  });

  return NextResponse.json({
    agreement: dimensionAgreement,
    method: "std_dev_proxy",
    note: "Agreement scores are computed as a standard deviation proxy. Full Krippendorff's alpha requires the krippendorff Python package.",
  });
}
