import { NextResponse } from "next/server";
import { labGate } from "@/lib/speech/lab-route";
import { TtsJobError, launchSynthesis } from "@/lib/speech/tts-job";
import { ttsDeps } from "@/lib/speech/tts-deps";

/**
 * POST /api/speech/jobs/synthesize {candidateId, promptIds?}: the Synthesize
 * action on a TTS candidate. Up to 50 held-out-safe sentences (a named frozen
 * prompt is a bare 403; with no ids the route picks train-side Igala prompts
 * that have a consented answer). Each sentence id sent to the worker is a
 * Prompt id, so the callback can store the outputs as SpeechRecording rows
 * (community_only, derived, the model ref in sourceRef). Researcher-only,
 * 404 when the lab flag is off. 202 with the job id.
 */
export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.candidateId !== "string" || !body.candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }
  let promptIds: string[] | undefined;
  if (body.promptIds !== undefined) {
    if (
      !Array.isArray(body.promptIds) ||
      !body.promptIds.every((p) => typeof p === "string" && p)
    ) {
      return NextResponse.json({ error: "promptIds must be a list of prompt ids" }, { status: 400 });
    }
    promptIds = body.promptIds as string[];
  }

  try {
    const out = await launchSynthesis(ttsDeps(), {
      candidateId: body.candidateId,
      promptIds,
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
