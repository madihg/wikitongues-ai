import type { ManifestRow } from "./manifest";

/**
 * Synthetic SpeechRecording rows for tests. Nothing here is real contributor
 * data or Igala text: transcripts are English, speakers are made-up ids. Not
 * imported by production code.
 */

/** An OPEN clip that passes every export check. Override fields per test. */
export function openRow(over: Partial<ManifestRow> = {}): ManifestRow {
  return {
    id: "rec-1",
    storagePath: "clips/synthetic-1.webm",
    mimeType: "audio/webm",
    durationMs: 4200,
    sampleRate: 48000,
    annotatorId: "speaker-account-1",
    dialect: null,
    tier: "open",
    isTestSet: false,
    isDemo: false,
    rightsStatus: "cleared",
    sourceType: "contributor",
    publishedOpenAt: new Date("2026-10-19T00:00:00Z"),
    uploadedAt: new Date("2026-10-18T00:00:00Z"),
    consentId: "consent-1",
    consentVersion: "2026-10-19-v1",
    reviewStatus: "keep",
    voiceCloningOptIn: false,
    fundingSource: "unknown",
    prompt: { isHoldout: false, split: "train" },
    coldAuthorAnswer: { answerText: "the market opens at dawn" },
    ...over,
  };
}

/** A LICENSED clip that passes every export check given consenting context. */
export function licensedRow(over: Partial<ManifestRow> = {}): ManifestRow {
  return openRow({ tier: "licensed", publishedOpenAt: null, ...over });
}
