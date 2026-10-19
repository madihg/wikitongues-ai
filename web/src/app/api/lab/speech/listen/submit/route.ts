import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  MAX_NOTE_CHARS,
  REASON_KEYS,
  REJECTED_REVIEW_STATUSES,
  SPEECH_WINNERS,
  type SpeechWinner,
} from "@/lib/speech/limits";

/**
 * Submit one Listen judgment (POST /api/lab/speech/listen/submit).
 * Researcher-only; 404 when the flag is off.
 *
 * Body: { promptId (the public code), recordingAId, recordingBId,
 * winner: a | b | tie | both_unusable, reasonTags, note?, demoSessionId? }.
 *
 *   400  bad winner; no recognised reason tag (one is REQUIRED, unknown keys
 *        are dropped, as in the text route, so a stale client cannot 500);
 *        the same clip on both sides; a note over 500 characters
 *   404  unknown prompt, or a clip that is not a confirmed, unrejected clip
 *        of this prompt
 *   403  frozen prompt, no detail
 *   409  this researcher already has a counted judgment on this prompt
 *        (one per researcher and prompt, whatever the pair; matches the text
 *        route after its 2026-10-09 fix)
 *
 * A demo submission (`demoSessionId`) is stored with isDemo true and neither
 * blocks nor is blocked by the one-per-prompt rule.
 */

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const annotatorId = gate.userId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

  if (
    typeof b.promptId !== "string" ||
    !b.promptId ||
    typeof b.recordingAId !== "string" ||
    !b.recordingAId ||
    typeof b.recordingBId !== "string" ||
    !b.recordingBId
  ) {
    return bad("promptId, recordingAId and recordingBId are required");
  }
  if (b.recordingAId === b.recordingBId) {
    return bad("A and B must be different clips");
  }
  if (
    typeof b.winner !== "string" ||
    !(SPEECH_WINNERS as readonly string[]).includes(b.winner)
  ) {
    return bad(`winner must be one of: ${SPEECH_WINNERS.join(", ")}`);
  }
  const winner = b.winner as SpeechWinner;

  const reasonTags = Array.isArray(b.reasonTags)
    ? [
        ...new Set(
          b.reasonTags.filter(
            (t): t is string =>
              typeof t === "string" && REASON_KEYS.includes(t),
          ),
        ),
      ]
    : [];
  if (reasonTags.length === 0) {
    return bad("Pick at least one reason.");
  }

  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE_CHARS) return bad("The note is too long.");

  const demoSessionId =
    typeof b.demoSessionId === "string" && b.demoSessionId
      ? b.demoSessionId
      : null;
  const isDemo = demoSessionId !== null;

  const prompt = await prisma.prompt.findUnique({
    where: { promptId: b.promptId },
    select: { id: true, isHoldout: true, split: true },
  });
  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }
  if (prompt.isHoldout || prompt.split === "test") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clips = await prisma.speechRecording.findMany({
    where: { id: { in: [b.recordingAId, b.recordingBId] } },
    select: { id: true, promptId: true, uploadedAt: true, reviewStatus: true },
  });
  const usable = (id: string) => {
    const c = clips.find((x) => x.id === id);
    return (
      !!c &&
      c.promptId === prompt.id &&
      c.uploadedAt !== null &&
      !(c.reviewStatus && REJECTED_REVIEW_STATUSES.includes(c.reviewStatus))
    );
  };
  if (!usable(b.recordingAId) || !usable(b.recordingBId)) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  if (!isDemo) {
    const existing = await prisma.speechComparison.findFirst({
      where: { annotatorId, isDemo: false, promptId: prompt.id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "You have already judged this question (in another tab, perhaps). Reload the page to get the next one.",
        },
        { status: 409 },
      );
    }
  }

  const row = await prisma.speechComparison.create({
    data: {
      promptId: prompt.id,
      recordingAId: b.recordingAId,
      recordingBId: b.recordingBId,
      winner,
      reasonTags,
      note,
      annotatorId,
      isDemo,
      demoSessionId,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
