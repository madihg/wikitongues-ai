import { createHash } from "node:crypto";
import {
  canExportOpen,
  type ExportableRow,
  type PromptFreezeFields,
} from "./guard";
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
  /** "igala" | "english": what the speaker said (igala when not loaded). */
  language?: string;
  /** The speaker's locked answer for this clip, tone-retained as written. */
  coldAuthorAnswer?: {
    answerText: string;
    /** The locked English meaning: the transcript of an English clip. */
    englishGloss?: string | null;
  } | null;
  /** The row's prompt; `text` is the English question, read aloud when an
   * English clip had no gloss to read. */
  prompt?: (PromptFreezeFields & { text?: string }) | null;
}

export interface ManifestLine {
  /**
   * The clip's stable name, `clips/<id>.<ext>`; never a URL. The audio itself
   * is a database column and is not in the manifest.
   */
  clip: string;
  /** "igala" or "english": the language the speaker said, and `transcript` is in. */
  language: "igala" | "english";
  mimeType: string;
  durationMs: number;
  sampleRate: number;
  /**
   * What was said, in the clip's language: the Igala answer as locked
   * (tone-retained) for an Igala clip; the locked English meaning for an
   * English clip (the English prompt text when the speaker had no meaning to
   * read); null if nothing is attached.
   */
  transcript: string | null;
  /** The same text with tone marks removed by the shared normaliser (Igala
   * clips; an English transcript has no tone marks to strip). */
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

/** The text a clip says, per its language. */
export function transcriptFor(
  r: ManifestRow,
  language: "igala" | "english",
): string | null {
  if (language === "igala") {
    return r.coldAuthorAnswer?.answerText.normalize("NFC") ?? null;
  }
  const gloss = r.coldAuthorAnswer?.englishGloss?.trim();
  if (gloss) return gloss.normalize("NFC");
  return r.prompt?.text?.trim() || null;
}

/** OPEN manifest lines for exactly the rows the guard lets leave. */
export function buildOpenManifest(rows: ManifestRow[]): ManifestLine[] {
  return rows.filter(canExportOpen).map((r) => {
    const language = r.language === "english" ? "english" : "igala";
    const transcript = transcriptFor(r, language);
    return {
      clip: r.storagePath,
      language,
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
