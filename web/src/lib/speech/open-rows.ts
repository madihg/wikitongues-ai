import type { PrismaClient } from "@prisma/client";
import type { ManifestRow } from "./manifest";

/**
 * The one query that feeds the OPEN export, shared by the export route and
 * scripts/speech/export-manifest.ts. The WHERE narrows the rows for
 * efficiency; it is NOT the rule. Every row still goes through the guard in
 * buildOpenManifest (canExportOpen), which re-checks tier, publishedOpenAt,
 * test set, rights, source, consent, review and the prompt's frozen status.
 * Keeping the query here means the two entry points cannot drift apart.
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
    prompt: { select: { isHoldout: true, split: true } },
    coldAuthorAnswer: { select: { answerText: true } },
  },
} as const;

/** Load candidate rows for the OPEN export. Guard them with buildOpenManifest. */
export async function loadOpenRows(
  db: Pick<PrismaClient, "speechRecording">,
): Promise<ManifestRow[]> {
  return db.speechRecording.findMany(OPEN_ROWS_QUERY);
}
