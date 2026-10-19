import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { MAX_BYTES } from "@/lib/speech/limits";

/**
 * Mark an upload complete (PATCH /api/lab/speech/recording/[id]). The browser
 * calls this after the PUT to the signed URL succeeds, with the final size and
 * the sha256 of the bytes it sent. Only the researcher who made the clip can
 * confirm it; anyone else gets the same 404 as an unknown id. Until this runs
 * the row has uploadedAt null and review, listening and export all ignore it.
 *
 *   400  size missing, not a positive integer, or over 5 MB; checksum not a
 *        64-character hex sha256
 *   404  no such recording of yours
 *   409  already confirmed (a clip's bytes are not re-declared)
 */

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { sizeBytes, checksumSha256 } = body as Record<string, unknown>;

  if (
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    return NextResponse.json(
      { error: "sizeBytes must be a positive integer" },
      { status: 400 },
    );
  }
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: "A clip can be at most 5 MB" },
      { status: 400 },
    );
  }
  if (
    typeof checksumSha256 !== "string" ||
    !/^[0-9a-f]{64}$/i.test(checksumSha256)
  ) {
    return NextResponse.json(
      { error: "checksumSha256 must be a 64-character hex sha256" },
      { status: 400 },
    );
  }

  const row = await prisma.speechRecording.findFirst({
    where: { id, annotatorId: gate.userId },
    select: { id: true, uploadedAt: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  if (row.uploadedAt) {
    return NextResponse.json(
      { error: "This upload is already confirmed." },
      { status: 409 },
    );
  }

  const updated = await prisma.speechRecording.update({
    where: { id },
    data: {
      uploadedAt: new Date(),
      sizeBytes,
      checksumSha256: checksumSha256.toLowerCase(),
    },
    select: { id: true, uploadedAt: true, sizeBytes: true },
  });
  return NextResponse.json({ recording: updated });
}
