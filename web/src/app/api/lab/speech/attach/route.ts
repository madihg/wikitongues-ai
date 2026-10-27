import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";

/**
 * Link episode clips to the answer they say (POST /api/lab/speech/attach).
 * Researcher-only; 404 when the flag is off.
 *
 * The "Say it" block in the text episode records BEFORE the episode is
 * submitted, and the cold answer row only exists after submit. So the clips
 * are created unattached, and once the episode is saved the browser calls
 * this with the prompt code and the clip ids. The server finds the caller's
 * latest cold answer for that prompt (demo rows match demo clips) and attaches
 * it to those clips, only the caller's own, only ones still unattached.
 *
 * Body: { promptId (public code), recordingIds: string[] (at most 4) }
 *   400  bad body
 *   404  unknown prompt, or the caller has no answer for it
 * Returns { attached: n }. Never touches tier, consent or rights.
 */

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const ids = Array.isArray(b.recordingIds)
    ? b.recordingIds.filter((x): x is string => typeof x === "string" && !!x)
    : [];
  if (typeof b.promptId !== "string" || !b.promptId || ids.length === 0) {
    return NextResponse.json(
      { error: "promptId and recordingIds are required" },
      { status: 400 },
    );
  }
  if (ids.length > 4) {
    return NextResponse.json({ error: "Too many clips" }, { status: 400 });
  }

  const prompt = await prisma.prompt.findUnique({
    where: { promptId: b.promptId },
    select: { id: true },
  });
  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  const clips = await prisma.speechRecording.findMany({
    where: {
      id: { in: ids },
      annotatorId: gate.userId,
      promptId: prompt.id,
      coldAuthorAnswerId: null,
    },
    select: { id: true, isDemo: true },
  });

  let attached = 0;
  for (const isDemo of [false, true]) {
    const mine = clips.filter((c) => c.isDemo === isDemo).map((c) => c.id);
    if (mine.length === 0) continue;
    const answer = await prisma.coldAuthorAnswer.findFirst({
      where: { annotatorId: gate.userId, promptId: prompt.id, isDemo },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!answer) continue;
    const r = await prisma.speechRecording.updateMany({
      where: { id: { in: mine }, annotatorId: gate.userId, coldAuthorAnswerId: null },
      data: { coldAuthorAnswerId: answer.id },
    });
    attached += r.count;
  }
  if (attached === 0 && clips.length > 0) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }
  return NextResponse.json({ attached });
}
