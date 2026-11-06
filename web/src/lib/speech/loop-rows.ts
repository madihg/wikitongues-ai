import type { PrismaClient } from "@prisma/client";
import type { LoopRow } from "./training-manifest";

/**
 * The queries that feed the training and exam manifests. Like open-rows.ts,
 * the WHERE only narrows; canTrain / canEvaluate (inside the builders) are
 * the rule and re-check every row, including the prompt's frozen status.
 * The select is explicit and omits `bytes` and `quality`: the worker reads
 * audio through a signed URL, never through these rows
 * (audio-bytes-guard.test.ts).
 */
const SELECT = {
  id: true,
  storagePath: true,
  storageKey: true,
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
  studioText: true,
  prompt: { select: { isHoldout: true, split: true, text: true } },
  coldAuthorAnswer: { select: { answerText: true, englishGloss: true } },
} as const;

export const TRAINABLE_ROWS_QUERY = {
  where: {
    isTestSet: false,
    isDemo: false,
    uploadedAt: { not: null },
    consentId: { not: null },
    reviewStatus: "keep",
  },
  orderBy: { createdAt: "asc" },
  select: SELECT,
} as const;

export const TEST_SET_ROWS_QUERY = {
  where: { isTestSet: true, isDemo: false, uploadedAt: { not: null } },
  orderBy: { createdAt: "asc" },
  select: SELECT,
} as const;

type Db = Pick<PrismaClient, "speechRecording">;

/** Candidate training rows. Guard them with buildTrainingManifest. */
export async function loadTrainableRows(db: Db): Promise<LoopRow[]> {
  return db.speechRecording.findMany(TRAINABLE_ROWS_QUERY);
}

/**
 * Candidate rows for a TTS job: the trainable query narrowed to the named
 * studio sittings. Guard them with buildTrainingManifest (purpose "tts").
 */
export async function loadStudioRows(
  db: Db,
  studioSessionIds: string[],
): Promise<LoopRow[]> {
  return db.speechRecording.findMany({
    where: {
      ...TRAINABLE_ROWS_QUERY.where,
      studioSessionId: { in: studioSessionIds },
    },
    orderBy: TRAINABLE_ROWS_QUERY.orderBy,
    select: SELECT,
  });
}

/** The exam clips. Only buildEvalManifest may turn these into a manifest. */
export async function loadTestSetRows(db: Db): Promise<LoopRow[]> {
  return db.speechRecording.findMany(TEST_SET_ROWS_QUERY);
}
