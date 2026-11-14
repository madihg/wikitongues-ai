import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { latestTranscript } from "@/lib/speech/transcripts";

/**
 * The machine transcript of a clip, AFTER the caller has given a verdict on
 * it (GET /api/lab/speech/check/transcript?recordingId=...). For the speaker
 * side of the lab; 404 when the lab flag is off. Before the caller's first
 * verdict on the clip the answer is 403 and the transcript table is not
 * read, so the machine's reading can never colour the first judgment.
 * `transcript` is null when no transcript exists for the clip yet.
 */

export async function GET(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;

  const recordingId = new URL(req.url).searchParams.get("recordingId");
  if (!recordingId) {
    return NextResponse.json({ error: "recordingId is required" }, { status: 400 });
  }

  const verdict = await prisma.speechCheck.findUnique({
    where: {
      recordingId_reviewerId: { recordingId, reviewerId: gate.userId },
    },
    select: { id: true },
  });
  if (!verdict) {
    return NextResponse.json(
      { error: "Give your verdict first." },
      { status: 403 },
    );
  }
  return NextResponse.json({
    transcript: await latestTranscript(prisma, recordingId),
  });
}
