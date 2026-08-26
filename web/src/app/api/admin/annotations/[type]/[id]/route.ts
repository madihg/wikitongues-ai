import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { bucketLabel, rubricV2Label } from "@/lib/buckets";
import { failureTagLabel } from "@/lib/failure-tags";
import { dialectLabel } from "@/lib/dialects";
import { isAnnotationType } from "@/lib/annotations-query";
import { diffToSegments, nfc, segmentsEnvelope } from "@/lib/edit-segments";
import { VerificationStatus, type Prisma } from "@prisma/client";

/**
 * GET  /api/admin/annotations/[type]/[id] — full detail for one annotation event.
 * PATCH same path — researcher correction (cold + edit only; pairwise is
 * READ-ONLY: an annotator's judgment must not be editable, for methodological
 * integrity). All researcher-gated.
 *
 * type is one of pairwise | cold | edit.
 */

const VERIFICATION_VALUES = Object.values(VerificationStatus) as string[];

function modelIdentity(o: {
  model: string;
  modelId: string;
  candidateModel: { name: string } | null;
}): string {
  // Prefer the arena candidate's human name; fall back to the denormalized
  // label, then the raw provider model id.
  return o.candidateModel?.name ?? o.model ?? o.modelId;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { error } = await requireResearcher();
  if (error) return error;

  const { type, id } = await params;
  if (!isAnnotationType(type)) {
    return NextResponse.json(
      { error: "Unknown annotation type" },
      { status: 404 },
    );
  }

  if (type === "pairwise") return pairwiseDetail(id);
  if (type === "cold") return coldDetail(id);
  return editDetail(id);
}

// ─── pairwise (read-only) ────────────────────────────────────────────────────

async function pairwiseDetail(id: string) {
  const c = await prisma.pairwiseComparison.findUnique({
    where: { id },
    include: {
      annotator: { select: { id: true, name: true, email: true } },
      modelOutputA: {
        select: {
          id: true,
          outputText: true,
          model: true,
          modelId: true,
          candidateModel: { select: { name: true } },
        },
      },
      modelOutputB: {
        select: {
          id: true,
          outputText: true,
          model: true,
          modelId: true,
          candidateModel: { select: { name: true } },
        },
      },
    },
  });
  if (!c) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // PairwiseComparison.promptId is the PUBLIC prompt string. We also grab the
  // cuid `id` so the cold-answer lookup below (whose promptId is a cuid FK) can
  // key off it without a second round-trip.
  const prompt = await prisma.prompt.findUnique({
    where: { promptId: c.promptId },
    select: { id: true, promptId: true, text: true, bucket: true },
  });

  const winnerOutputId =
    c.winner === "a"
      ? c.modelOutputAId
      : c.winner === "b"
        ? c.modelOutputBId
        : null;

  // Associated context from the SAME annotator on this prompt/pair:
  //  - rubric axis scores on the winning output
  //  - any edit on either output
  //  - any cold/salvage answer for this prompt
  const [rubricRows, editRows, coldRows] = await Promise.all([
    winnerOutputId
      ? prisma.rubricAxisScore.findMany({
          where: { modelOutputId: winnerOutputId, annotatorId: c.annotatorId },
          orderBy: { createdAt: "asc" },
          select: { axis: true, score: true, note: true },
        })
      : Promise.resolve([]),
    prisma.outputEdit.findMany({
      where: {
        annotatorId: c.annotatorId,
        modelOutputId: { in: [c.modelOutputAId, c.modelOutputBId] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        modelOutputId: true,
        correctedText: true,
        rationale: true,
        verificationStatus: true,
      },
    }),
    // ColdAuthorAnswer.promptId is a cuid FK; key off the prompt's cuid.
    prompt
      ? prisma.coldAuthorAnswer.findMany({
          where: { promptId: prompt.id, annotatorId: c.annotatorId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            answerText: true,
            provenance: true,
            verificationStatus: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    type: "pairwise",
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    editable: false,
    annotator: c.annotator,
    prompt: prompt
      ? {
          promptId: prompt.promptId,
          text: prompt.text,
          bucket: prompt.bucket ? bucketLabel(prompt.bucket) : null,
        }
      : { promptId: c.promptId, text: "", bucket: null },
    winner: c.winner,
    confidence: c.confidence,
    explanation: c.explanation,
    // Per-output failure diagnostics, resolved to their plain-English labels so
    // the reviewer never has to read raw config keys. Empty arrays are normal:
    // ties carry none, and every comparison recorded before this shipped has none.
    outputA: {
      id: c.modelOutputA.id,
      model: modelIdentity(c.modelOutputA),
      text: c.modelOutputA.outputText,
      isWinner: c.winner === "a",
      failureTags: c.failureTagsA.map((k) => ({
        key: k,
        label: failureTagLabel(k),
      })),
    },
    outputB: {
      id: c.modelOutputB.id,
      model: modelIdentity(c.modelOutputB),
      text: c.modelOutputB.outputText,
      isWinner: c.winner === "b",
      failureTags: c.failureTagsB.map((k) => ({
        key: k,
        label: failureTagLabel(k),
      })),
    },
    context: {
      rubricAxes: rubricRows.map((r) => ({
        axis: r.axis,
        axisLabel: rubricV2Label(r.axis),
        score: r.score,
        note: r.note,
      })),
      edits: editRows.map((e) => ({
        id: e.id,
        onOutput: e.modelOutputId === c.modelOutputAId ? "A" : "B",
        correctedText: e.correctedText,
        rationale: e.rationale,
        verificationStatus: e.verificationStatus,
      })),
      coldAnswers: coldRows.map((a) => ({
        id: a.id,
        answerText: a.answerText,
        provenance: a.provenance,
        verificationStatus: a.verificationStatus,
      })),
    },
  });
}

// ─── cold (editable: answerText, verificationStatus) ─────────────────────────

async function coldDetail(id: string) {
  // Explicit select (not include) - prod may lag the client on newly added
  // nullable columns (e.g. instructionIg), and an unscoped include RETURNS
  // all scalars, which 500s. List exactly what the response below consumes.
  const a = await prisma.coldAuthorAnswer.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      answerText: true,
      // The plain-English meaning of the answer. It was collected but never
      // returned here, so a reviewer reading a cold answer had no way to see
      // what the Igala actually says.
      englishGloss: true,
      dialect: true,
      provenance: true,
      consentBenchmark: true,
      consentTraining: true,
      verificationStatus: true,
      annotator: { select: { id: true, name: true, email: true } },
      prompt: { select: { promptId: true, text: true, bucket: true } },
    },
  });
  if (!a) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    type: "cold",
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    editable: true,
    annotator: a.annotator,
    prompt: a.prompt
      ? {
          promptId: a.prompt.promptId,
          text: a.prompt.text,
          bucket: a.prompt.bucket ? bucketLabel(a.prompt.bucket) : null,
        }
      : null,
    answerText: a.answerText,
    englishGloss: a.englishGloss,
    dialect: a.dialect,
    dialectLabel: a.dialect ? dialectLabel(a.dialect) : null,
    provenance: a.provenance,
    consentBenchmark: a.consentBenchmark,
    consentTraining: a.consentTraining,
    verificationStatus: a.verificationStatus,
  });
}

// ─── edit (editable: correctedText, verificationStatus) ──────────────────────

async function editDetail(id: string) {
  const e = await prisma.outputEdit.findUnique({
    where: { id },
    include: {
      annotator: { select: { id: true, name: true, email: true } },
      modelOutput: {
        select: {
          model: true,
          modelId: true,
          candidateModel: { select: { name: true } },
          prompt: { select: { promptId: true, text: true, bucket: true } },
        },
      },
    },
  });
  if (!e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const p = e.modelOutput?.prompt ?? null;
  return NextResponse.json({
    type: "edit",
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    editable: true,
    annotator: e.annotator,
    prompt: p
      ? {
          promptId: p.promptId,
          text: p.text,
          bucket: p.bucket ? bucketLabel(p.bucket) : null,
        }
      : null,
    model: e.modelOutput ? modelIdentity(e.modelOutput) : null,
    originalText: e.originalText,
    correctedText: e.correctedText,
    rationale: e.rationale,
    provenance: e.provenance,
    consentBenchmark: e.consentBenchmark,
    consentTraining: e.consentTraining,
    verificationStatus: e.verificationStatus,
  });
}

// ─── PATCH (researcher corrections) ──────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { error } = await requireResearcher();
  if (error) return error;

  const { type, id } = await params;
  if (!isAnnotationType(type)) {
    return NextResponse.json(
      { error: "Unknown annotation type" },
      { status: 404 },
    );
  }

  // Pairwise judgments are immutable by design.
  if (type === "pairwise") {
    return NextResponse.json(
      { error: "Pairwise comparisons are read-only" },
      { status: 405 },
    );
  }

  // Guard req.json() so a bad body returns JSON 400, never a bare 500.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  // verificationStatus, if present, must be a valid enum value.
  let verificationStatus: VerificationStatus | undefined;
  if ("verificationStatus" in o && o.verificationStatus != null) {
    if (
      typeof o.verificationStatus !== "string" ||
      !VERIFICATION_VALUES.includes(o.verificationStatus)
    ) {
      return NextResponse.json(
        {
          error: `verificationStatus must be one of: ${VERIFICATION_VALUES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    verificationStatus = o.verificationStatus as VerificationStatus;
  }

  if (type === "cold") {
    const data: {
      answerText?: string;
      verificationStatus?: VerificationStatus;
    } = {};
    if ("answerText" in o) {
      if (
        typeof o.answerText !== "string" ||
        o.answerText.trim().length === 0
      ) {
        return NextResponse.json(
          { error: "answerText must be a non-empty string" },
          { status: 400 },
        );
      }
      data.answerText = o.answerText.trim();
    }
    if (verificationStatus) data.verificationStatus = verificationStatus;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    try {
      const updated = await prisma.coldAuthorAnswer.update({
        where: { id },
        data,
        select: {
          id: true,
          answerText: true,
          verificationStatus: true,
        },
      });
      return NextResponse.json({ success: true, ...updated });
    } catch (e) {
      return notFoundOr500(e);
    }
  }

  // type === "edit"
  const data: {
    correctedText?: string;
    originalText?: string;
    segments?: Prisma.InputJsonValue;
    verificationStatus?: VerificationStatus;
  } = {};
  if ("correctedText" in o) {
    if (
      typeof o.correctedText !== "string" ||
      o.correctedText.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "correctedText must be a non-empty string" },
        { status: 400 },
      );
    }
    // THE EDITING GROUND invariant: applySegments(originalText, segments) ===
    // correctedText must hold on the stored row. A researcher rewrite of
    // correctedText that left the old segments in place would break exactly
    // that reconstruction, so the spans are RE-DERIVED here against the
    // stored original (reasons on vanished spans are dropped - the rewrite
    // superseded them). Both texts land NFC, matching the write paths.
    const existing = await prisma.outputEdit.findUnique({
      where: { id },
      select: { originalText: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const originalNfc = nfc(existing.originalText);
    const corrected = nfc(o.correctedText.trim());
    data.correctedText = corrected;
    // Legacy rows may predate the NFC contract; re-store the NFC form so the
    // offsets in the fresh envelope address the text actually on the row.
    if (existing.originalText !== originalNfc) data.originalText = originalNfc;
    data.segments = segmentsEnvelope(
      diffToSegments(originalNfc, corrected),
    ) as unknown as Prisma.InputJsonValue;
  }
  if (verificationStatus) data.verificationStatus = verificationStatus;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  try {
    const updated = await prisma.outputEdit.update({
      where: { id },
      data,
      select: {
        id: true,
        correctedText: true,
        verificationStatus: true,
      },
    });
    return NextResponse.json({ success: true, ...updated });
  } catch (e) {
    return notFoundOr500(e);
  }
}

function notFoundOr500(e: unknown): NextResponse {
  // Prisma throws P2025 "record to update not found".
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2025"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.error("annotation PATCH failed:", e);
  return NextResponse.json(
    { error: "Could not save the correction. Please try again." },
    { status: 500 },
  );
}
