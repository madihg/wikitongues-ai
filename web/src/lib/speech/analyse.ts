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
}

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
    rmsDbfs: speechN ? round(toDb(Math.sqrt(speechSq / speechN)), 1) : DBFS_SILENT,
    peakDbfs: round(toDb(peak), 1),
    clippingShare: samples.length ? round(clipped / samples.length, 5) : 0,
    syllables,
    syllablesPerSecond:
      syllablesPerSecond === null ? null : round(syllablesPerSecond, 2),
  };
}

// ---- Verdicts -------------------------------------------------------------

export type VerdictKey =
  | "no_speech"
  | "too_short"
  | "too_quiet"
  | "too_loud"
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

/** Thresholds, in one place so a test (and a tuning pass) can see them. */
export const THRESHOLDS = {
  minSpeechShare: 0.05,
  minDurationMs: 600,
  tooQuietDbfs: -35,
  tooLoudDbfs: -8,
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
  if (m.rmsDbfs < T.tooQuietDbfs) {
    out.push({
      key: "too_quiet",
      tone: "warn",
      message: "Too quiet: hold the phone closer and try again",
    });
  } else if (m.rmsDbfs > T.tooLoudDbfs) {
    out.push({
      key: "too_loud",
      tone: "warn",
      message: "Too loud: speak a little softer or move back and try again",
    });
  }
  if (m.clippingShare > T.clippingShare || m.peakDbfs > T.peakDbfs) {
    out.push({
      key: "clipped",
      tone: "warn",
      message: "Clipped: speak a little further from the microphone",
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

const NUMERIC_FIELDS: [keyof QualityMetrics, number, number][] = [
  ["durationMs", 0, 60_000],
  ["leadingSilenceMs", 0, 60_000],
  ["trailingSilenceMs", 0, 60_000],
  ["speechShare", 0, 1],
  ["rmsDbfs", -120, 6],
  ["peakDbfs", -120, 6],
  ["clippingShare", 0, 1],
  ["syllables", 0, 2000],
  ["syllablesPerSecond", 0, 100],
  ["retakes", 0, 1000],
];

/**
 * Keep only the known numeric metrics, each within range, from whatever the
 * client sent. Returns null when nothing usable is left. The server never
 * trusts a metric for any rule (the metrics only sort and filter); this just
 * keeps junk out of the JSON column.
 */
export function sanitizeQuality(raw: unknown): QualityMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  for (const [key, lo, hi] of NUMERIC_FIELDS) {
    const v = src[key];
    if (v === null && (key === "syllables" || key === "syllablesPerSecond")) {
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
  return out as unknown as QualityMetrics;
}

// ---- Session line ---------------------------------------------------------

export interface SessionCounts {
  kept: number;
  retakes: number;
  communityOnly: number;
  licensed: number;
  open: number;
}

/** "Today: 6 clips kept, 2 re-recorded, 3 community-only, 3 licensed". */
export function sessionLine(c: SessionCounts): string {
  const parts = [
    `${c.kept} clip${c.kept === 1 ? "" : "s"} kept`,
    `${c.retakes} re-recorded`,
    `${c.communityOnly} community-only`,
    `${c.licensed} licensed`,
  ];
  if (c.open > 0) parts.push(`${c.open} open`);
  return `Today: ${parts.join(", ")}`;
}
