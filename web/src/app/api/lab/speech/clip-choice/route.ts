import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { CONSENT_VERSION, consentStands } from "@/lib/speech/consent-text";
import { currentClipChoice, parseClipChoice } from "@/lib/speech/clip-choice";

/**
 * The caller's remembered clip choice (GET and PUT
 * /api/lab/speech/clip-choice), for the speaker side of the lab; 404 when the
 * lab flag is off.
 *
 * GET answers { choice: { tier, voiceCloning } | null }. Null means "ask":
 * never chosen, or consent has been asked again since (a new consent text
 * version, or a withdrawal), see currentClipChoice.
 *
 * PUT { tier, voiceCloning? } remembers the choice for every clip saved from
 * now on. It changes no recording: each clip still carries its own tier, set
 * when it is saved. Refusals:
 *   400  malformed body, a missing or unknown tier (there is no default), or
 *        a tier or opt-in the speaker's consent answers do not allow
 *   428  no consent on record for the CURRENT consent version
 *
 * The choice lives on SpeakerProfile in its own three columns. The profile
 * form's PUT (/api/lab/speech/profile) never writes them, and this route
 * never writes the profile's other fields.
 */

const GRANT_SELECT = {
  grantedAt: true,
  withdrawn: true,
  commercialLicensing: true,
  voiceCloning: true,
  consent: { select: { version: true } },
} as const;

async function latestGrant(userId: string) {
  const g = await prisma.consentGrant.findFirst({
    where: { userId },
    orderBy: { grantedAt: "desc" },
    select: GRANT_SELECT,
  });
  return g
    ? {
        grantedAt: g.grantedAt,
        withdrawn: g.withdrawn,
        version: g.consent.version,
        commercialLicensing: g.commercialLicensing,
        voiceCloning: g.voiceCloning,
      }
    : null;
}

const CHOICE_SELECT = {
  defaultTier: true,
  defaultVoiceCloning: true,
  tierChosenAt: true,
} as const;

export async function GET() {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const [grant, stored] = await Promise.all([
    latestGrant(gate.userId),
    prisma.speakerProfile.findUnique({
      where: { userId: gate.userId },
      select: CHOICE_SELECT,
    }),
  ]);
  return NextResponse.json({
    choice: currentClipChoice(stored, grant, CONSENT_VERSION),
  });
}

export async function PUT(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const grant = await latestGrant(gate.userId);
  if (!grant || !consentStands(grant)) {
    return NextResponse.json(
      {
        error: "Consent is required before choosing.",
        code: "consent_required",
      },
      { status: 428 },
    );
  }
  const parsed = parseClipChoice(body, grant);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const data = {
    defaultTier: parsed.value.tier,
    defaultVoiceCloning: parsed.value.voiceCloning,
    tierChosenAt: new Date(),
  };
  await prisma.speakerProfile.upsert({
    where: { userId: gate.userId },
    create: { userId: gate.userId, ...data },
    update: data,
    select: { userId: true },
  });
  return NextResponse.json({ choice: parsed.value });
}
