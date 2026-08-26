import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  diffToSegments,
  nfc,
  sanitizeSegments,
  segmentsEnvelope,
} from "@/lib/edit-segments";
import type { CorrectionRole } from "@/lib/pairing";
import type { Prisma } from "@prisma/client";

/**
 * Save a correction from the standalone lane (the editing ground,
 * tasks/editing-ground-spec.md 5d).
 *
 * Validation order: 401 no session; 400 missing fields / empty corrected;
 * 404 output not found; 403 not servable (servability is RE-DERIVED here -
 * pool arm, not held-out, a qualifying non-demo verdict by THIS annotator -
 * never trusting the client's claim that a verdict exists); 409 when this
 * annotator already has a non-demo edit on this output (a race where two
 * DIFFERENT annotators edit the same output both succeed: more signal, and
 * the queue stops serving it either way); 400 when nothing actually changed.
 *
 * Storage matches the episode path exactly: originalText = NFC(outputText),
 * client segments sanitized-or-derived (enrichment never blocks the write),
 * provenance from the verdict role (winner/tie -> model_correction,
 * both_inadequate -> salvage_both_inadequate - the value the schema comment
 * reserved), verificationStatus single_annotator, consent defaults true.
 */
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
    modelOutputId,
    correctedText,
    segments,
    rationale,
    consentBenchmark,
    consentTraining,
  } = body as Record<string, unknown>;

  if (typeof modelOutputId !== "string" || !modelOutputId) {
    return NextResponse.json(
      { error: "modelOutputId is required" },
      { status: 400 },
    );
  }
  if (typeof correctedText !== "string" || !correctedText.trim()) {
    return NextResponse.json(
      { error: "correctedText is required" },
      { status: 400 },
    );
  }

  const output = await prisma.modelOutput.findUnique({
    where: { id: modelOutputId },
    select: {
      id: true,
      promptId: true,
      bucket: true,
      outputText: true,
      prompt: { select: { bucket: true, isHoldout: true } },
      candidateModel: { select: { inPairingPool: true, archived: true } },
    },
  });
  if (!output) {
    return NextResponse.json(
      { error: "Model output not found" },
      { status: 404 },
    );
  }

  // Servability rules 1-2: pool arm, never a held-out prompt (an edit there
  // could never be used anywhere - holdout blocks training and edits never
  // enter the benchmark).
  const inPool =
    output.candidateModel?.inPairingPool === true &&
    output.candidateModel.archived === false;
  if (!inPool || output.prompt.isHoldout) {
    return NextResponse.json(
      { error: "This output is not open for correction" },
      { status: 403 },
    );
  }

  // Servability rule 3: a qualifying non-demo verdict by THIS annotator - the
  // output won, or the verdict was tie / both_inadequate. Oldest first, the
  // same order the queue serves, so provenance is deterministic.
  const verdicts = await prisma.pairwiseComparison.findMany({
    where: {
      annotatorId,
      isDemo: false,
      OR: [{ modelOutputAId: output.id }, { modelOutputBId: output.id }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { winner: true, modelOutputAId: true },
  });
  let role: CorrectionRole | null = null;
  for (const v of verdicts) {
    const isSideA = v.modelOutputAId === output.id;
    if (v.winner === "tie") role = "tie";
    else if (v.winner === "both_inadequate") role = "both_inadequate";
    else if (v.winner === (isSideA ? "a" : "b")) role = "winner";
    if (role) break;
  }
  if (!role) {
    return NextResponse.json(
      { error: "You have not judged this output, so it cannot be served here" },
      { status: 403 },
    );
  }

  // One lane edit per (annotator, output). Different annotators racing on the
  // same output both succeed - more signal, and the queue retires it anyway.
  const existing = await prisma.outputEdit.findFirst({
    where: { annotatorId, modelOutputId: output.id, isDemo: false },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You have already corrected this one" },
      { status: 409 },
    );
  }

  const originalNfc = nfc(output.outputText);
  const corrected = nfc(correctedText.trim());
  if (corrected === originalNfc.trim()) {
    return NextResponse.json(
      { error: "No change made - use Skip if nothing needs fixing" },
      { status: 400 },
    );
  }

  // Client segments carry the reasons; when absent or invalid, derive spans
  // server-side (reasons absent, structure still recorded).
  const segs =
    sanitizeSegments(segments, originalNfc, corrected) ??
    diffToSegments(originalNfc, corrected);

  try {
    await prisma.outputEdit.create({
      data: {
        modelOutputId: output.id,
        promptId: output.promptId,
        bucket: output.bucket ?? output.prompt.bucket ?? null,
        originalText: originalNfc,
        correctedText: corrected,
        rationale:
          typeof rationale === "string" && rationale.trim()
            ? rationale.trim()
            : null,
        segments: segmentsEnvelope(segs) as unknown as Prisma.InputJsonValue,
        provenance:
          role === "both_inadequate"
            ? "salvage_both_inadequate"
            : "model_correction",
        consentBenchmark: consentBenchmark !== false,
        consentTraining: consentTraining !== false,
        annotatorId,
        verificationStatus: "single_annotator",
        isDemo: false,
      },
      // select only id - prod may lag the client on newly added nullable
      // columns, and RETURNING all scalars would 500.
      select: { id: true },
    });
  } catch (e) {
    console.error("edit submit failed:", e);
    return NextResponse.json(
      { error: "Could not save your correction. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
