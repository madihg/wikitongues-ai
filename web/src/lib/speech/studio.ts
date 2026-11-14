import { CLIP_LEVEL, hasWarning, type QualityMetrics } from "./analyse";

/**
 * The pure half of the studio session page (PRD US-026): the checklist, the
 * script file reader, the session summary and the live level maths. Client
 * safe (no server imports).
 */

/** A studio take is saved as community_only until the speaker's contract says otherwise. */
export const STUDIO_TIER = "community_only" as const;
export const STUDIO_SAMPLE_RATE = 48000;
export const DEFAULT_TARGET_HOURS = 5;

export const STUDIO_CHECKLIST = [
  { key: "quiet_room", label: "The room is quiet: doors shut, fans and phones off." },
  { key: "same_mic", label: "Same microphone, same distance as the last session." },
  { key: "water", label: "Water within reach, and a sip before each block." },
  { key: "no_clothing_noise", label: "No clothing noise: no jewellery, nothing rubbing the microphone." },
] as const;

/** Opaque ids the page makes for a sitting; 8 to 64 URL-safe characters. */
export function isStudioSessionId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}

export interface ScriptLine {
  /** Public prompt code the clip is saved against. */
  promptCode: string;
  text: string;
}

/** The studio script: JSON lines {n?, promptCode, text}, as build-tts-script writes them. */
export function parseScript(raw: string): { lines: ScriptLine[]; unreadable: number } {
  const lines: ScriptLine[] = [];
  let unreadable = 0;
  for (const row of raw.split(/\r?\n/)) {
    if (!row.trim()) continue;
    try {
      const j = JSON.parse(row) as { promptCode?: unknown; text?: unknown };
      if (
        typeof j.promptCode === "string" &&
        j.promptCode.trim() &&
        typeof j.text === "string" &&
        j.text.trim()
      ) {
        lines.push({ promptCode: j.promptCode.trim(), text: j.text.normalize("NFC").trim() });
        continue;
      }
    } catch {
      /* counted below */
    }
    unreadable++;
  }
  return { lines, unreadable };
}

/**
 * "Kept after the take check": the metrics exist and the take check raised no
 * warning. A take with a warning is still saved, unreviewed, and can be
 * kept from the Recordings tab; the check never blocks the speaker.
 */
export function studioClipKept(metrics: QualityMetrics | null): boolean {
  return metrics !== null && !hasWarning(metrics);
}

export interface StudioRow {
  studioSessionId: string | null;
  durationMs: number;
  reviewStatus: string | null;
}

export interface MinutesBlock {
  clips: number;
  keptClips: number;
  recordedMinutes: number;
  keptMinutes: number;
}

export interface StudioSummary {
  session: MinutesBlock;
  /** Every studio session of this speaker. */
  total: MinutesBlock;
  targetMinutes: number;
  /** Kept minutes over the target, 0 to 100. */
  percentOfTarget: number;
}

function block(rows: StudioRow[]): MinutesBlock {
  const kept = rows.filter((r) => r.reviewStatus === "keep");
  const ms = (xs: StudioRow[]) => xs.reduce((n, r) => n + r.durationMs, 0);
  return {
    clips: rows.length,
    keptClips: kept.length,
    recordedMinutes: ms(rows) / 60_000,
    keptMinutes: ms(kept) / 60_000,
  };
}

export function summarizeStudio(
  rows: StudioRow[],
  sessionId: string,
  targetHours: number,
): StudioSummary {
  const studio = rows.filter((r) => r.studioSessionId !== null);
  const total = block(studio);
  const targetMinutes = targetHours * 60;
  return {
    session: block(studio.filter((r) => r.studioSessionId === sessionId)),
    total,
    targetMinutes,
    percentOfTarget:
      targetMinutes > 0 ? Math.min(100, (total.keptMinutes / targetMinutes) * 100) : 0,
  };
}

/** Peak and RMS of one block of samples, in dBFS, and whether it clips. */
export function levelOf(samples: Float32Array): {
  peakDbfs: number;
  rmsDbfs: number;
  clipping: boolean;
} {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    sum += samples[i] * samples[i];
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDbfs: db(peak), rmsDbfs: db(rms), clipping: peak >= CLIP_LEVEL };
}
