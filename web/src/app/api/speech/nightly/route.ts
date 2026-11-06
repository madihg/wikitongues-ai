import { NextResponse } from "next/server";
import { runNightly } from "@/lib/speech/nightly";
import { secretMatches } from "@/lib/speech/job-signing";
import { speechLoopEnabled } from "@/lib/speech/loop-flags";

/**
 * POST /api/speech/nightly: the 02:00 cron (worker/speech.py nightly_trigger)
 * calls this. No session: x-shared-secret, the same secret as the worker.
 *
 *   1. SPEECH_LOOP_ENABLED off -> 404 before anything else, for everyone;
 *   2. no SPEECH_WORKER_SECRET configured -> 503 with a clear message;
 *   3. wrong or missing secret -> bare 401;
 *   4. otherwise run the night. A second call for the same UTC date returns
 *      the existing run and does nothing. Errors inside the run are captured
 *      in the row; the cron always gets the row back.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!speechLoopEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const secret = process.env.SPEECH_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SPEECH_WORKER_SECRET is not set: it must equal the Modal secret wikitongues-speech." },
      { status: 503 },
    );
  }
  if (!secretMatches(req.headers.get("x-shared-secret"), secret)) {
    return new NextResponse(null, { status: 401 });
  }

  const { run, created } = await runNightly();
  return NextResponse.json({
    ok: true,
    created,
    run: {
      id: run.id,
      runDate: run.runDate.toISOString().slice(0, 10),
      outcome: run.outcome,
      costUsd: run.costUsd,
    },
  });
}
