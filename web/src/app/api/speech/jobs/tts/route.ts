import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { isStudioSessionId } from "@/lib/speech/studio";
import {
  TtsJobError,
  launchTtsJob,
  parseTtsHyperparameters,
} from "@/lib/speech/tts-job";
import { ttsDeps } from "@/lib/speech/tts-deps";

/**
 * POST /api/speech/jobs/tts {studioSessionIds[], hyperparameters?}: train one
 * TTS voice from the KEPT clips of the named studio sittings. Researcher-only,
 * 404 when the lab flag is off. The manifest goes through the one training
 * guard (purpose "tts"); the worker's signed callback registers the candidate.
 * 202 with the job id; 400 for a malformed body, 422 when no kept clip is
 * left, 503 when the worker is configured but the bucket is not, 502 when the
 * worker refuses.
 *
 * GET lists the recent TTS jobs and the registered voices (candidates).
 */

const MAX_SESSIONS = 20;

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ids = body.studioSessionIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_SESSIONS ||
    !ids.every(isStudioSessionId)
  ) {
    return NextResponse.json(
      { error: `studioSessionIds must be 1 to ${MAX_SESSIONS} session ids` },
      { status: 400 },
    );
  }
  const hyperparameters = parseTtsHyperparameters(body.hyperparameters);
  if (hyperparameters === "invalid") {
    return NextResponse.json(
      { error: "hyperparameters accepts numSteps (integer) and lr (0 to 1) only" },
      { status: 400 },
    );
  }

  try {
    const out = await launchTtsJob(ttsDeps(), {
      studioSessionIds: [...new Set(ids as string[])],
      hyperparameters,
      userId: gate.userId,
    });
    return NextResponse.json(out, { status: 202 });
  } catch (e) {
    if (e instanceof TtsJobError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const [jobs, candidates] = await Promise.all([
    prisma.speechTrainJob.findMany({
      where: { system: "tts" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, baseModel: true, manifestVersion: true, createdAt: true, completedAt: true },
    }),
    prisma.speechCandidate.findMany({
      where: { system: "tts" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, modelRef: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ jobs, candidates });
}
