import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  CONSENT_VERSION,
  consentTextFor,
  consentTextHash,
} from "@/lib/speech/consent-text";
import { withdrawSpeaker } from "@/lib/speech/withdrawal";

/**
 * POST /api/lab/consent/withdraw: the speaker withdraws their own consent.
 * Same gate as the consent route (404 flag off, 401, 403). The body must say
 * `confirm: true`, so a stray request never withdraws anyone. Writes a
 * ConsentGrant with withdrawn true and all four answers false, and marks the
 * speaker's clips that are not yet published as withdrawn, in one transaction
 * (withdrawal.ts). Published open clips are untouched: open data is permanent.
 *
 * Only the caller's own account is ever withdrawn. When PR G widens the
 * speaker routes to annotators (canUseSpeech), this route moves with them.
 */
export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== true) {
    return NextResponse.json(
      { error: "Send { confirm: true } to withdraw." },
      { status: 400 },
    );
  }

  const text = consentTextFor("written");
  const consent = await prisma.consent.upsert({
    where: {
      version_language_method_textHash: {
        version: CONSENT_VERSION,
        language: "en",
        method: "written",
        textHash: consentTextHash(text),
      },
    },
    update: {},
    create: {
      version: CONSENT_VERSION,
      language: "en",
      method: "written",
      textHash: consentTextHash(text),
      text,
    },
    select: { id: true },
  });

  const out = await withdrawSpeaker(prisma, {
    userId: gate.userId,
    consentId: consent.id,
  });
  return NextResponse.json(
    { withdrawn: true, grantId: out.grantId, clipsRemoved: out.clipsRemoved },
    { status: 201 },
  );
}
