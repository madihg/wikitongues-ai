import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  CONSENT_QUESTIONS,
  CONSENT_VERSION,
  IGALA_PLACEHOLDER,
  ORAL_SECTIONS,
  WRITTEN_SECTIONS,
  consentTextFor,
  consentTextHash,
  type ConsentTextMethod,
} from "@/lib/speech/consent-text";

/**
 * Consent for the Speech Lab. Researcher-only, 404 when the flag is off.
 *
 *   GET  -> the current consent text (written and oral), the four questions,
 *           and this researcher's latest grant, with `needsConsent` true when
 *           they have none for the CURRENT version (the record button stays
 *           disabled until it is false).
 *   POST -> records a grant. The body must say `accepted: true` for the
 *           current `version`, and carries the four flags. Each flag defaults
 *           to false and must be a boolean if sent: nothing is pre-checked,
 *           and a missing answer is a no. A new row is written on every call
 *           (the latest is current), so changes keep their history.
 *
 * The text itself is stored verbatim in Consent with its sha256, so a grant
 * can be audited against exactly what the speaker saw or heard.
 */

const FLAG_KEYS = CONSENT_QUESTIONS.map((q) => q.key);

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const grant = await prisma.consentGrant.findFirst({
    where: { userId: gate.userId },
    orderBy: { grantedAt: "desc" },
    select: {
      id: true,
      grantedAt: true,
      commercialLicensing: true,
      crossBorder: true,
      voiceCloning: true,
      speakerId: true,
      consent: { select: { version: true, method: true } },
    },
  });

  return NextResponse.json({
    currentVersion: CONSENT_VERSION,
    needsConsent: !grant || grant.consent.version !== CONSENT_VERSION,
    grant: grant
      ? {
          id: grant.id,
          grantedAt: grant.grantedAt,
          version: grant.consent.version,
          method: grant.consent.method,
          commercialLicensing: grant.commercialLicensing,
          crossBorder: grant.crossBorder,
          voiceCloning: grant.voiceCloning,
          speakerId: grant.speakerId,
        }
      : null,
    questions: CONSENT_QUESTIONS,
    written: WRITTEN_SECTIONS,
    oral: ORAL_SECTIONS,
    igalaPlaceholder: IGALA_PLACEHOLDER,
  });
}

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (b.accepted !== true) {
    return NextResponse.json(
      { error: "Consent must be accepted to be recorded." },
      { status: 400 },
    );
  }
  if (b.version !== CONSENT_VERSION) {
    // The speaker read an older text: make them read the current one.
    return NextResponse.json(
      {
        error: "The consent text has changed. Reload and read the new version.",
        currentVersion: CONSENT_VERSION,
      },
      { status: 409 },
    );
  }

  const method: ConsentTextMethod = b.method === "oral" ? "oral" : "written";
  if (b.method !== undefined && b.method !== "written" && b.method !== "oral") {
    return NextResponse.json(
      { error: "method must be written or oral" },
      { status: 400 },
    );
  }

  // Four separate flags: absent means false, present must be a boolean. A
  // truthy string such as "false" must never read as a yes.
  const flags: Record<string, boolean> = {};
  for (const key of FLAG_KEYS) {
    const v = b[key];
    if (v !== undefined && typeof v !== "boolean") {
      return NextResponse.json(
        { error: `${key} must be true or false` },
        { status: 400 },
      );
    }
    flags[key] = v === true;
  }

  const text = consentTextFor(method);
  const consent = await prisma.consent.upsert({
    where: {
      version_language_method_textHash: {
        version: CONSENT_VERSION,
        language: "en",
        method,
        textHash: consentTextHash(text),
      },
    },
    update: {},
    create: {
      version: CONSENT_VERSION,
      language: "en",
      method,
      textHash: consentTextHash(text),
      text,
    },
    select: { id: true, version: true, method: true },
  });

  const grant = await prisma.consentGrant.create({
    data: {
      consentId: consent.id,
      userId: gate.userId,
      commercialLicensing: flags.commercialLicensing,
      crossBorder: flags.crossBorder,
      voiceCloning: flags.voiceCloning,
      speakerId: flags.speakerId,
    },
    select: { id: true, grantedAt: true },
  });

  return NextResponse.json(
    {
      grant: {
        id: grant.id,
        grantedAt: grant.grantedAt,
        version: consent.version,
        method: consent.method,
        ...flags,
      },
    },
    { status: 201 },
  );
}
