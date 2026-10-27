import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { MAX_BYTES } from "@/lib/speech/limits";
import { parseRange } from "@/lib/speech/range";
import { baseMime } from "@/lib/speech/storage";

/**
 * A clip's audio, stored in Postgres (`bytes` on SpeechRecording).
 *
 * PUT  /api/lab/speech/recording/[id]/audio
 *   The body IS the audio. Researcher-only; the row must be yours. The
 *   server computes sizeBytes and the sha256 itself (it trusts nothing the
 *   client says about the bytes) and sets uploadedAt, which is what makes
 *   the clip visible to review, listening and export.
 *     400  empty body, or a Content-Type that is not an audio type
 *     404  no such recording of yours (same answer for someone else's row)
 *     409  the clip already has its audio (bytes are never replaced)
 *     413  more than 4 MB (checked on the declared length first, then on
 *          the bytes actually read)
 *     415  the Content-Type does not match the mime type the row declared
 *
 * GET  /api/lab/speech/recording/[id]/audio
 *   Researcher-only. Serves the stored bytes with the row's Content-Type.
 *   Any researcher can hear any confirmed clip (Listen and Recordings need
 *   that); a demo clip only its own maker. Never cacheable by a shared
 *   cache: `private, no-store`, so a CDN keeps no copy.
 *
 * `bytes` is selected here and nowhere else. No list or export query may
 * select it (see audio-bytes-guard.test.ts).
 */

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const { id } = await params;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json(
      { error: "A clip can be at most 4 MB" },
      { status: 413 },
    );
  }

  const row = await prisma.speechRecording.findFirst({
    where: { id, annotatorId: gate.userId },
    select: { id: true, mimeType: true, uploadedAt: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  if (row.uploadedAt) {
    return NextResponse.json(
      { error: "This clip already has its audio." },
      { status: 409 },
    );
  }

  const type = baseMime(req.headers.get("content-type") ?? "");
  if (!type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "Send the audio as the request body with an audio Content-Type." },
      { status: 400 },
    );
  }
  if (type !== baseMime(row.mimeType)) {
    return NextResponse.json(
      { error: `This clip was declared as ${baseMime(row.mimeType)}.` },
      { status: 415 },
    );
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) {
    return NextResponse.json({ error: "The audio is empty." }, { status: 400 });
  }
  if (body.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "A clip can be at most 4 MB" },
      { status: 413 },
    );
  }

  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  // One winner if two uploads race: only a row still without audio updates.
  const result = await prisma.speechRecording.updateMany({
    where: { id, annotatorId: gate.userId, uploadedAt: null },
    data: {
      bytes: body,
      sizeBytes: body.length,
      checksumSha256,
      uploadedAt: new Date(),
    },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "This clip already has its audio." },
      { status: 409 },
    );
  }
  return NextResponse.json({
    recording: { id, sizeBytes: body.length, checksumSha256 },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const { id } = await params;

  const row = await prisma.speechRecording.findUnique({
    where: { id },
    select: {
      bytes: true,
      mimeType: true,
      uploadedAt: true,
      isDemo: true,
      annotatorId: true,
    },
  });
  const visible =
    row &&
    row.bytes &&
    row.uploadedAt &&
    (!row.isDemo || row.annotatorId === gate.userId);
  if (!visible) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const bytes = Buffer.from(row.bytes!);
  const headers: Record<string, string> = {
    "Content-Type": baseMime(row.mimeType),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  const range = parseRange(req.headers.get("range"), bytes.length);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  }
  if (range) {
    const part = bytes.subarray(range.start, range.end + 1);
    return new Response(part, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
      },
    });
  }
  return new Response(bytes, {
    status: 200,
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
