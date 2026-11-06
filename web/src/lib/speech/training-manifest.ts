import { createHash } from "node:crypto";
import { canEvaluate, canTrain, type TrainContext } from "./can-train";
import { speakerPseudonym, transcriptFor, type ManifestRow } from "./manifest";
import { ORTHOGRAPHY_VERSION, toneStrip } from "./normalise";

/**
 * The versioned manifest the worker trains and evaluates on. Pure: no
 * database, no signing; rows go in, and a callback turns a clip's object key
 * into a URL (the caller signs ahead of time, see storage-supabase.ts).
 *
 * buildTrainingManifest keeps a row only if canTrain says so.
 * buildEvalManifest is the ONLY function allowed to include test-set rows,
 * and it keeps nothing else (canEvaluate). Both are registered in
 * export-paths.test.ts.
 */

/** A row as the loop reads it: the manifest row plus its bucket key. */
export type LoopRow = ManifestRow & { storageKey?: string | null };

export interface ManifestOptions extends TrainContext {
  /** Object key (storageKey, else the clip's stable path) to a readable URL. */
  signedUrl: (key: string) => string;
}

export interface TrainingLine {
  id: string;
  url: string;
  durationMs: number;
  language: "igala" | "english";
  transcript: string;
  transcriptStripped: string;
  speakerPseudonym: string;
  dialect: string | null;
  tier: ManifestRow["tier"];
}

export interface Hours {
  total: number;
  byTier: Record<string, number>;
  bySpeaker: Record<string, number>;
  byDialect: Record<string, number>;
}

export interface TrainingManifest {
  version: string;
  lines: TrainingLine[];
  hours: Hours;
}

/** sha256 of the sorted ids joined by newline, then the orthography version. */
function versionOf(ids: string[]): string {
  const body = `${[...ids].sort().join("\n")}\n${ORTHOGRAPHY_VERSION}`;
  return createHash("sha256").update(body).digest("hex");
}

function lineOf(r: LoopRow, signedUrl: ManifestOptions["signedUrl"]) {
  const language = r.language === "english" ? "english" : "igala";
  const transcript = transcriptFor(r, language);
  // A clip with nothing written down cannot train or score anything.
  if (transcript === null) return null;
  const line: TrainingLine = {
    id: r.id,
    url: signedUrl(r.storageKey ?? r.storagePath),
    durationMs: r.durationMs,
    language,
    transcript,
    transcriptStripped: toneStrip(transcript),
    speakerPseudonym: speakerPseudonym(r.annotatorId),
    dialect: r.dialect,
    tier: r.tier,
  };
  return line;
}

function add(into: Record<string, number>, key: string, hours: number) {
  into[key] = (into[key] ?? 0) + hours;
}

function hoursOf(lines: TrainingLine[]): Hours {
  const hours: Hours = { total: 0, byTier: {}, bySpeaker: {}, byDialect: {} };
  for (const l of lines) {
    const h = l.durationMs / 3_600_000;
    hours.total += h;
    add(hours.byTier, l.tier, h);
    add(hours.bySpeaker, l.speakerPseudonym, h);
    add(hours.byDialect, l.dialect ?? "unknown", h);
  }
  return hours;
}

function assemble(
  rows: LoopRow[],
  keep: (r: LoopRow) => boolean,
  signedUrl: ManifestOptions["signedUrl"],
): TrainingManifest {
  const lines = rows
    .filter(keep)
    .map((r) => lineOf(r, signedUrl))
    .filter((l): l is TrainingLine => l !== null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    version: versionOf(lines.map((l) => l.id)),
    lines,
    hours: hoursOf(lines),
  };
}

export function buildTrainingManifest(
  rows: LoopRow[],
  opts: ManifestOptions,
): TrainingManifest {
  return assemble(rows, (r) => canTrain(r, opts).ok, opts.signedUrl);
}

export function buildEvalManifest(
  rows: LoopRow[],
  opts: ManifestOptions,
): TrainingManifest {
  return assemble(rows, (r) => canEvaluate(r, opts).ok, opts.signedUrl);
}
