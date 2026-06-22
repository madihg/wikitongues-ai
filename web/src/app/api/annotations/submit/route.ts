import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface RubricInput {
  modelOutputId: string;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
  notesCulturalAccuracy?: string;
  notesLinguisticAuthenticity?: string;
  notesCulturalNormAdherence?: string;
  notesFactualCorrectness?: string;
}

interface EditInput {
  modelOutputId: string;
  correctedText: string;
  rationale?: string;
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
    validateScore(r.culturalNormAdherence) &&
    validateScore(r.factualCorrectness)
  );
}

function parseEdits(raw: unknown): EditInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const r = e as Record<string, unknown>;
    if (typeof r.modelOutputId !== "string") return [];
    if (
      typeof r.correctedText !== "string" ||
      r.correctedText.trim().length === 0
    )
      return [];
    return [
      {
        modelOutputId: r.modelOutputId,
        correctedText: r.correctedText.trim(),
        rationale: typeof r.rationale === "string" ? r.rationale : undefined,
      },
    ];
  });
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
  const edits = parseEdits(body.edits);

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

  // Resolve the bucket once, so pairwise / rubric / edits all carry it.
  const prompt = await prisma.prompt.findUnique({
    where: { id: outputA.promptId },
    select: { bucket: true },
  });
  const bucket = outputA.bucket ?? prompt?.bucket ?? null;

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

  const outputById = new Map([
    [outputA.id, outputA],
    [outputB.id, outputB],
  ]);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.pairwiseComparison.create({
      data: {
        promptId,
        bucket,
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
        bucket,
        culturalAccuracy: rubricA.culturalAccuracy,
        linguisticAuthenticity: rubricA.linguisticAuthenticity,
        culturalNormAdherence: rubricA.culturalNormAdherence,
        factualCorrectness: rubricA.factualCorrectness,
        notesCulturalAccuracy: rubricA.notesCulturalAccuracy || null,
        notesLinguisticAuthenticity:
          rubricA.notesLinguisticAuthenticity || null,
        notesCulturalNormAdherence: rubricA.notesCulturalNormAdherence || null,
        notesFactualCorrectness: rubricA.notesFactualCorrectness || null,
        annotatorId,
      },
    }),
    prisma.rubricScore.create({
      data: {
        promptId,
        modelOutputId: rubricB.modelOutputId,
        bucket,
        culturalAccuracy: rubricB.culturalAccuracy,
        linguisticAuthenticity: rubricB.linguisticAuthenticity,
        culturalNormAdherence: rubricB.culturalNormAdherence,
        factualCorrectness: rubricB.factualCorrectness,
        notesCulturalAccuracy: rubricB.notesCulturalAccuracy || null,
        notesLinguisticAuthenticity:
          rubricB.notesLinguisticAuthenticity || null,
        notesCulturalNormAdherence: rubricB.notesCulturalNormAdherence || null,
        notesFactualCorrectness: rubricB.notesFactualCorrectness || null,
        annotatorId,
      },
    }),
  ];

  // Agnes's direct-edit field -> gold SFT targets.
  for (const edit of edits) {
    const src = outputById.get(edit.modelOutputId);
    if (!src) continue;
    ops.push(
      prisma.outputEdit.create({
        data: {
          modelOutputId: edit.modelOutputId,
          promptId: src.promptId,
          bucket,
          originalText: src.outputText,
          correctedText: edit.correctedText,
          rationale: edit.rationale || null,
          annotatorId,
        },
      }),
    );
  }

  await prisma.$transaction(ops);

  return NextResponse.json({ success: true, editsSaved: edits.length });
}
