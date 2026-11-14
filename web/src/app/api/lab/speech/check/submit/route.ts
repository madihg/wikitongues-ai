import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  answerWords,
  CHECK_VERDICTS,
  VERDICT_STATUS,
  type CheckVerdict,
} from "@/lib/speech/check";

/**
 * Submit one Check verdict (POST /api/lab/speech/check/submit). For the
 * speaker side of the lab; 404 when the lab flag is off.
 *
 * Body: { recordingId, verdict: matches | does_not_match | cannot_hear,
 * wrongWordIndex?, demoSessionId? }. `wrongWordIndex` is the position of the
 * word that does not match in the written answer, and only goes with
 * does_not_match.
 *
 *   400  bad verdict, or an index that does not fit the answer
 *   404  not a confirmed, written-answer clip
 *   403  the caller's own clip, or a frozen prompt (no detail)
 *
 * One row per (clip, reviewer): sending again CHANGES the verdict. A verdict
 * sets the clip's reviewStatus (matches keep, does_not_match wrong_text,
 * cannot_hear bad_audio); the last verdict wins. A demo verdict is stored
 * with isDemo true and leaves the clip's status alone. The reply carries no
 * transcript: that comes from GET /api/lab/speech/check/transcript, which
 * answers only once this verdict exists.
 */

export async function POST(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const reviewerId = gate.userId;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
  if (typeof b.recordingId !== "string" || !b.recordingId) {
    return bad("recordingId is required");
  }
  if (
    typeof b.verdict !== "string" ||
    !(CHECK_VERDICTS as readonly string[]).includes(b.verdict)
  ) {
    return bad(`verdict must be one of: ${CHECK_VERDICTS.join(", ")}`);
  }
  const verdict = b.verdict as CheckVerdict;
  const demoSessionId =
    typeof b.demoSessionId === "string" && b.demoSessionId
      ? b.demoSessionId
      : null;

  const clip = await prisma.speechRecording.findUnique({
    where: { id: b.recordingId },
    select: {
      id: true,
      annotatorId: true,
      uploadedAt: true,
      isDemo: true,
      demoSessionId: true,
      prompt: { select: { isHoldout: true, split: true } },
      coldAuthorAnswer: { select: { answerText: true } },
    },
  });
  const visible =
    clip &&
    clip.uploadedAt &&
    clip.coldAuthorAnswer &&
    (!clip.isDemo || (demoSessionId && clip.demoSessionId === demoSessionId));
  if (!visible) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
  if (clip.annotatorId === reviewerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (clip.prompt.isHoldout || clip.prompt.split === "test") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let wrongWordIndex: number | null = null;
  if (b.wrongWordIndex !== undefined && b.wrongWordIndex !== null) {
    const n = answerWords(clip.coldAuthorAnswer!.answerText).length;
    if (
      verdict !== "does_not_match" ||
      typeof b.wrongWordIndex !== "number" ||
      !Number.isInteger(b.wrongWordIndex) ||
      b.wrongWordIndex < 0 ||
      b.wrongWordIndex >= n
    ) {
      return bad("wrongWordIndex must be a word of the answer, with does_not_match");
    }
    wrongWordIndex = b.wrongWordIndex;
  }

  const isDemo = demoSessionId !== null || clip.isDemo;
  const row = { verdict, wrongWordIndex, isDemo };
  const check = await prisma.speechCheck.upsert({
    where: {
      recordingId_reviewerId: { recordingId: clip.id, reviewerId },
    },
    create: { recordingId: clip.id, reviewerId, ...row },
    update: row,
    select: { id: true, verdict: true, wrongWordIndex: true },
  });

  if (!isDemo) {
    await prisma.speechRecording.update({
      where: { id: clip.id },
      data: { reviewStatus: VERDICT_STATUS[verdict] },
      select: { id: true },
    });
  }
  return NextResponse.json({ ok: true, check });
}
