import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";

/**
 * POST /api/speech/loop/pause {paused: boolean}: a researcher pauses or
 * resumes the loop. Writes the SpeechLoopState singleton; the nightly route
 * and every launch read it (decide() and scoreModel), so a pause stops spend
 * even with SPEECH_LOOP_ENABLED on. Audited in SpeechAudit.
 */
export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  let body: { paused?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // falls through to the 400 below
  }
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be true or false" }, { status: 400 });
  }
  const paused = body.paused;
  const now = new Date();

  await prisma.$transaction([
    prisma.speechLoopState.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        paused,
        pausedById: paused ? gate.userId : null,
        pausedAt: paused ? now : null,
      },
      update: {
        paused,
        pausedById: paused ? gate.userId : null,
        pausedAt: paused ? now : null,
      },
    }),
    prisma.speechAudit.create({
      data: {
        action: paused ? "pause" : "resume",
        subjectType: "SpeechLoopState",
        subjectId: "1",
        actorId: gate.userId,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, paused });
}
