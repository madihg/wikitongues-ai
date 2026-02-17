import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const annotatorId = session.user.id;

  // Find prompts that have at least 2 model outputs
  const promptsWithOutputs = await prisma.prompt.findMany({
    where: {
      modelOutputs: {
        some: {},
      },
    },
    include: {
      modelOutputs: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Filter to prompts with >= 2 outputs
  const eligiblePrompts = promptsWithOutputs.filter(
    (p) => p.modelOutputs.length >= 2,
  );

  if (eligiblePrompts.length === 0) {
    return NextResponse.json({
      complete: true,
      message: "No prompts with model outputs available yet.",
    });
  }

  // Get all existing pairwise comparisons by this annotator
  const existingComparisons = await prisma.pairwiseComparison.findMany({
    where: { annotatorId },
    select: {
      modelOutputAId: true,
      modelOutputBId: true,
      promptId: true,
    },
  });

  // Build a set of completed pairs for quick lookup
  const completedPairs = new Set(
    existingComparisons.map(
      (c) =>
        `${c.promptId}:${[c.modelOutputAId, c.modelOutputBId].sort().join(":")}`,
    ),
  );

  // Calculate total possible comparisons and find next task
  let totalComparisons = 0;
  let completedCount = 0;

  for (const prompt of eligiblePrompts) {
    const outputs = prompt.modelOutputs;
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        totalComparisons++;
        const pairKey = `${prompt.promptId}:${[outputs[i].id, outputs[j].id].sort().join(":")}`;
        if (completedPairs.has(pairKey)) {
          completedCount++;
        }
      }
    }
  }

  // Find the first incomplete pair
  for (const prompt of eligiblePrompts) {
    const outputs = prompt.modelOutputs;
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const pairKey = `${prompt.promptId}:${[outputs[i].id, outputs[j].id].sort().join(":")}`;
        if (!completedPairs.has(pairKey)) {
          // Randomly assign A/B to avoid position bias
          const swap = Math.random() > 0.5;
          const outputA = swap ? outputs[j] : outputs[i];
          const outputB = swap ? outputs[i] : outputs[j];

          return NextResponse.json({
            complete: false,
            progress: {
              completed: completedCount,
              total: totalComparisons,
            },
            task: {
              prompt: {
                id: prompt.id,
                promptId: prompt.promptId,
                category: prompt.category,
                language: prompt.language,
                text: prompt.text,
                targetCulture: prompt.targetCulture,
              },
              outputA: {
                id: outputA.id,
                text: outputA.outputText,
              },
              outputB: {
                id: outputB.id,
                text: outputB.outputText,
              },
            },
          });
        }
      }
    }
  }

  return NextResponse.json({
    complete: true,
    progress: {
      completed: completedCount,
      total: totalComparisons,
    },
  });
}
