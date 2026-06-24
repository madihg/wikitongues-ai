import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Submit one annotation episode. The episode produces up to four independent
 * artifacts, each elicited as a separate act so "the signals agree" stays
 * meaningful:
 *   1. PairwiseComparison  — winner (a|b|tie|both_inadequate) + confidence + why
 *   2. RubricScore         — on the WINNER only (a|b), least-work / cleanest target
 *   3. OutputEdit          — inline correction of the winner (gold SFT target)
 *   4. ColdAuthorAnswer    — the annotator's own answer, authored before models
 *                            were shown (gold-first), OR a salvage rewrite when
 *                            both outputs were inadequate.
 *
 * Demo-session submissions are flagged isDemo=true and excluded everywhere
 * training data is built.
 */

const WINNERS = ["a", "b", "tie", "both_inadequate"] as const;
type Winner = (typeof WINNERS)[number];

interface RubricInput {
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
  notesCulturalAccuracy?: string;
  notesLinguisticAuthenticity?: string;
  notesCulturalNormAdherence?: string;
  notesFactualCorrectness?: string;
}

interface AuthoredInput {
  answerText: string;
  consentBenchmark?: boolean;
  consentTraining?: boolean;
}

function validScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

function validateRubric(r: unknown): r is RubricInput {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    validScore(o.culturalAccuracy) &&
    validScore(o.linguisticAuthenticity) &&
    validScore(o.culturalNormAdherence) &&
    validScore(o.factualCorrectness)
  );
}

function parseAuthored(raw: unknown): AuthoredInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.answerText !== "string" || o.answerText.trim().length === 0)
    return null;
  return {
    answerText: o.answerText.trim(),
    consentBenchmark: o.consentBenchmark !== false,
    consentTraining: o.consentTraining !== false,
  };
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
    confidence,
    explanation,
    rubric,
    edit,
    coldAuthor,
    salvageAnswer,
    demoSessionId,
  } = body;

  if (!promptId || !modelOutputAId || !modelOutputBId) {
    return NextResponse.json(
      { error: "Missing promptId, modelOutputAId, or modelOutputBId" },
      { status: 400 },
    );
  }

  if (!WINNERS.includes(winner as Winner)) {
    return NextResponse.json(
      { error: `winner must be one of: ${WINNERS.join(", ")}` },
      { status: 400 },
    );
  }
  const win = winner as Winner;

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

  let conf: number | null = null;
  if (confidence != null) {
    if (
      typeof confidence !== "number" ||
      !Number.isInteger(confidence) ||
      confidence < 1 ||
      confidence > 4
    ) {
      return NextResponse.json(
        { error: "confidence must be an integer from 1 to 4" },
        { status: 400 },
      );
    }
    conf = confidence;
  }

  // Rubric is required when there is a single winner; ignored otherwise.
  const hasWinner = win === "a" || win === "b";
  if (hasWinner && !validateRubric(rubric)) {
    return NextResponse.json(
      { error: "Rubric on the winner is required (four integer scores 1-5)" },
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

  const prompt = await prisma.prompt.findUnique({
    where: { id: outputA.promptId },
    select: { bucket: true },
  });
  const bucket = outputA.bucket ?? prompt?.bucket ?? null;

  const isDemo = typeof demoSessionId === "string" && demoSessionId.length > 0;

  // Outside a demo, one comparison per (annotator, prompt, pair).
  if (!isDemo) {
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
  }

  const winnerOutput = win === "a" ? outputA : win === "b" ? outputB : null;

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.pairwiseComparison.create({
      data: {
        promptId,
        bucket,
        modelOutputAId,
        modelOutputBId,
        winner: win,
        confidence: conf,
        explanation: explanation.trim(),
        annotatorId,
        isDemo,
        demoSessionId: isDemo ? demoSessionId : null,
      },
    }),
  ];

  // Rubric on the winner only.
  if (hasWinner && winnerOutput && validateRubric(rubric)) {
    ops.push(
      prisma.rubricScore.create({
        data: {
          promptId,
          modelOutputId: winnerOutput.id,
          bucket,
          culturalAccuracy: rubric.culturalAccuracy,
          linguisticAuthenticity: rubric.linguisticAuthenticity,
          culturalNormAdherence: rubric.culturalNormAdherence,
          factualCorrectness: rubric.factualCorrectness,
          notesCulturalAccuracy: rubric.notesCulturalAccuracy || null,
          notesLinguisticAuthenticity:
            rubric.notesLinguisticAuthenticity || null,
          notesCulturalNormAdherence: rubric.notesCulturalNormAdherence || null,
          notesFactualCorrectness: rubric.notesFactualCorrectness || null,
          confidence: conf,
          annotatorId,
          isDemo,
          demoSessionId: isDemo ? demoSessionId : null,
        },
      }),
    );
  }

  // Inline edit -> gold SFT target. Targets the explicit modelOutputId if given
  // (the tie path corrects a chosen side without faking a winner), otherwise the
  // winner. Not used for both_inadequate (salvage authoring is used instead).
  let editsSaved = 0;
  if (edit && typeof edit === "object") {
    const e = edit as Record<string, unknown>;
    const targetId =
      typeof e.modelOutputId === "string" ? e.modelOutputId : null;
    const target =
      targetId === outputA.id
        ? outputA
        : targetId === outputB.id
          ? outputB
          : winnerOutput;
    const corrected =
      typeof e.correctedText === "string" ? e.correctedText.trim() : "";
    if (target && corrected && corrected !== target.outputText.trim()) {
      editsSaved = 1;
      ops.push(
        prisma.outputEdit.create({
          data: {
            modelOutputId: target.id,
            promptId: target.promptId,
            bucket,
            originalText: target.outputText,
            correctedText: corrected,
            rationale: typeof e.rationale === "string" ? e.rationale : null,
            provenance: "model_correction",
            consentBenchmark: e.consentBenchmark !== false,
            consentTraining: e.consentTraining !== false,
            annotatorId,
            isDemo,
            demoSessionId: isDemo ? demoSessionId : null,
          },
        }),
      );
    }
  }

  // Cold-authored source-free gold (authored before models were shown).
  let coldSaved = false;
  const cold = parseAuthored(coldAuthor);
  if (cold) {
    coldSaved = true;
    ops.push(
      prisma.coldAuthorAnswer.create({
        data: {
          promptId,
          bucket,
          answerText: cold.answerText,
          provenance: "speaker_authored_sourcefree",
          consentBenchmark: cold.consentBenchmark ?? true,
          consentTraining: cold.consentTraining ?? true,
          annotatorId,
          isDemo,
          demoSessionId: isDemo ? demoSessionId : null,
        },
      }),
    );
  }

  // Salvage rewrite when both outputs were inadequate (a fresh correct answer,
  // not an edit of any one output) -> also a gold target.
  let salvageSaved = false;
  if (win === "both_inadequate") {
    const salvage = parseAuthored(salvageAnswer);
    if (salvage) {
      salvageSaved = true;
      ops.push(
        prisma.coldAuthorAnswer.create({
          data: {
            promptId,
            bucket,
            answerText: salvage.answerText,
            provenance: "corrected_from_inadequate",
            consentBenchmark: salvage.consentBenchmark ?? true,
            consentTraining: salvage.consentTraining ?? true,
            annotatorId,
            isDemo,
            demoSessionId: isDemo ? demoSessionId : null,
          },
        }),
      );
    }
  }

  await prisma.$transaction(ops);

  return NextResponse.json({
    success: true,
    editsSaved,
    coldSaved,
    salvageSaved,
  });
}
