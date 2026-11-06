import type { PrismaClient } from "@prisma/client";
import type { ManifestRow } from "./manifest";

/**
 * The one query that feeds the OPEN export, shared by the export route and
 * scripts/speech/export-manifest.ts. The WHERE narrows the rows for
 * efficiency; it is NOT the rule. Every row still goes through the guard in
 * buildOpenManifest (canExportOpen), which re-checks tier, publishedOpenAt,
 * test set, rights, source, consent, review and the prompt's frozen status.
 * Keeping the query here means the two entry points cannot drift apart.
 * The select is explicit and omits `bytes`: an export never carries audio
 * (audio-bytes-guard.test.ts).
 */
export const OPEN_ROWS_QUERY = {
  where: {
    tier: "open",
    publishedOpenAt: { not: null },
    isDemo: false,
    isTestSet: false,
    rightsStatus: "cleared",
    uploadedAt: { not: null },
  },
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    storagePath: true,
    language: true,
    mimeType: true,
    durationMs: true,
    sampleRate: true,
    annotatorId: true,
    dialect: true,
    tier: true,
    consentId: true,
    consentVersion: true,
    fundingSource: true,
    isTestSet: true,
    isDemo: true,
    rightsStatus: true,
    sourceType: true,
    publishedOpenAt: true,
    uploadedAt: true,
    reviewStatus: true,
    voiceCloningOptIn: true,
    prompt: { select: { isHoldout: true, split: true, text: true } },
    coldAuthorAnswer: { select: { answerText: true, englishGloss: true } },
  },
} as const;

/**
 * Load candidate rows for the OPEN export, each with its speaker's profile
 * joined in (the two tables share no relation, so this is a second query by
 * annotator id). Guard them with buildOpenManifest.
 */
export async function loadOpenRows(
  db: Pick<PrismaClient, "speechRecording" | "speakerProfile">,
): Promise<ManifestRow[]> {
  const rows = await db.speechRecording.findMany(OPEN_ROWS_QUERY);
  const ids = [
    ...new Set(rows.map((r) => r.annotatorId).filter((id): id is string => !!id)),
  ];
  const profiles = ids.length
    ? await db.speakerProfile.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          dialect: true,
          ageBand: true,
          gender: true,
          mayShareDemographics: true,
        },
      })
    : [];
  const byUser = new Map(profiles.map((p) => [p.userId, p]));
  return rows.map((r) => ({
    ...r,
    speakerProfile: r.annotatorId ? (byUser.get(r.annotatorId) ?? null) : null,
  }));
}
