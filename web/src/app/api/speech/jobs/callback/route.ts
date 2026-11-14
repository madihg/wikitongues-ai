import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { registerCandidate } from "@/lib/speech/candidates";
import { applyCallback, parseCallback } from "@/lib/speech/job-callback";
import { loopProvider, scoreModel } from "@/lib/speech/loop-launch";
import { speechLoopEnabled } from "@/lib/speech/loop-flags";
import {
  secretMatches,
  timestampFresh,
  verifySignature,
} from "@/lib/speech/job-signing";

/**
 * POST /api/speech/jobs/callback: the Modal worker reports a finished job.
 * No session: the caller proves itself with x-shared-secret, x-timestamp
 * (within 300 s) and x-signature over the raw body (job-signing.ts). Any
 * mismatch is a bare 401. With SPEECH_WORKER_SECRET unset the route is dark
 * (404), so the unconfigured app behaves as before. Idempotent: a callback
 * for a finished job answers 200 and writes nothing.
 */
// Scoring a model that just finished training signs the exam clips and calls the worker.
export const maxDuration = 60;

const unauthorized = () => new NextResponse(null, { status: 401 });

export async function POST(req: Request) {
  const secret = process.env.SPEECH_WORKER_SECRET;
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.text();
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  if (
    !secretMatches(req.headers.get("x-shared-secret"), secret) ||
    !timestampFresh(timestamp) ||
    !timestamp ||
    !signature ||
    !verifySignature(secret, timestamp, raw, signature)
  ) {
    return unauthorized();
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const payload = parseCallback(json);
  if (!payload) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const job = await prisma.speechTrainJob.findUnique({
    where: { id: payload.jobId },
    select: { id: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  if (job.status !== "queued" && job.status !== "running") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const registered = await prisma.$transaction(async (tx) => {
    const applied = await applyCallback(tx, payload);
    if (!applied) return { applied, candidate: null };
    // An evaluate that scored a trained model makes it a candidate (PR F).
    return { applied, candidate: await registerCandidate(tx, payload) };
  });
  if (!registered.applied) return NextResponse.json({ ok: true, duplicate: true });

  if (registered.candidate?.regressed) {
    const d = registered.candidate.delta;
    await notify("regressed", [
      `candidate ${registered.candidate.candidateId} is worse than the promoted model`,
      d ? `cer ${d.cer.toFixed(2)} points, ter ${d.ter.toFixed(2)} points` : "",
    ].filter(Boolean));
  }
  if (
    payload.kind === "train_asr" &&
    payload.status === "succeeded" &&
    payload.modelRef &&
    speechLoopEnabled()
  ) {
    // Score the new model on the exam set now, not at the next 02:00. The
    // nightly run retries it if this fails; the callback itself still succeeds.
    try {
      await scoreModel(payload.modelRef, loopProvider());
    } catch (e) {
      await notify("job_failed", [
        `scoring ${payload.jobId} could not start: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`,
      ]);
    }
  }
  return NextResponse.json({ ok: true, duplicate: false });
}
