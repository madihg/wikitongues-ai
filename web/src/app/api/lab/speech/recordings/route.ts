import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { speakerPseudonym } from "@/lib/speech/manifest";
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/speech/limits";
import { StorageConfigError, signedReadUrl } from "@/lib/speech/storage";

/**
 * The researcher review list (GET /api/lab/speech/recordings) and the review
 * flags (PATCH). Researcher-only; 404 when the flag is off.
 *
 * GET lists confirmed (uploaded), non-demo clips, newest first, each with a
 * short-lived signed read URL (never a public URL), the prompt text, the
 * locked answer, the speaker as a pseudonym (never the account), duration,
 * tier, consent version and review status. `?limit=` (1 to 100, default 50)
 * and `?status=keep|bad_audio|wrong_text|unreviewed` filter and page it.
 *
 * PATCH sets one clip's review flag: body { id, reviewStatus } where
 * reviewStatus is keep, bad_audio, wrong_text, or null to clear it. A clip
 * flagged bad_audio or wrong_text leaves listening and every export. It
 * never touches the tier, the consent record or publishedOpenAt.
 */

export async function GET(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const params = new URL(req.url).searchParams;
  const limit = Math.min(
    Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1),
    100,
  );
  const status = params.get("status");
  if (
    status !== null &&
    status !== "unreviewed" &&
    !(REVIEW_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json(
      { error: "status must be keep, bad_audio, wrong_text or unreviewed" },
      { status: 400 },
    );
  }

  const rows = await prisma.speechRecording.findMany({
    where: {
      isDemo: false,
      uploadedAt: { not: null },
      ...(status === "unreviewed"
        ? { reviewStatus: null }
        : status
          ? { reviewStatus: status }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      storagePath: true,
      mimeType: true,
      durationMs: true,
      annotatorId: true,
      dialect: true,
      tier: true,
      consentVersion: true,
      reviewStatus: true,
      rightsStatus: true,
      createdAt: true,
      prompt: { select: { promptId: true, text: true } },
      coldAuthorAnswer: { select: { answerText: true } },
    },
  });

  // One signed read URL per clip. A missing storage config is one 503 for the
  // list; any other single failure leaves that clip's url null.
  const minted = await Promise.allSettled(
    rows.map((r) => signedReadUrl(r.storagePath)),
  );
  if (
    minted.some(
      (m) => m.status === "rejected" && m.reason instanceof StorageConfigError,
    )
  ) {
    return NextResponse.json(
      { error: "Speech storage is not configured." },
      { status: 503 },
    );
  }
  const urls = minted.map((m) => (m.status === "fulfilled" ? m.value : null));

  return NextResponse.json({
    recordings: rows.map((r, i) => ({
      id: r.id,
      promptId: r.prompt.promptId,
      promptText: r.prompt.text,
      answerText: r.coldAuthorAnswer?.answerText ?? null,
      speaker: speakerPseudonym(r.annotatorId),
      dialect: r.dialect,
      durationMs: r.durationMs,
      mimeType: r.mimeType,
      tier: r.tier,
      consentVersion: r.consentVersion,
      reviewStatus: r.reviewStatus,
      rightsStatus: r.rightsStatus,
      createdAt: r.createdAt,
      url: urls[i],
    })),
  });
}

export async function PATCH(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, reviewStatus } = body as Record<string, unknown>;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (
    reviewStatus !== null &&
    !(
      typeof reviewStatus === "string" &&
      (REVIEW_STATUSES as readonly string[]).includes(reviewStatus)
    )
  ) {
    return NextResponse.json(
      { error: "reviewStatus must be keep, bad_audio, wrong_text or null" },
      { status: 400 },
    );
  }

  const existing = await prisma.speechRecording.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  const updated = await prisma.speechRecording.update({
    where: { id },
    data: { reviewStatus: reviewStatus as ReviewStatus | null },
    select: { id: true, reviewStatus: true },
  });
  return NextResponse.json({ recording: updated });
}
