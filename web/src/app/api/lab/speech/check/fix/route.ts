import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionIsLead } from "@/lib/admin/lead-route";
import { applyAnswerEdit } from "@/lib/answer-edit";
import { checkFixSaveId } from "@/lib/answer-revisions";
import { labGate } from "@/lib/speech/lab-route";
import { VERDICT_STATUS } from "@/lib/speech/check";
import { WITHDRAWN_REVIEW_STATUS } from "@/lib/speech/withdrawal";

/**
 * Fix the written text of someone else's clip from Check
 * (POST /api/lab/speech/check/fix). Research leads only (the owner and
 * RESEARCH_LEADS): Halim, Nov 20 2026. Every other checker keeps the verdict,
 * the wrong word and the note, and the speaker fixes their own text.
 *
 * Body: { recordingId, answerText }.
 *
 * The lead has just listened to the clip and writes what it says. So the fix:
 *   - goes through the same edit log as every other edit (applyAnswerEdit):
 *     an AnswerRevision row under the lead's name, the speaker as author,
 *     the text before kept exactly;
 *   - carries a save id that names this clip, so the clip is not left out
 *     of the datasets as "text changed after recording" (staleClipIds);
 *   - records the lead's verdict on this clip as "matches", since the text
 *     now says what the clip says.
 *
 *   400  bad body, or no change
 *   403  not a research lead, the lead's own clip, or a frozen prompt
 *   404  lab off, or not a confirmed written-answer clip
 */
export async function POST(req: Request) {
  // Researcher audience: a research lead is always a researcher.
  const gate = await labGate();
  if (gate.error) return gate.error;
  const editorId = gate.userId;
  if (!(await sessionIsLead())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? null;

  const b = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof b.recordingId !== "string" || !b.recordingId) {
    return NextResponse.json(
      { error: "recordingId is required" },
      { status: 400 },
    );
  }
  if (typeof b.answerText !== "string" || !b.answerText.trim()) {
    return NextResponse.json(
      { error: "answerText is required" },
      { status: 400 },
    );
  }

  const clip = await prisma.speechRecording.findUnique({
    where: { id: b.recordingId },
    select: {
      id: true,
      annotatorId: true,
      uploadedAt: true,
      reviewStatus: true,
      isDemo: true,
      language: true,
      coldAuthorAnswerId: true,
      prompt: { select: { isHoldout: true, split: true } },
    },
  });
  if (
    !clip ||
    !clip.uploadedAt ||
    clip.isDemo ||
    clip.reviewStatus === WITHDRAWN_REVIEW_STATUS ||
    !clip.coldAuthorAnswerId ||
    clip.language === "english"
  ) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
  if (clip.annotatorId === editorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (clip.prompt.isHoldout || clip.prompt.split === "test") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  const res = await applyAnswerEdit({
    type: "cold",
    id: clip.coldAuthorAnswerId,
    body: {
      answerText: b.answerText,
      saveId: checkFixSaveId(clip.id, rand),
    },
    userId: editorId,
    role,
  });
  if (res.status !== 200) {
    return NextResponse.json(res.body, { status: res.status });
  }
  const changed = (res.body.changed as string[] | undefined) ?? [];
  if (changed.length === 0) {
    return NextResponse.json(
      { error: "The text is the same as before." },
      { status: 400 },
    );
  }

  const row = {
    verdict: "matches" as const,
    wrongWordIndex: null,
    level: null,
    note: null,
    isDemo: false,
  };
  await prisma.speechCheck.upsert({
    where: { recordingId_reviewerId: { recordingId: clip.id, reviewerId: editorId } },
    create: { recordingId: clip.id, reviewerId: editorId, ...row },
    update: row,
    select: { id: true },
  });
  await prisma.speechRecording.update({
    where: { id: clip.id },
    data: { reviewStatus: VERDICT_STATUS.matches },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, changed });
}
