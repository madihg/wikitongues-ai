import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  DEFAULT_TARGET_HOURS,
  STUDIO_SAMPLE_RATE,
  STUDIO_TIER,
  isStudioSessionId,
  summarizeStudio,
} from "@/lib/speech/studio";

/**
 * GET /api/lab/speech/studio?session=<id>&hours=<n>: the studio session
 * summary (PRD US-026). Researcher-only; 404 when the flag is off. Minutes
 * recorded and minutes kept for this sitting, the running total over every
 * studio sitting of this speaker, and the share of the target (default 5
 * hours) that kept minutes have reached. Only the speaker's own counted
 * (non-demo, uploaded) studio clips are read, with an explicit select that
 * never names the audio.
 */
export async function GET(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  if (!isStudioSessionId(session)) {
    return NextResponse.json({ error: "session is required" }, { status: 400 });
  }
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam === null ? DEFAULT_TARGET_HOURS : Number(hoursParam);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 100) {
    return NextResponse.json({ error: "hours must be a number from 0 to 100" }, { status: 400 });
  }

  const rows = await prisma.speechRecording.findMany({
    where: {
      annotatorId: gate.userId,
      studioSessionId: { not: null },
      uploadedAt: { not: null },
      isDemo: false,
    },
    select: { studioSessionId: true, durationMs: true, reviewStatus: true },
  });
  return NextResponse.json({
    ...summarizeStudio(rows, session, hours),
    recording: { sampleRate: STUDIO_SAMPLE_RATE, tier: STUDIO_TIER },
  });
}
