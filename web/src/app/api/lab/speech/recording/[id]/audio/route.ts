import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { MAX_BYTES, MAX_CLIP_BYTES } from "@/lib/speech/limits";
import { parseRange } from "@/lib/speech/range";
import { baseMime, recordingPath } from "@/lib/speech/storage";
import {
  putClip,
  signedUrl,
  storageEnabled,
} from "@/lib/speech/storage-supabase";

/**
 * A clip's audio, stored in Postgres (`bytes` on SpeechRecording) and, when
 * SPEECH_STORAGE=1, also in the private bucket `igala-speech` (`storageKey`).
 * Postgres stays the source of truth until every row is moved; turning the
 * flag off puts reads back on the bytes.
 *
 * PUT  /api/lab/speech/recording/[id]/audio
 *   The body IS the audio. Researcher-only; the row must be yours. The
 *   server computes sizeBytes and the sha256 itself (it trusts nothing the
 *   client says about the bytes) and sets uploadedAt, which is what makes
 *   the clip visible to review, listening and export. With storage on, the
 *   bytes are also uploaded first and storageKey is set in the same update;
 *   if that upload fails the row is written as before (bytes only).
 *     400  empty body, or a Content-Type that is not an audio type
 *     404  no such recording of yours (same answer for someone else's row)
 *     409  the clip already has its audio (bytes are never replaced)
 *     413  more than 4 MB (checked on the declared length first, then on
 *          the bytes actually read)
 *     415  the Content-Type does not match the mime type the row declared
 *
 *   IN PARTS (?offset=<n>&total=<n>), for a take over 4 MB: a long take (the
 *   recorder runs up to five minutes since 2026-11-24) can be larger than
 *   one request body may be. Each part is at most 4 MB; `total` is the
 *   whole clip, at most 20 MB (MAX_CLIP_BYTES). The server appends a part
 *   only when `offset` is exactly what it already holds, so a part sent
 *   twice is never stored twice, and every answer says how much it holds:
 *   `{ received, complete }`. The client always carries on from `received`.
 *   Part 0 starts the clip again from nothing (a new attempt). The part
 *   that brings the clip to `total` does what a single PUT does: size and
 *   sha256 over the whole clip, the bucket copy, uploadedAt. Until then the
 *   row holds part of the audio and uploadedAt stays null, so nothing reads
 *   it. A single PUT with no query is unchanged.
 *     400  offset or total missing, not whole numbers, or past each other
 *     413  total over 20 MB, or one part over 4 MB
 *
 * GET  /api/lab/speech/recording/[id]/audio
 *   Researcher-only. With storage on and a storageKey, answers 302 to a
 *   one-hour signed URL; otherwise serves the stored bytes with the row's
 *   Content-Type and Range support. A range answer is at most 4 MB (a
 *   function's response body is capped like its request body), so a long
 *   clip served from Postgres plays as a series of ranges; a clip over 4 MB
 *   asked for without a Range gets its first 4 MB as a 206.
 *   Any researcher can hear any confirmed clip (Listen and Recordings need
 *   that); a demo clip only its own maker. Never cacheable by a shared
 *   cache: `private, no-store`, so a CDN keeps no copy.
 *
 * `bytes` is selected here and nowhere else. No list or export query may
 * select it (see audio-bytes-guard.test.ts).
 */

/** `?offset=&total=` of a part upload; null for a single PUT; "bad" when malformed. */
export function parsePart(
  search: URLSearchParams,
): { offset: number; total: number } | null | "bad" {
  const o = search.get("offset");
  const t = search.get("total");
  if (o === null && t === null) return null;
  if (o === null || t === null) return "bad";
  if (!/^\d{1,9}$/.test(o) || !/^\d{1,9}$/.test(t)) return "bad";
  const offset = Number(o);
  const total = Number(t);
  if (total <= 0 || offset >= total) return "bad";
  return { offset, total };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const { id } = await params;

  const part = parsePart(new URL(req.url).searchParams);
  if (part === "bad") {
    return NextResponse.json(
      { error: "offset and total must be whole numbers, offset below total" },
      { status: 400 },
    );
  }
  if (part && part.total > MAX_CLIP_BYTES) {
    return NextResponse.json(
      { error: "A clip can be at most 20 MB" },
      { status: 413 },
    );
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json(
      { error: "A clip can be at most 4 MB" },
      { status: 413 },
    );
  }

  const row = await prisma.speechRecording.findFirst({
    where: { id, annotatorId: gate.userId },
    select: { id: true, mimeType: true, uploadedAt: true, sizeBytes: true },
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
      {
        error: "Send the audio as the request body with an audio Content-Type.",
      },
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

  if (part) {
    return putPart(id, gate.userId, row, part, body);
  }

  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const storageKey = await copyToBucket(id, row.mimeType, body);
  // One winner if two uploads race: only a row still without audio updates.
  const result = await prisma.speechRecording.updateMany({
    where: { id, annotatorId: gate.userId, uploadedAt: null },
    data: {
      bytes: body,
      sizeBytes: body.length,
      checksumSha256,
      uploadedAt: new Date(),
      ...(storageKey ? { storageKey } : {}),
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

/** Storage is additive: any failure leaves the row exactly as without it. */
async function copyToBucket(
  id: string,
  mimeType: string,
  body: Buffer<ArrayBuffer>,
): Promise<string | undefined> {
  if (!storageEnabled()) return undefined;
  try {
    const key = recordingPath(id, mimeType);
    await putClip(key, body, baseMime(mimeType));
    return key;
  } catch (e) {
    console.warn(
      `speech storage upload failed for ${id}: ${e instanceof Error ? e.name : "error"}`,
    );
    return undefined;
  }
}

/** What the server holds of a clip being sent in parts, for the client to carry on from. */
const holding = (received: number) =>
  NextResponse.json({ received, complete: false });

/**
 * One part of a clip sent in parts (see the PUT notes above). The row is
 * the caller's and has no audio yet; `body` is this part, at most 4 MB.
 */
async function putPart(
  id: string,
  userId: string,
  row: { mimeType: string; sizeBytes: number | null },
  part: { offset: number; total: number },
  body: Buffer<ArrayBuffer>,
) {
  const { offset, total } = part;
  if (offset + body.length > total) {
    return NextResponse.json(
      { error: "This part runs past the total." },
      { status: 400 },
    );
  }
  const have = row.sizeBytes ?? 0;
  // Out of step (a part repeated, or one lost): say where things stand.
  if (offset > 0 && have !== offset) return holding(have);

  let prior: Buffer<ArrayBuffer> = Buffer.alloc(0);
  if (offset > 0) {
    const stored = await prisma.speechRecording.findFirst({
      where: { id, annotatorId: userId, uploadedAt: null },
      select: { bytes: true },
    });
    prior = stored?.bytes ? Buffer.from(stored.bytes) : Buffer.alloc(0);
    if (prior.length !== offset) return holding(prior.length);
  }
  const whole = offset === 0 ? body : Buffer.concat([prior, body]);
  // Part 0 restarts the clip; any later part lands only on what it follows.
  const where = {
    id,
    annotatorId: userId,
    uploadedAt: null,
    ...(offset > 0 ? { sizeBytes: offset } : {}),
  };

  if (whole.length < total) {
    const result = await prisma.speechRecording.updateMany({
      where,
      data: { bytes: whole, sizeBytes: whole.length, checksumSha256: null },
    });
    if (result.count === 0) return lostRace(id, userId);
    return holding(whole.length);
  }

  // The last part: the whole clip, exactly as a single PUT stores one.
  const checksumSha256 = createHash("sha256").update(whole).digest("hex");
  const storageKey = await copyToBucket(id, row.mimeType, whole);
  const result = await prisma.speechRecording.updateMany({
    where,
    data: {
      bytes: whole,
      sizeBytes: whole.length,
      checksumSha256,
      uploadedAt: new Date(),
      ...(storageKey ? { storageKey } : {}),
    },
  });
  if (result.count === 0) return lostRace(id, userId);
  return NextResponse.json({
    recording: { id, sizeBytes: whole.length, checksumSha256 },
    received: whole.length,
    complete: true,
  });
}

/** Another request changed the row first: report what it holds now. */
async function lostRace(id: string, userId: string) {
  const now = await prisma.speechRecording.findFirst({
    where: { id, annotatorId: userId },
    select: { uploadedAt: true, sizeBytes: true },
  });
  if (now?.uploadedAt) {
    return NextResponse.json(
      { error: "This clip already has its audio." },
      { status: 409 },
    );
  }
  return holding(now?.sizeBytes ?? 0);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const { id } = await params;

  // First read: no bytes, so a redirect never loads the clip from Postgres.
  const meta = await prisma.speechRecording.findUnique({
    where: { id },
    select: {
      mimeType: true,
      uploadedAt: true,
      isDemo: true,
      annotatorId: true,
      storageKey: true,
    },
  });
  const allowed =
    meta &&
    meta.uploadedAt &&
    (!meta.isDemo || meta.annotatorId === gate.userId);
  if (!allowed) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (meta.storageKey && storageEnabled()) {
    try {
      const url = await signedUrl(meta.storageKey);
      return new Response(null, {
        status: 302,
        headers: {
          Location: url,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      console.warn(`speech storage signing failed for ${id}; serving bytes`);
    }
  }

  const row = await prisma.speechRecording.findUnique({
    where: { id },
    select: { bytes: true },
  });
  if (!row?.bytes) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  const mimeType = meta.mimeType;

  const bytes = Buffer.from(row.bytes);
  const headers: Record<string, string> = {
    "Content-Type": baseMime(mimeType),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  // A clip over one response body is always answered in ranges, even to a
  // request without one (an <audio> element sends one anyway).
  const range =
    parseRange(req.headers.get("range"), bytes.length) ??
    (bytes.length > MAX_BYTES ? { start: 0, end: bytes.length - 1 } : null);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  }
  if (range) {
    // At most MAX_BYTES per answer: the browser asks again for the rest.
    const end = Math.min(range.end, range.start + MAX_BYTES - 1);
    const part = bytes.subarray(range.start, end + 1);
    return new Response(part, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.length),
        "Content-Range": `bytes ${range.start}-${end}/${bytes.length}`,
      },
    });
  }
  return new Response(bytes, {
    status: 200,
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
