import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RubricInput {
  modelOutputId: string;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  creativeDepth: number;
  factualCorrectness: number;
  notesCulturalAccuracy?: string;
  notesLinguisticAuthenticity?: string;
  notesCreativeDepth?: string;
  notesFactualCorrectness?: string;
}

function validateScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function validateRubric(rubric: unknown): rubric is RubricInput {
  if (!rubric || typeof rubric !== "object") return false;
  const r = rubric as Record<string, unknown>;
  return (
    typeof r.modelOutputId === "string" &&
    validateScore(r.culturalAccuracy) &&
    validateScore(r.linguisticAuthenticity) &&
    validateScore(r.creativeDepth) &&
    validateScore(r.factualCorrectness)
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const annotatorId = session.user.id;
  const body = await req.json();

  const {
    promptId,
    modelOutputAId,
    modelOutputBId,
    winner,
    explanation,
    rubricA,
    rubricB,
  } = body;

  // Validate required fields
  if (!promptId || !modelOutputAId || !modelOutputBId) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: promptId, modelOutputAId, modelOutputBId",
      },
      { status: 400 },
    );
  }

  if (winner !== "a" && winner !== "b") {
    return NextResponse.json(
      { error: "Winner must be 'a' or 'b'" },
      { status: 400 },
    );
  }

  if (
    !explanation ||
    typeof explanation !== "string" ||
    explanation.trim().length < 20
  ) {
    return NextResponse.json(
      { error: "Explanation is required and must be at least 20 characters" },
      { status: 400 },
    );
  }

  if (!validateRubric(rubricA) || !validateRubric(rubricB)) {
    return NextResponse.json(
      {
        error:
          "Invalid rubric scores. Each dimension must be an integer from 1 to 5.",
      },
      { status: 400 },
    );
  }

  // Verify model outputs exist
  const [outputA, outputB] = await Promise.all([
    prisma.modelOutput.findUnique({ where: { id: modelOutputAId } }),
    prisma.modelOutput.findUnique({ where: { id: modelOutputBId } }),
  ]);

  if (!outputA || !outputB) {
    return NextResponse.json(
      { error: "One or both model outputs not found" },
      { status: 404 },
    );
  }

  // Check for duplicate submission
  const existing = await prisma.pairwiseComparison.findFirst({
    where: {
      annotatorId,
      promptId,
      OR: [
        { modelOutputAId, modelOutputBId },
        { modelOutputAId: modelOutputBId, modelOutputBId: modelOutputAId },
      ],
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted a comparison for this pair" },
      { status: 409 },
    );
  }

  // Save everything in a transaction
  await prisma.$transaction([
    prisma.pairwiseComparison.create({
      data: {
        promptId,
        modelOutputAId,
        modelOutputBId,
        winner,
        explanation: explanation.trim(),
        annotatorId,
      },
    }),
    prisma.rubricScore.create({
      data: {
        promptId,
        modelOutputId: rubricA.modelOutputId,
        culturalAccuracy: rubricA.culturalAccuracy,
        linguisticAuthenticity: rubricA.linguisticAuthenticity,
        creativeDepth: rubricA.creativeDepth,
        factualCorrectness: rubricA.factualCorrectness,
        notesCulturalAccuracy: rubricA.notesCulturalAccuracy || null,
        notesLinguisticAuthenticity:
          rubricA.notesLinguisticAuthenticity || null,
        notesCreativeDepth: rubricA.notesCreativeDepth || null,
        notesFactualCorrectness: rubricA.notesFactualCorrectness || null,
        annotatorId,
      },
    }),
    prisma.rubricScore.create({
      data: {
        promptId,
        modelOutputId: rubricB.modelOutputId,
        culturalAccuracy: rubricB.culturalAccuracy,
        linguisticAuthenticity: rubricB.linguisticAuthenticity,
        creativeDepth: rubricB.creativeDepth,
        factualCorrectness: rubricB.factualCorrectness,
        notesCulturalAccuracy: rubricB.notesCulturalAccuracy || null,
        notesLinguisticAuthenticity:
          rubricB.notesLinguisticAuthenticity || null,
        notesCreativeDepth: rubricB.notesCreativeDepth || null,
        notesFactualCorrectness: rubricB.notesFactualCorrectness || null,
        annotatorId,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
