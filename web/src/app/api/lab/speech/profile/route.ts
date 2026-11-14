import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { parseProfile } from "@/lib/speech/profile";

/**
 * The caller's speaker profile (GET and PUT /api/lab/speech/profile), for the
 * speaker side of the lab. Every field is optional; null is "prefer not to
 * say". ageBand and gender are kept private to the platform unless
 * mayShareDemographics is true: the manifest builder omits them otherwise.
 * PUT replaces the whole profile (an absent field becomes null). 404 when the
 * lab flag is off.
 */

const SELECT = {
  dialect: true,
  ageBand: true,
  gender: true,
  mayShareDemographics: true,
} as const;

const EMPTY = {
  dialect: null,
  ageBand: null,
  gender: null,
  mayShareDemographics: false,
};

export async function GET() {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const profile = await prisma.speakerProfile.findUnique({
    where: { userId: gate.userId },
    select: SELECT,
  });
  return NextResponse.json({ profile: profile ?? EMPTY });
}

export async function PUT(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;

  const parsed = parseProfile(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const profile = await prisma.speakerProfile.upsert({
    where: { userId: gate.userId },
    create: { userId: gate.userId, ...parsed.value },
    update: parsed.value,
    select: SELECT,
  });
  return NextResponse.json({ profile });
}
