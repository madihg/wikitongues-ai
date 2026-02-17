import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");

  // Get all languages with data if none specified
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
      culturalAccuracy: number;
      linguisticAuthenticity: number;
      creativeDepth: number;
      factualCorrectness: number;
      overallScore: number;
    }>
  > = {};

  for (const lang of languages) {
    // Get prompt IDs for this language
    const prompts = await prisma.prompt.findMany({
      where: { language: lang },
      select: { promptId: true },
    });
    const promptIds = prompts.map((p) => p.promptId);

    if (promptIds.length === 0) continue;

    // Get model outputs for these prompts
    const modelOutputs = await prisma.modelOutput.findMany({
      where: { prompt: { language: lang } },
      select: { id: true, model: true },
    });

    const modelOutputIds = new Set(modelOutputs.map((mo) => mo.id));
    const outputToModel = new Map(modelOutputs.map((mo) => [mo.id, mo.model]));

    // Pairwise win rates
    const comparisons = await prisma.pairwiseComparison.findMany({
      where: { promptId: { in: promptIds } },
      select: {
        modelOutputAId: true,
        modelOutputBId: true,
        winner: true,
      },
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

      const winnerModel = comp.winner === "a" ? modelA : modelB;
      winCounts.set(winnerModel, (winCounts.get(winnerModel) ?? 0) + 1);
    }

    // Rubric score averages per model
    const rubricScores = await prisma.rubricScore.findMany({
      where: { promptId: { in: promptIds } },
      select: {
        modelOutputId: true,
        culturalAccuracy: true,
        linguisticAuthenticity: true,
        creativeDepth: true,
        factualCorrectness: true,
      },
    });

    const modelScores = new Map<
      string,
      {
        culturalAccuracy: number[];
        linguisticAuthenticity: number[];
        creativeDepth: number[];
        factualCorrectness: number[];
      }
    >();

    for (const score of rubricScores) {
      const model = outputToModel.get(score.modelOutputId);
      if (!model) continue;
      if (!modelScores.has(model)) {
        modelScores.set(model, {
          culturalAccuracy: [],
          linguisticAuthenticity: [],
          creativeDepth: [],
          factualCorrectness: [],
        });
      }
      const ms = modelScores.get(model)!;
      ms.culturalAccuracy.push(score.culturalAccuracy);
      ms.linguisticAuthenticity.push(score.linguisticAuthenticity);
      ms.creativeDepth.push(score.creativeDepth);
      ms.factualCorrectness.push(score.factualCorrectness);
    }

    const allModels = new Set([
      ...winCounts.keys(),
      ...totalCounts.keys(),
      ...modelScores.keys(),
    ]);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const entries = Array.from(allModels).map((model) => {
      const total = totalCounts.get(model) ?? 0;
      const wins = winCounts.get(model) ?? 0;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      const scores = modelScores.get(model);
      const ca = scores ? avg(scores.culturalAccuracy) : 0;
      const la = scores ? avg(scores.linguisticAuthenticity) : 0;
      const cd = scores ? avg(scores.creativeDepth) : 0;
      const fc = scores ? avg(scores.factualCorrectness) : 0;
      const overallScore = (ca + la + cd + fc) / 4;

      return {
        model,
        winRate: Math.round(winRate * 10) / 10,
        culturalAccuracy: Math.round(ca * 100) / 100,
        linguisticAuthenticity: Math.round(la * 100) / 100,
        creativeDepth: Math.round(cd * 100) / 100,
        factualCorrectness: Math.round(fc * 100) / 100,
        overallScore: Math.round(overallScore * 100) / 100,
      };
    });

    entries.sort((a, b) => b.overallScore - a.overallScore);

    leaderboard[lang] = entries;
  }

  return NextResponse.json({ leaderboard });
}
