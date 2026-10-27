import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeDialect } from "@/lib/dialects";
import { labGate } from "@/lib/speech/lab-route";
import { CONSENT_VERSION } from "@/lib/speech/consent-text";
import { FrozenPromptError, assertRecordable } from "@/lib/speech/guard";
import {
  LANGUAGES,
  MAX_ANSWER_CHARS,
  MAX_BYTES,
  MAX_DURATION_MS,
  TIERS,
  type SpeechLanguage,
  type Tier,
} from "@/lib/speech/limits";
import { sanitizeQuality } from "@/lib/speech/analyse";
import {
  audioUrl,
  isAllowedAudioMime,
  recordingPath,
} from "@/lib/speech/storage";

/**
 * Create a recording row (POST /api/lab/speech/recording) and hand back the
 * URL to PUT its audio to (/api/lab/speech/recording/[id]/audio). Researcher-only; 404 when the flag is off.
 *
 * The body must carry a TIER (open | licensed | community_only): there is no
 * default, because the speaker chooses for each clip and the screen
 * preselects nothing. Refusals, in order:
 *   400  malformed body, missing or unknown tier, an unknown language
 *        (igala or english; igala when omitted), bad mime, bad duration,
 *        a declared size over 4 MB, or a duration over 30 s
 *   404  unknown prompt
 *   403  frozen prompt (isHoldout or split test), no detail, per FR-3
 *   428  no consent grant for the CURRENT consent version
 *   400  a tier or opt-in the speaker's consent answers do not allow
 *        (licensed needs the licensing answer, cloning needs the cloning
 *        answer, speaker identity needs the identity answer)
 * The row starts with uploadedAt null and no bytes, and is invisible to
 * review, listening and export until the audio PUT stores the clip and sets
 * uploadedAt. Rights stay "pending" and publishedOpenAt null: only a reviewer
 * and the publish step move those. `quality` (optional) is the client's take
 * metrics, sanitised and kept only to sort and filter; no rule reads it.
 *
 * Demo mode (`demoSessionId`) stores the row with isDemo true; it is never
 * counted, listened to or exported.
 *
 * A clip may attach to the researcher's own locked answer
 * (`coldAuthorAnswerId`, which must be theirs and for this prompt), or carry
 * `answerText` to lock a new answer in the same call when they have none.
 */

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const annotatorId = gate.userId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

  if (typeof b.promptId !== "string" || !b.promptId) {
    return bad("promptId is required");
  }
  if (b.tier === undefined || b.tier === null || b.tier === "") {
    return bad("tier is required: open, licensed or community_only");
  }
  if (!isTier(b.tier)) {
    return bad("tier must be open, licensed or community_only");
  }
  const tier: Tier = b.tier;

  let language: SpeechLanguage = "igala";
  if (b.language !== undefined) {
    if (
      typeof b.language !== "string" ||
      !(LANGUAGES as readonly string[]).includes(b.language)
    ) {
      return bad("language must be igala or english");
    }
    language = b.language as SpeechLanguage;
  }
  const quality = b.quality === undefined ? null : sanitizeQuality(b.quality);

  if (typeof b.mimeType !== "string" || !isAllowedAudioMime(b.mimeType)) {
    return bad("mimeType must be an audio type the recorder produces");
  }
  const mimeType = b.mimeType.trim().toLowerCase();

  if (
    typeof b.durationMs !== "number" ||
    !Number.isInteger(b.durationMs) ||
    b.durationMs <= 0
  ) {
    return bad("durationMs must be a positive integer");
  }
  if (b.durationMs > MAX_DURATION_MS) {
    return bad("A clip can be at most 30 seconds");
  }
  if (b.sizeBytes !== undefined) {
    if (
      typeof b.sizeBytes !== "number" ||
      !Number.isInteger(b.sizeBytes) ||
      b.sizeBytes <= 0
    ) {
      return bad("sizeBytes must be a positive integer");
    }
    if (b.sizeBytes > MAX_BYTES) return bad("A clip can be at most 4 MB");
  }

  let sampleRate = 48000;
  if (b.sampleRate !== undefined) {
    if (
      typeof b.sampleRate !== "number" ||
      !Number.isInteger(b.sampleRate) ||
      b.sampleRate < 8000 ||
      b.sampleRate > 96000
    ) {
      return bad("sampleRate must be an integer from 8000 to 96000");
    }
    sampleRate = b.sampleRate;
  }

  for (const key of ["voiceCloningOptIn", "speakerIdOptIn"] as const) {
    if (b[key] !== undefined && typeof b[key] !== "boolean") {
      return bad(`${key} must be true or false`);
    }
  }
  const voiceCloningOptIn = b.voiceCloningOptIn === true;
  const speakerIdOptIn = b.speakerIdOptIn === true;

  let answerText: string | null = null;
  if (b.answerText !== undefined && b.answerText !== null) {
    if (typeof b.answerText !== "string") return bad("answerText must be text");
    const t = b.answerText.trim();
    if (t.length === 0) return bad("answerText must not be empty");
    if (t.length > MAX_ANSWER_CHARS) return bad("answerText is too long");
    answerText = t;
  }
  const coldAuthorAnswerId =
    typeof b.coldAuthorAnswerId === "string" && b.coldAuthorAnswerId
      ? b.coldAuthorAnswerId
      : null;
  if (answerText && coldAuthorAnswerId) {
    return bad("Send either coldAuthorAnswerId or answerText, not both");
  }

  const demoSessionId =
    typeof b.demoSessionId === "string" && b.demoSessionId
      ? b.demoSessionId
      : null;
  const isDemo = demoSessionId !== null;

  // Unknown prompt: 404. Frozen prompt: 403 with no detail (FR-3).
  const prompt = await prisma.prompt.findUnique({
    where: { promptId: b.promptId },
    select: {
      id: true,
      promptId: true,
      bucket: true,
      isHoldout: true,
      split: true,
    },
  });
  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }
  try {
    assertRecordable(prompt);
  } catch (e) {
    if (e instanceof FrozenPromptError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  // Consent for the CURRENT version, and what its answers allow.
  const grant = await prisma.consentGrant.findFirst({
    where: { userId: annotatorId },
    orderBy: { grantedAt: "desc" },
    select: {
      commercialLicensing: true,
      voiceCloning: true,
      speakerId: true,
      consent: { select: { id: true, version: true, method: true } },
    },
  });
  if (!grant || grant.consent.version !== CONSENT_VERSION) {
    return NextResponse.json(
      {
        error: "Consent is required before recording.",
        code: "consent_required",
      },
      { status: 428 },
    );
  }
  if (tier === "licensed" && !grant.commercialLicensing) {
    return bad(
      "Your consent answers do not allow licensing. Change them in Consent first.",
    );
  }
  if (voiceCloningOptIn && !grant.voiceCloning) {
    return bad(
      "Your consent answers do not allow voice cloning. Change them in Consent first.",
    );
  }
  if (speakerIdOptIn && !grant.speakerId) {
    return bad(
      "Your consent answers do not allow linking clips to you. Change them in Consent first.",
    );
  }

  // An attached answer must be this researcher's own, for this prompt.
  if (coldAuthorAnswerId) {
    const answer = await prisma.coldAuthorAnswer.findFirst({
      where: { id: coldAuthorAnswerId, annotatorId, promptId: prompt.id },
      select: { id: true },
    });
    if (!answer) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }
  }

  const id = randomUUID();
  const path = recordingPath(id, mimeType);

  // Lock a new answer in the same call when none exists (the text flow's
  // rule: the answer is fixed before the clip is made).
  let answerId = coldAuthorAnswerId;
  if (answerText) {
    const created = await prisma.coldAuthorAnswer.create({
      data: {
        promptId: prompt.id,
        bucket: prompt.bucket,
        answerText,
        dialect: sanitizeDialect(b.dialect),
        annotatorId,
        isDemo,
        demoSessionId,
        // The model's defaults for these two are true (the pre-checked boxes
        // of the text flow). The 2026-10-19 rights decision forbids any
        // default toward licensing: an answer written here is community-only
        // until its author chooses otherwise through the consent flow.
        consentBenchmark: false,
        consentTraining: false,
      },
      select: { id: true },
    });
    answerId = created.id;
  }

  const row = await prisma.speechRecording.create({
    data: {
      id,
      promptId: prompt.id,
      coldAuthorAnswerId: answerId,
      annotatorId,
      storagePath: path,
      language,
      ...(quality ? { quality: quality as unknown as object } : {}),
      mimeType,
      durationMs: b.durationMs,
      sampleRate,
      dialect: sanitizeDialect(b.dialect),
      tier,
      consentId: grant.consent.id,
      consentVersion: grant.consent.version,
      consentMethod: grant.consent.method,
      voiceCloningOptIn,
      speakerIdOptIn,
      sourceType: "contributor",
      isTestSet: false,
      isDemo,
      demoSessionId,
    },
    select: { id: true },
  });

  return NextResponse.json(
    {
      id: row.id,
      coldAuthorAnswerId: answerId,
      audioUrl: audioUrl(row.id),
      limits: { maxBytes: MAX_BYTES, maxDurationMs: MAX_DURATION_MS },
    },
    { status: 201 },
  );
}
