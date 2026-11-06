import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";

/**
 * PATCH /api/speech/rights/[id]: a researcher sets the rights status of one
 * third-party audio source (the register at /lab/speech/rights) and its open
 * questions. Researcher-only; 404 when the lab flag is off.
 *
 * Body: { rightsStatus?: "pending" | "cleared" | "restricted", notes?: string }
 * (at least one). Setting cleared or restricted records who confirmed and
 * when; setting pending clears both. The status is copied onto every clip of
 * the source (sourceType third_party, sourceRef = this id), so canTrain and
 * canExportOpen, which read the clip's own rightsStatus, follow the register.
 */
const STATUSES = ["pending", "cleared", "restricted"] as const;
type Status = (typeof STATUSES)[number];
const MAX_NOTES = 4000;

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
  const { rightsStatus, notes } = body as Record<string, unknown>;
  if (rightsStatus === undefined && notes === undefined) {
    return NextResponse.json(
      { error: "Send rightsStatus, notes or both." },
      { status: 400 },
    );
  }
  if (
    rightsStatus !== undefined &&
    !(STATUSES as readonly unknown[]).includes(rightsStatus)
  ) {
    return NextResponse.json(
      { error: "rightsStatus must be pending, cleared or restricted" },
      { status: 400 },
    );
  }
  if (
    notes !== undefined &&
    (typeof notes !== "string" || notes.length > MAX_NOTES)
  ) {
    return NextResponse.json(
      { error: `notes must be text of at most ${MAX_NOTES} characters` },
      { status: 400 },
    );
  }

  const existing = await prisma.thirdPartyAudioSource.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const status = rightsStatus as Status | undefined;
  const data: Record<string, unknown> = {};
  if (typeof notes === "string") data.notes = notes;
  if (status) {
    data.rightsStatus = status;
    data.confirmedById = status === "pending" ? null : gate.userId;
    data.confirmedAt = status === "pending" ? null : new Date();
  }

  const source = await prisma.thirdPartyAudioSource.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      rightsStatus: true,
      confirmedById: true,
      confirmedAt: true,
      notes: true,
    },
  });
  let clips = 0;
  if (status) {
    const moved = await prisma.speechRecording.updateMany({
      where: { sourceType: "third_party", sourceRef: id },
      data: { rightsStatus: status },
    });
    clips = moved.count;
  }
  return NextResponse.json({ source, clips });
}
