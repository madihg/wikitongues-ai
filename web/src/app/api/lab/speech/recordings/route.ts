import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { speakerPseudonym } from "@/lib/speech/manifest";
import {
  LANGUAGES,
  REVIEW_STATUSES,
  type ReviewStatus,
} from "@/lib/speech/limits";
import { sanitizeQuality, verdicts, type VerdictKey } from "@/lib/speech/analyse";
import { audioUrl } from "@/lib/speech/storage";

/**
 * The researcher review list (GET /api/lab/speech/recordings) and the review
 * flags (PATCH). Researcher-only; 404 when the flag is off.
 *
 * GET lists confirmed (uploaded), non-demo clips, newest first, each with
 * the URL of its audio endpoint (researcher-only, never public), the prompt
 * text, the locked answer, the speaker as a pseudonym (never the account),
 * language, duration, tier, consent version, review status and the take
 * metrics. The audio bytes are never in this payload (the query does not
 * select them). Query: `?limit=` (1 to 100, default 50);
 * `?status=keep|bad_audio|wrong_text|unreviewed`; `?language=igala|english`;
 * `?flag=` one of the take warnings (too_quiet, clipped, cut_short, ...) to
 * list only takes with that verdict; `?sort=newest|quietest|loudest|longest|
 * shortest|most_clipped` (default newest).
 *
 * PATCH sets one clip's review flag: body { id, reviewStatus } where
 * reviewStatus is keep, bad_audio, wrong_text, or null to clear it. A clip
 * flagged bad_audio or wrong_text leaves listening and every export. It
 * never touches the tier, the consent record or publishedOpenAt.
 */

/** Sort orders over the stored take metrics. Clips without metrics sort last. */
const SORTS = {
  newest: null,
  quietest: (q: { rmsDbfs: number }) => q.rmsDbfs,
  loudest: (q: { rmsDbfs: number }) => -q.rmsDbfs,
  longest: (q: { durationMs: number }) => -q.durationMs,
  shortest: (q: { durationMs: number }) => q.durationMs,
  most_clipped: (q: { clippingShare: number }) => -q.clippingShare,
} as const;
type SortKey = keyof typeof SORTS;

const FLAG_KEYS: readonly VerdictKey[] = [
  "no_speech",
  "too_short",
  "too_quiet",
  "too_loud",
  "clipped",
  "cut_short",
  "long_pause_start",
  "long_pause_end",
  "too_fast",
  "too_slow",
  "good",
];

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
  const language = params.get("language");
  if (language !== null && !(LANGUAGES as readonly string[]).includes(language)) {
    return NextResponse.json(
      { error: "language must be igala or english" },
      { status: 400 },
    );
  }
  const flag = params.get("flag");
  if (flag !== null && !(FLAG_KEYS as readonly string[]).includes(flag)) {
    return NextResponse.json({ error: "Unknown flag" }, { status: 400 });
  }
  const sort = (params.get("sort") ?? "newest") as SortKey;
  if (!(sort in SORTS)) {
    return NextResponse.json({ error: "Unknown sort" }, { status: 400 });
  }
  // Metric filters and sorts run in memory over a bounded window of the
  // newest clips; the plain list is limited in the query.
  const needsMetrics = flag !== null || sort !== "newest";

  const rows = await prisma.speechRecording.findMany({
    where: {
      isDemo: false,
      uploadedAt: { not: null },
      ...(language ? { language } : {}),
      ...(status === "unreviewed"
        ? { reviewStatus: null }
        : status
          ? { reviewStatus: status }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: needsMetrics ? 500 : limit,
    // NOT `bytes`: a list never carries audio.
    select: {
      id: true,
      mimeType: true,
      language: true,
      quality: true,
      durationMs: true,
      annotatorId: true,
      dialect: true,
      tier: true,
      consentVersion: true,
      reviewStatus: true,
      rightsStatus: true,
      createdAt: true,
      prompt: { select: { promptId: true, text: true } },
      coldAuthorAnswer: { select: { answerText: true, englishGloss: true } },
    },
  });

  let items = rows.map((r) => ({ row: r, quality: sanitizeQuality(r.quality) }));
  if (flag) {
    items = items.filter(
      (i) => i.quality && verdicts(i.quality).some((v) => v.key === flag),
    );
  }
  const keyOf = SORTS[sort];
  if (keyOf) {
    const key = keyOf as (q: never) => number;
    items = [...items].sort((a, b) => {
      if (!a.quality && !b.quality) return 0;
      if (!a.quality) return 1;
      if (!b.quality) return -1;
      return key(a.quality as never) - key(b.quality as never);
    });
  }
  items = items.slice(0, limit);

  return NextResponse.json({
    recordings: items.map(({ row: r, quality }) => ({
      id: r.id,
      promptId: r.prompt.promptId,
      promptText: r.prompt.text,
      answerText: r.coldAuthorAnswer?.answerText ?? null,
      englishGloss: r.coldAuthorAnswer?.englishGloss ?? null,
      language: r.language,
      speaker: speakerPseudonym(r.annotatorId),
      dialect: r.dialect,
      durationMs: r.durationMs,
      mimeType: r.mimeType,
      tier: r.tier,
      consentVersion: r.consentVersion,
      reviewStatus: r.reviewStatus,
      rightsStatus: r.rightsStatus,
      createdAt: r.createdAt,
      quality,
      flags: quality ? verdicts(quality).map((v) => v.key) : [],
      url: audioUrl(r.id),
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
