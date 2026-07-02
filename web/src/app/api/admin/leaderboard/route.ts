import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RUBRIC_V2 } from "@/lib/buckets";

/**
 * Per-model win rates + rubric v2 axis means for the researcher dashboard.
 * Win rate: wins / games, where ties and both-inadequate count as games
 * without a winner. Demo records are excluded. N/A scores excluded from means.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");

  const languages = language
    ? [language]
    : await prisma.prompt
        .findMany({ select: { language: true }, distinct: ["language"] })
        .then((rows) => rows.map((r) => r.language));

  const leaderboard: Record<
    string,
    Array<{
      model: string;
      winRate: number;
      axes: Record<string, number>;
      overallScore: number;
    }>
  > = {};

  for (const lang of languages) {
    const prompts = await prisma.prompt.findMany({
      where: { language: lang },
      select: { promptId: true },
    });
    const promptIds = prompts.map((p) => p.promptId);
    if (promptIds.length === 0) continue;

    const modelOutputs = await prisma.modelOutput.findMany({
      where: { prompt: { language: lang } },
      select: { id: true, model: true },
    });
    const modelOutputIds = new Set(modelOutputs.map((mo) => mo.id));
    const outputToModel = new Map(modelOutputs.map((mo) => [mo.id, mo.model]));

    // Pairwise win rates (a/b wins; tie and both_inadequate count as games).
    const comparisons = await prisma.pairwiseComparison.findMany({
      where: { promptId: { in: promptIds }, isDemo: false },
      select: { modelOutputAId: true, modelOutputBId: true, winner: true },
    });

    const winCounts = new Map<string, number>();
    const totalCounts = new Map<string, number>();
    for (const comp of comparisons) {
      if (
        !modelOutputIds.has(comp.modelOutputAId) ||
        !modelOutputIds.has(comp.modelOutputBId)
      )
        continue;
      const modelA = outputToModel.get(comp.modelOutputAId)!;
      const modelB = outputToModel.get(comp.modelOutputBId)!;

      totalCounts.set(modelA, (totalCounts.get(modelA) ?? 0) + 1);
      totalCounts.set(modelB, (totalCounts.get(modelB) ?? 0) + 1);

      if (comp.winner === "a")
        winCounts.set(modelA, (winCounts.get(modelA) ?? 0) + 1);
      else if (comp.winner === "b")
        winCounts.set(modelB, (winCounts.get(modelB) ?? 0) + 1);
      // tie / both_inadequate: games without a winner
    }

    // Rubric v2 axis means per model.
    const axisScores = await prisma.rubricAxisScore.findMany({
      where: {
        promptId: { in: promptIds },
        isDemo: false,
        score: { not: null },
      },
      select: { modelOutputId: true, axis: true, score: true },
    });

    const modelAxisScores = new Map<string, Record<string, number[]>>();
    for (const s of axisScores) {
      const model = outputToModel.get(s.modelOutputId);
      if (!model || s.score === null) continue;
      const byAxis = modelAxisScores.get(model) ?? {};
      (byAxis[s.axis] ??= []).push(s.score);
      modelAxisScores.set(model, byAxis);
    }

    const allModels = new Set([
      ...totalCounts.keys(),
      ...modelAxisScores.keys(),
    ]);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const entries = Array.from(allModels).map((model) => {
      const total = totalCounts.get(model) ?? 0;
      const wins = winCounts.get(model) ?? 0;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      const byAxis = modelAxisScores.get(model) ?? {};
      const axes: Record<string, number> = {};
      for (const axisDef of RUBRIC_V2) {
        const scores = byAxis[axisDef.key];
        if (scores && scores.length > 0)
          axes[axisDef.key] = Math.round(avg(scores) * 100) / 100;
      }
      const axisMeans = Object.values(axes);
      const overallScore =
        axisMeans.length > 0 ? Math.round(avg(axisMeans) * 100) / 100 : 0;

      return {
        model,
        winRate: Math.round(winRate * 10) / 10,
        axes,
        overallScore,
      };
    });

    entries.sort((a, b) => b.overallScore - a.overallScore);
    leaderboard[lang] = entries;
  }

  return NextResponse.json({
    leaderboard,
    axes: RUBRIC_V2.map((a) => ({ key: a.key, label: a.label })),
  });
}
