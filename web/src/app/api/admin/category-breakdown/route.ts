import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all rubric scores joined with model output and prompt
  const rubricScores = await prisma.rubricScore.findMany({
    select: {
      culturalAccuracy: true,
      linguisticAuthenticity: true,
      creativeDepth: true,
      factualCorrectness: true,
      modelOutput: {
        select: {
          model: true,
          prompt: {
            select: {
              category: true,
              language: true,
            },
          },
        },
      },
    },
  });

  // Group: language -> category -> model -> dimension scores
  const breakdown: Record<
    string,
    Record<
      string,
      Record<
        string,
        {
          culturalAccuracy: number[];
          linguisticAuthenticity: number[];
          creativeDepth: number[];
          factualCorrectness: number[];
        }
      >
    >
  > = {};

  for (const score of rubricScores) {
    const lang = score.modelOutput.prompt.language;
    const cat = score.modelOutput.prompt.category;
    const model = score.modelOutput.model;

    if (!breakdown[lang]) breakdown[lang] = {};
    if (!breakdown[lang][cat]) breakdown[lang][cat] = {};
    if (!breakdown[lang][cat][model]) {
      breakdown[lang][cat][model] = {
        culturalAccuracy: [],
        linguisticAuthenticity: [],
        creativeDepth: [],
        factualCorrectness: [],
      };
    }

    const bucket = breakdown[lang][cat][model];
    bucket.culturalAccuracy.push(score.culturalAccuracy);
    bucket.linguisticAuthenticity.push(score.linguisticAuthenticity);
    bucket.creativeDepth.push(score.creativeDepth);
    bucket.factualCorrectness.push(score.factualCorrectness);
  }

  // Average the scores
  const avg = (arr: number[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
      : 0;

  const result: Record<
    string,
    Record<
      string,
      Array<{
        model: string;
        culturalAccuracy: number;
        linguisticAuthenticity: number;
        creativeDepth: number;
        factualCorrectness: number;
        count: number;
      }>
    >
  > = {};

  for (const [lang, cats] of Object.entries(breakdown)) {
    result[lang] = {};
    for (const [cat, models] of Object.entries(cats)) {
      result[lang][cat] = Object.entries(models).map(([model, scores]) => ({
        model,
        culturalAccuracy: avg(scores.culturalAccuracy),
        linguisticAuthenticity: avg(scores.linguisticAuthenticity),
        creativeDepth: avg(scores.creativeDepth),
        factualCorrectness: avg(scores.factualCorrectness),
        count: scores.culturalAccuracy.length,
      }));
    }
  }

  return NextResponse.json({ breakdown: result });
}
