/**
 * Deterministic feedback on one take, computed in the browser from the
 * decoded samples. Pure: samples in, numbers and plain-language verdicts out,
 * so every threshold below is unit tested without a microphone.
 *
 * There is NO speech recognition and no model call here. Transcription
 * feedback ("you said X, the text says Y") is a later step that needs an
 * Igala ASR baseline to exist first; until then the feedback is about the
 * recording itself (level, clipping, silence, length, pace), which is
 * honest and checkable. Client-safe (no server imports).
 */

import { MAX_DURATION_MS } from "./limits";
import { METER, RECORD_LEVELS, sanitizeRoom, type RoomReading } from "./record-levels";
import { sanitizeCapture, type CaptureSettings } from "./recorder";

/** Frame length for the silence and speech measures. */
export const FRAME_MS = 20;

/** A frame counts as speech when it is within this many dB of the loudest frame... */
export const SPEECH_WINDOW_DB = 28;
/** ...and above this absolute floor (dBFS), so a silent file has no speech. */
export const SPEECH_FLOOR_DBFS = -55;

/** A sample at or above this absolute value counts as clipped. */
export const CLIP_LEVEL = 0.99;

export interface QualityMetrics {
  durationMs: number;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  /** Share of 20 ms frames that carry speech, 0 to 1. */
  speechShare: number;
  /** RMS level over the speech frames, in dBFS (about -20 is comfortable). */
  rmsDbfs: number;
  /** Highest absolute sample, in dBFS (0 is full scale). */
  peakDbfs: number;
  /** Share of samples at or near full scale, 0 to 1. */
  clippingShare: number;
  /** Estimated from the text; null when no text was given. */
  syllables: number | null;
  /** Syllables over the speaking span (start of speech to end of speech). */
  syllablesPerSecond: number | null;
  /** How many takes were thrown away before this one (set by the recorder UI). */
  retakes?: number;
  /**
   * The level of the quietest tenth of the clip's frames, in dBFS: the room
   * and the microphone with nobody speaking (the gaps, the lead-in, the
   * tail). Null when the clip is too short to tell. Absent on older clips.
   */
  noiseFloorDbfs?: number | null;
  /** Voice level minus the noise floor, in dB. Null when either is unknown. */
  snrDb?: number | null;
  /** How the microphone was opened and what the browser applied (recorder.ts). */
  capture?: CaptureSettings;
  /** The room check of the sitting this clip was saved in, when one ran. */
  room?: RoomReading;
}

/** The share of frames, quietest first, that make up the noise floor. */
export const NOISE_FLOOR_SHARE = 0.1;
/** Fewer frames than this (0.2 s) and the noise floor is not estimated. */
export const NOISE_FLOOR_MIN_FRAMES = 10;

const DBFS_SILENT = -120;

function toDb(x: number): number {
  return x > 0 ? Math.max(20 * Math.log10(x), DBFS_SILENT) : DBFS_SILENT;
}

const round = (x: number, places: number) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

/**
 * Syllables estimated from the written text. Igala: every vowel letter is a
 * syllable (a e i o u, and the dotted vowels, which decompose to a base
 * vowel plus a combining dot below). English: runs of vowel letters count
 * once (y included), at least one per word. It is an estimate for pace, not
 * a phonological analysis.
 */
export function countSyllables(
  text: string,
  language: "igala" | "english" = "igala",
): number {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tone marks and the dot below
    .toLowerCase();
  if (language === "igala") {
    return (base.match(/[aeiou]/g) ?? []).length;
  }
  let total = 0;
  for (const word of base.split(/[^a-z]+/).filter(Boolean)) {
    const groups = word.match(/[aeiouy]+/g) ?? [];
    total += Math.max(groups.length, 1);
  }
  return total;
}

/**
 * Measure a mono sample buffer. `text` is what the speaker was meant to say
 * (for the syllable and pace estimate); pass undefined to skip it.
 */
export function analyseSamples(
  samples: Float32Array,
  sampleRate: number,
  text?: string,
  language: "igala" | "english" = "igala",
): QualityMetrics {
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const frameLen = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const frameCount = Math.ceil(samples.length / frameLen);

  let peak = 0;
  let clipped = 0;
  const frameDb: number[] = [];
  const frameSq: number[] = [];
  const frameN: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    const start = f * frameLen;
    const end = Math.min(start + frameLen, samples.length);
    let sq = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
      if (a >= CLIP_LEVEL) clipped++;
      sq += samples[i] * samples[i];
    }
    const n = end - start;
    frameSq.push(sq);
    frameN.push(n);
    frameDb.push(toDb(Math.sqrt(sq / n)));
  }

  const loudest = frameDb.length ? Math.max(...frameDb) : DBFS_SILENT;
  const threshold = Math.max(SPEECH_FLOOR_DBFS, loudest - SPEECH_WINDOW_DB);
  const isSpeech = frameDb.map((d) => d > threshold && d > SPEECH_FLOOR_DBFS);
  const first = isSpeech.indexOf(true);
  const last = isSpeech.lastIndexOf(true);
  const speechFrames = isSpeech.filter(Boolean).length;

  let leadingSilenceMs = durationMs;
  let trailingSilenceMs = durationMs;
  let speechSq = 0;
  let speechN = 0;
  if (first >= 0) {
    leadingSilenceMs = Math.round(first * FRAME_MS);
    trailingSilenceMs = Math.max(
      0,
      durationMs - Math.min(durationMs, (last + 1) * FRAME_MS),
    );
    for (let f = 0; f < frameCount; f++) {
      if (isSpeech[f]) {
        speechSq += frameSq[f];
        speechN += frameN[f];
      }
    }
  }

  // Noise floor: the mean power of the quietest tenth of the frames. The
  // worker measures the same thing (noiseFloorDbfs, snrDb) over the frames a
  // real voice detector calls non-speech. The browser has no such detector:
  // its speech rule above calls anything within 28 dB of the loudest frame
  // speech, so steady room noise 12 dB under the voice would count as speech
  // and never be measured. The quietest frames are the gaps whatever their
  // level, so this estimate works in exactly the rooms that need the warning.
  let noiseFloorDbfs: number | null = null;
  if (frameCount >= NOISE_FLOOR_MIN_FRAMES) {
    const order = frameDb
      .map((d, f) => ({ d, f }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(1, Math.floor(frameCount * NOISE_FLOOR_SHARE)));
    let sq = 0;
    let n = 0;
    for (const { f } of order) {
      sq += frameSq[f];
      n += frameN[f];
    }
    noiseFloorDbfs = round(toDb(Math.sqrt(sq / n)), 1);
  }
  const speechDbfs = speechN
    ? round(toDb(Math.sqrt(speechSq / speechN)), 1)
    : DBFS_SILENT;

  const syllables = text && text.trim() ? countSyllables(text, language) : null;
  const spanMs =
    first >= 0 ? Math.max(0, durationMs - leadingSilenceMs - trailingSilenceMs) : 0;
  const syllablesPerSecond =
    syllables !== null && spanMs > 0 ? syllables / (spanMs / 1000) : null;

  return {
    durationMs,
    leadingSilenceMs,
    trailingSilenceMs,
    speechShare: frameCount ? round(speechFrames / frameCount, 3) : 0,
    rmsDbfs: speechDbfs,
    peakDbfs: round(toDb(peak), 1),
    clippingShare: samples.length ? round(clipped / samples.length, 5) : 0,
    syllables,
    syllablesPerSecond:
      syllablesPerSecond === null ? null : round(syllablesPerSecond, 2),
    noiseFloorDbfs,
    snrDb:
      noiseFloorDbfs === null || speechN === 0
        ? null
        : round(speechDbfs - noiseFloorDbfs, 1),
  };
}

// ---- Verdicts -------------------------------------------------------------

export type VerdictKey =
  | "no_speech"
  | "too_short"
  | "too_quiet"
  | "a_little_quiet"
  | "too_loud"
  | "noisy_room"
  | "clipped"
  | "cut_short"
  | "long_pause_start"
  | "long_pause_end"
  | "too_fast"
  | "too_slow"
  | "good";

export interface Verdict {
  key: VerdictKey;
  /** "good" is a clean take; "warn" suggests another try; "info" is a note. */
  tone: "good" | "warn" | "info";
  message: string;
}

/**
 * Thresholds, in one place so a test (and a tuning pass) can see them. The
 * level and noise numbers come from record-levels.ts, the one file the level
 * targets live in; the rest are this file's own.
 */
export const THRESHOLDS = {
  minSpeechShare: 0.05,
  minDurationMs: 600,
  /** At or under this voice level: the stronger "Too quiet" line. */
  tooQuietDbfs: RECORD_LEVELS.veryQuietSpeechDbfs,
  /** ...or a loudest point under this. */
  tooQuietPeakDbfs: METER.veryQuietDbfs,
  /** Under this voice level (and above the one before): "A little quiet". */
  aLittleQuietDbfs: METER.speechLevelQuietDbfs,
  /** ...or a loudest point under this. */
  aLittleQuietPeakDbfs: METER.quietWarnDbfs,
  /** Over this voice level: "Too loud". */
  tooLoudDbfs: METER.speechLevelLoudDbfs,
  /** A loudest point at or over this is too loud too, even with a calm voice level. */
  tooLoudPeakDbfs: METER.clipDbfs,
  /** Noise closer to the voice than this many dB: "Noisy room". */
  noisyRoomSnrDb: METER.noisyRoomSnrDb,
  clippingShare: 0.005,
  peakDbfs: -0.2,
  cutShortTrailingMs: 120,
  longLeadingMs: 1500,
  longTrailingMs: 2500,
  slowSyllablesPerSecond: 1.5,
  fastSyllablesPerSecond: 7,
} as const;

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/**
 * Plain-language verdicts for a set of metrics, most important first. A
 * clean take gets exactly one "good" line; anything else lists what to fix.
 */
export function verdicts(m: QualityMetrics): Verdict[] {
  const T = THRESHOLDS;
  const out: Verdict[] = [];

  if (m.speechShare < T.minSpeechShare) {
    return [
      {
        key: "no_speech",
        tone: "warn",
        message:
          "No speech heard: check the microphone is not muted, then try again",
      },
    ];
  }
  if (m.durationMs < T.minDurationMs) {
    out.push({
      key: "too_short",
      tone: "warn",
      message: "Very short: this is under a second, try again",
    });
  }
  const clipped = m.clippingShare > T.clippingShare || m.peakDbfs > T.peakDbfs;
  if (m.rmsDbfs <= T.tooQuietDbfs || m.peakDbfs < T.tooQuietPeakDbfs) {
    out.push({
      key: "too_quiet",
      tone: "warn",
      message: "Too quiet: hold the phone closer and try again",
    });
  } else if (
    m.rmsDbfs < T.aLittleQuietDbfs ||
    m.peakDbfs < T.aLittleQuietPeakDbfs
  ) {
    // The softer first step: a quiet clip can be raised later, so this only
    // suggests moving closer.
    out.push({
      key: "a_little_quiet",
      tone: "warn",
      message: "A little quiet: move a little closer to the microphone.",
    });
  } else if (
    m.rmsDbfs > T.tooLoudDbfs ||
    // A loudest point near full scale with no clipping yet: the same advice.
    (m.peakDbfs >= T.tooLoudPeakDbfs && !clipped)
  ) {
    out.push({
      key: "too_loud",
      tone: "warn",
      message: "Too loud: speak a little softer or move back and try again",
    });
  }
  if (clipped) {
    out.push({
      key: "clipped",
      tone: "warn",
      message: "Clipped: speak a little further from the microphone",
    });
  }
  if (
    typeof m.snrDb === "number" &&
    m.snrDb < T.noisyRoomSnrDb
  ) {
    out.push({
      key: "noisy_room",
      tone: "warn",
      message:
        "Noisy room: we can hear noise behind your voice. Try a quieter place.",
    });
  }
  if (m.trailingSilenceMs < T.cutShortTrailingMs) {
    out.push({
      key: "cut_short",
      tone: "warn",
      message: "Cut short: the clip ends while you are still speaking",
    });
  }
  if (m.leadingSilenceMs > T.longLeadingMs) {
    out.push({
      key: "long_pause_start",
      tone: "info",
      message: `Long pause at the start (${seconds(m.leadingSilenceMs)} s): kept in the file, and its length is stored so it can be trimmed later`,
    });
  }
  if (m.trailingSilenceMs > T.longTrailingMs) {
    out.push({
      key: "long_pause_end",
      tone: "info",
      message: `Long pause at the end (${seconds(m.trailingSilenceMs)} s): kept in the file, and its length is stored so it can be trimmed later`,
    });
  }
  if (m.syllablesPerSecond !== null && m.syllables !== null) {
    if (m.syllablesPerSecond > T.fastSyllablesPerSecond) {
      out.push({
        key: "too_fast",
        tone: "warn",
        message: `Fast: ${m.syllablesPerSecond.toFixed(1)} syllables a second, slow down a little`,
      });
    } else if (m.syllablesPerSecond < T.slowSyllablesPerSecond) {
      out.push({
        key: "too_slow",
        tone: "info",
        message: `Slow: ${m.syllablesPerSecond.toFixed(1)} syllables a second, fine if that is how you say it`,
      });
    }
  }

  if (out.every((v) => v.tone === "info")) {
    const span = Math.max(
      0,
      m.durationMs - m.leadingSilenceMs - m.trailingSilenceMs,
    );
    const detail =
      m.syllables !== null
        ? `${seconds(span)} s for ${m.syllables} syllable${m.syllables === 1 ? "" : "s"}`
        : `${seconds(span)} s of speech`;
    out.unshift({
      key: "good",
      tone: "good",
      message: `Good take: clear level, ${detail}`,
    });
  }
  return out;
}

/** True when the take has at least one warning worth another attempt. */
export function hasWarning(m: QualityMetrics): boolean {
  return verdicts(m).some((v) => v.tone === "warn");
}

// ---- Server-side sanitising -----------------------------------------------

// Durations are bounded by the longest take (five minutes since 2026-11-24),
// so a long take's metrics are stored as measured, not clamped to a minute.
const NUMERIC_FIELDS: [keyof QualityMetrics, number, number][] = [
  ["durationMs", 0, MAX_DURATION_MS],
  ["leadingSilenceMs", 0, MAX_DURATION_MS],
  ["trailingSilenceMs", 0, MAX_DURATION_MS],
  ["speechShare", 0, 1],
  ["rmsDbfs", -120, 6],
  ["peakDbfs", -120, 6],
  ["clippingShare", 0, 1],
  ["syllables", 0, 2000],
  ["syllablesPerSecond", 0, 100],
  ["retakes", 0, 1000],
  ["noiseFloorDbfs", -120, 6],
  ["snrDb", -20, 140],
];
const NULLABLE_FIELDS: readonly (keyof QualityMetrics)[] = [
  "syllables",
  "syllablesPerSecond",
  "noiseFloorDbfs",
  "snrDb",
];

/**
 * Keep only the known numeric metrics, each within range, plus the capture
 * settings and the room reading when well formed, from whatever the client
 * sent. Returns null when nothing usable is left. The server never
 * trusts a metric for any rule (the metrics only sort and filter); this just
 * keeps junk out of the JSON column.
 */
export function sanitizeQuality(raw: unknown): QualityMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  for (const [key, lo, hi] of NUMERIC_FIELDS) {
    const v = src[key];
    if (v === null && NULLABLE_FIELDS.includes(key)) {
      out[key] = null;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.min(Math.max(v, lo), hi);
    }
  }
  for (const required of [
    "durationMs",
    "speechShare",
    "rmsDbfs",
    "peakDbfs",
  ] as const) {
    if (typeof out[required] !== "number") return null;
  }
  out.leadingSilenceMs ??= 0;
  out.trailingSilenceMs ??= 0;
  out.clippingShare ??= 0;
  out.syllables ??= null;
  out.syllablesPerSecond ??= null;
  // The two non-numeric records ride along only when well formed. Neither
  // feeds any rule: they say how the clip was captured and in what room.
  const metrics = out as unknown as QualityMetrics;
  const capture = sanitizeCapture(src.capture);
  if (capture) metrics.capture = capture;
  const room = sanitizeRoom(src.room);
  if (room) metrics.room = room;
  return metrics;
}

// ---- Session line ---------------------------------------------------------

export interface SessionCounts {
  kept: number;
  retakes: number;
  communityOnly: number;
  licensed: number;
  open: number;
}

/** Minutes or hours to one decimal; whole numbers print without ".0". */
function oneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * "You added 12 minutes today. The pool is at 41.5 hours." Both numbers come
 * from the server: the caller's own non-demo confirmed clips since the start
 * of today, and the pool (kept, consented, non-demo clips of every tier).
 */
export function sessionLine(minutesToday: number, poolHours: number): string {
  const minutes = Math.round(minutesToday * 10) / 10;
  return `You added ${oneDecimal(minutes)} ${minutes === 1 ? "minute" : "minutes"} today. The pool is at ${oneDecimal(poolHours)} ${Math.round(poolHours * 10) / 10 === 1 ? "hour" : "hours"}.`;
}
