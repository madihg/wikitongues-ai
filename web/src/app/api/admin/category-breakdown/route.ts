import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RUBRIC_V2 } from "@/lib/buckets";

/**
 * Per-bucket, per-model rubric v2 axis means for the researcher dashboard.
 * Axis-keyed: language -> bucket -> model -> { axes: {axis: mean}, count }.
 * N/A scores are excluded from means.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const axisScores = await prisma.rubricAxisScore.findMany({
    where: { isDemo: false, score: { not: null } },
    select: {
      axis: true,
      score: true,
      modelOutput: {
        select: {
          model: true,
          prompt: { select: { bucket: true, language: true } },
        },
      },
    },
  });

  // language -> bucket -> model -> axis -> scores[]
  const acc: Record<
    string,
    Record<string, Record<string, Record<string, number[]>>>
  > = {};

  for (const s of axisScores) {
    if (s.score === null) continue;
    const lang = s.modelOutput.prompt.language;
    const cat = s.modelOutput.prompt.bucket;
    const model = s.modelOutput.model;
    acc[lang] ??= {};
    acc[lang][cat] ??= {};
    acc[lang][cat][model] ??= {};
    acc[lang][cat][model][s.axis] ??= [];
    acc[lang][cat][model][s.axis].push(s.score);
  }

  const avg = (arr: number[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
      : 0;

  const result: Record<
    string,
    Record<
      string,
      Array<{ model: string; axes: Record<string, number>; count: number }>
    >
  > = {};

  for (const [lang, cats] of Object.entries(acc)) {
    result[lang] = {};
    for (const [cat, models] of Object.entries(cats)) {
      result[lang][cat] = Object.entries(models).map(([model, byAxis]) => {
        const axes: Record<string, number> = {};
        let count = 0;
        for (const [axis, scores] of Object.entries(byAxis)) {
          axes[axis] = avg(scores);
          count += scores.length;
        }
        return { model, axes, count };
      });
    }
  }

  return NextResponse.json({
    breakdown: result,
    axes: RUBRIC_V2.map((a) => ({ key: a.key, label: a.label })),
  });
}
