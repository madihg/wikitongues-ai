import { createHash } from "node:crypto";
import { canExportOpen, type ExportableRow } from "./guard";
import { ORTHOGRAPHY_VERSION, toneStrip } from "./normalise";

/**
 * The one manifest builder behind every export entry point (the export route
 * and scripts/speech/export-manifest.ts). It does no filtering of its own: a
 * row appears only if the shared guard says it may, so there is exactly one
 * place the rules live. First slice: OPEN only. LICENSED clips leave only
 * through the future gated delivery path (canExportLicensed).
 */

/** A SpeechRecording as the export reads it, with its transcript joined in. */
export interface ManifestRow extends ExportableRow {
  id: string;
  storagePath: string;
  mimeType: string;
  durationMs: number;
  sampleRate: number;
  annotatorId: string | null;
  dialect: string | null;
  consentVersion: string | null;
  fundingSource: string;
  /** The speaker's locked answer for this clip, tone-retained as written. */
  coldAuthorAnswer?: { answerText: string } | null;
}

export interface ManifestLine {
  /** Path inside the private `igala-speech` bucket; never a URL. */
  clip: string;
  mimeType: string;
  durationMs: number;
  sampleRate: number;
  /** As locked by the speaker (tone-retained), or null if none is attached. */
  transcript: string | null;
  /** The same text with tone marks removed by the shared normaliser. */
  transcriptToneStripped: string | null;
  /** Stable pseudonym; the speaker's account id never appears. */
  speaker: string;
  dialect: string | null;
  tier: "open";
  consentVersion: string | null;
  fundingSource: string;
  /** The licence that follows the tier: CC-BY 4.0 for OPEN only. */
  license: "CC-BY-4.0";
  orthographyVersion: string;
}

/**
 * A stable, non-reversible speaker label. The salt comes from
 * SPEECH_PSEUDONYM_SALT so labels cannot be recomputed from account ids by
 * anyone without it; the fallback keeps local runs deterministic.
 */
export function speakerPseudonym(annotatorId: string | null): string {
  if (!annotatorId) return "spk_unknown";
  const salt = process.env.SPEECH_PSEUDONYM_SALT ?? "speech-lab";
  const h = createHash("sha256").update(`${salt}:${annotatorId}`).digest("hex");
  return `spk_${h.slice(0, 12)}`;
}

/** OPEN manifest lines for exactly the rows the guard lets leave. */
export function buildOpenManifest(rows: ManifestRow[]): ManifestLine[] {
  return rows.filter(canExportOpen).map((r) => {
    const transcript = r.coldAuthorAnswer?.answerText.normalize("NFC") ?? null;
    return {
      clip: r.storagePath,
      mimeType: r.mimeType,
      durationMs: r.durationMs,
      sampleRate: r.sampleRate,
      transcript,
      transcriptToneStripped:
        transcript === null ? null : toneStrip(transcript),
      speaker: speakerPseudonym(r.annotatorId),
      dialect: r.dialect,
      tier: "open" as const,
      consentVersion: r.consentVersion,
      fundingSource: r.fundingSource,
      license: "CC-BY-4.0" as const,
      orthographyVersion: ORTHOGRAPHY_VERSION,
    };
  });
}

/** One JSON object per line, newline-terminated (empty input gives ""). */
export function toJsonl(lines: ManifestLine[]): string {
  return (
    lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : "")
  );
}
