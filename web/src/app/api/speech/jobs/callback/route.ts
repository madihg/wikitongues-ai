import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCallback, parseCallback } from "@/lib/speech/job-callback";
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

  const applied = await prisma.$transaction((tx) => applyCallback(tx, payload));
  return NextResponse.json({ ok: true, duplicate: !applied });
}
