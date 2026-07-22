import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRubricV2Axis, RUBRIC_VERSION } from "@/lib/buckets";
import type { Prisma } from "@prisma/client";

/**
 * Submit one annotation episode. The episode produces up to four independent
 * artifacts, each elicited as a separate act so "the signals agree" stays
 * meaningful:
 *   1. PairwiseComparison  — winner (a|b|tie|both_inadequate) + confidence + why
 *   2. RubricAxisScore[]   — rubric v2 (Lydia's axes) on the WINNER only,
 *                            0-5 per axis (0 = completely wrong) or null = N/A
 *   3. OutputEdit          — inline correction of the winner (gold SFT target)
 *   4. ColdAuthorAnswer    — the annotator's own answer, authored before models
 *                            were shown (gold-first), OR a salvage rewrite when
 *                            both outputs were inadequate.
 *
 * The explanation is encouraged but has NO minimum length (2026-07-02 call).
 * Demo-session submissions are flagged isDemo=true and excluded everywhere
 * training data is built.
 */

const WINNERS = ["a", "b", "tie", "both_inadequate"] as const;
type Winner = (typeof WINNERS)[number];

interface AxisScoreInput {
  axis: string;
  score: number | null; // 0-5, null = N/A
  note?: string;
}

interface AuthoredInput {
  answerText: string;
  // Plain-English "what it means / why" gloss (Lydia's two-box design). Training
  // metadata only - never merged into the Igala answer.
  englishGloss?: string;
  // The prompt/instruction itself rewritten in Igala, so one episode can mint two
  // training rows (English-instruction and Igala-instruction, both -> the answer).
  instructionIg?: string;
  consentBenchmark?: boolean;
  consentTraining?: boolean;
}

function validScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 5;
}

/** Parse rubric v2 axis scores. Returns null if the payload is malformed. */
function parseAxisScores(raw: unknown): AxisScoreInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AxisScoreInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (!isRubricV2Axis(o.axis)) return null;
    if (o.score !== null && !validScore(o.score)) return null;
    out.push({
      axis: o.axis as string,
      score: o.score as number | null,
      note:
        typeof o.note === "string" && o.note.trim() ? o.note.trim() : undefined,
    });
  }
  return out;
}

function parseAuthored(raw: unknown): AuthoredInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.answerText !== "string" || o.answerText.trim().length === 0)
    return null;
  const gloss =
    typeof o.englishGloss === "string" && o.englishGloss.trim()
      ? o.englishGloss.trim()
      : undefined;
  const instructionIg =
    typeof o.instructionIg === "string" && o.instructionIg.trim()
      ? o.instructionIg.trim()
      : undefined;
  return {
    answerText: o.answerText.trim(),
    englishGloss: gloss,
    instructionIg,
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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    promptId,
    modelOutputAId,
    modelOutputBId,
    winner,
    confidence,
    explanation,
    rubricAxes,
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

  // Explanation is encouraged but optional — no minimum length (2026-07-02 call).
  const explanationText =
    typeof explanation === "string" ? explanation.trim() : "";

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
  // Every axis must be answered: a 0-5 score or an explicit N/A (null),
  // and at least one axis must carry a real score.
  const hasWinner = win === "a" || win === "b";
  let axisScores: AxisScoreInput[] = [];
  if (hasWinner) {
    const parsed = parseAxisScores(rubricAxes);
    if (!parsed || parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            "Rubric on the winner is required: per-axis scores 0-5, or null for N/A",
        },
        { status: 400 },
      );
    }
    if (!parsed.some((a) => a.score !== null)) {
      return NextResponse.json(
        { error: "At least one rubric axis must be scored (not all N/A)" },
        { status: 400 },
      );
    }
    axisScores = parsed;
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

  // The Prompt's DB id (cuid). ColdAuthorAnswer.promptId is a FK to Prompt.id,
  // so it must use this — NOT the public promptId string (e.g. "ig_orth_001")
  // that the client sends, which would violate the FK and 500 the request.
  const promptDbId = outputA.promptId;

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
        explanation: explanationText,
        annotatorId,
        isDemo,
        demoSessionId: isDemo ? demoSessionId : null,
      },
    }),
  ];

  // Rubric v2 on the winner only: one row per axis. N/A axes (score null) are
  // stored too — an explicit "not relevant" is signal, not absence.
  if (hasWinner && winnerOutput) {
    for (const a of axisScores) {
      ops.push(
        prisma.rubricAxisScore.create({
          data: {
            promptId,
            modelOutputId: winnerOutput.id,
            bucket,
            axis: a.axis,
            score: a.score,
            note: a.note ?? null,
            rubricVersion: RUBRIC_VERSION,
            annotatorId,
            isDemo,
            demoSessionId: isDemo ? demoSessionId : null,
          },
        }),
      );
    }
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

  // The prompt-in-Igala rewrite is the same value for whichever gold rows this
  // episode creates. It's persisted after the transaction (best-effort) because
  // its column is applied additively and may not yet exist on the target DB -
  // see migration 20260715120000. coldIdx/salvageIdx locate the created rows in
  // the transaction results so we can attach it without risking the whole write.
  let instructionIgValue: string | null = null;
  let coldIdx = -1;
  let salvageIdx = -1;

  // Cold-authored source-free gold (authored before models were shown).
  let coldSaved = false;
  const cold = parseAuthored(coldAuthor);
  if (cold) {
    coldSaved = true;
    if (cold.instructionIg) instructionIgValue = cold.instructionIg;
    coldIdx = ops.length;
    ops.push(
      // select only id - prod may lag the client on newly added nullable columns, and RETURNING all scalars would 500
      prisma.coldAuthorAnswer.create({
        data: {
          promptId: promptDbId,
          bucket,
          answerText: cold.answerText,
          englishGloss: cold.englishGloss ?? null,
          provenance: "speaker_authored_sourcefree",
          consentBenchmark: cold.consentBenchmark ?? true,
          consentTraining: cold.consentTraining ?? true,
          annotatorId,
          isDemo,
          demoSessionId: isDemo ? demoSessionId : null,
        },
        select: { id: true },
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
      if (salvage.instructionIg) instructionIgValue = salvage.instructionIg;
      salvageIdx = ops.length;
      ops.push(
        // select only id - prod may lag the client on newly added nullable columns, and RETURNING all scalars would 500
        prisma.coldAuthorAnswer.create({
          data: {
            promptId: promptDbId,
            bucket,
            answerText: salvage.answerText,
            englishGloss: salvage.englishGloss ?? null,
            provenance: "corrected_from_inadequate",
            consentBenchmark: salvage.consentBenchmark ?? true,
            consentTraining: salvage.consentTraining ?? true,
            annotatorId,
            isDemo,
            demoSessionId: isDemo ? demoSessionId : null,
          },
          select: { id: true },
        }),
      );
    }
  }

  let results: unknown[];
  try {
    results = await prisma.$transaction(ops);
  } catch (e) {
    // Always return JSON — a bare 500 with an empty/HTML body makes the client's
    // response.json() throw the cryptic "Unexpected end of JSON input".
    console.error("annotation submit failed:", e);
    return NextResponse.json(
      { error: "Could not save your annotation. Please try again." },
      { status: 500 },
    );
  }

  // Attach the Igala prompt-rewrite to the gold row(s) just created. Best-effort
  // and isolated: the answer, gloss, and scores are already committed, so a
  // pending `instructionIg` column (additive migration 20260715120000) can never
  // fail a submission - it's simply skipped until the column exists.
  if (instructionIgValue) {
    const ids: string[] = [];
    if (coldIdx >= 0) ids.push((results[coldIdx] as { id: string }).id);
    if (salvageIdx >= 0) ids.push((results[salvageIdx] as { id: string }).id);
    if (ids.length > 0) {
      try {
        await prisma.coldAuthorAnswer.updateMany({
          where: { id: { in: ids } },
          data: { instructionIg: instructionIgValue },
        });
      } catch (e) {
        console.error("instructionIg not stored (column pending?):", e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    editsSaved,
    coldSaved,
    salvageSaved,
  });
}
