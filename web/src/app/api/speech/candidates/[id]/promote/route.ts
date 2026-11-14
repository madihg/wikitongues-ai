import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";

/**
 * POST /api/speech/candidates/[id]/promote {reason?}: a researcher promotes a
 * candidate model. A regressed candidate needs a non-empty typed reason. The
 * system's previous promotion is cleared in the same transaction, and a
 * SpeechAudit row records who, when and why (stepLog is per night; promotions
 * happen on days with no run).
 */
const MAX_REASON = 500;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const { id } = await params;

  let body: { reason?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is fine for a candidate that did not regress
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";

  const c = await prisma.speechCandidate.findUnique({
    where: { id },
    select: { id: true, system: true, regressed: true, promotedAt: true },
  });
  if (!c) return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  if (c.promotedAt) return NextResponse.json({ ok: true, alreadyPromoted: true });
  if (c.regressed && reason === "") {
    return NextResponse.json(
      { error: "This candidate is worse than the promoted model: give a reason." },
      { status: 400 },
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.speechCandidate.updateMany({
      where: { system: c.system, promotedAt: { not: null }, id: { not: c.id } },
      data: { promotedAt: null, promotedById: null, promoteReason: null },
    }),
    prisma.speechCandidate.update({
      where: { id: c.id },
      data: {
        promotedAt: now,
        promotedById: gate.userId,
        promoteReason: reason || null,
      },
    }),
    prisma.speechAudit.create({
      data: {
        action: "promote",
        subjectType: "SpeechCandidate",
        subjectId: c.id,
        actorId: gate.userId,
        detail: { system: c.system, regressed: c.regressed, reason: reason || null },
      },
    }),
  ]);
  return NextResponse.json({ ok: true, alreadyPromoted: false });
}
