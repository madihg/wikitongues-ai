import { COUNTDOWN_FROM_MS, MAX_DURATION_MS } from "./limits";

/**
 * Pure helpers for the browser recorder. Client-safe (no server imports) and
 * free of DOM globals except where a function says so, so they are unit
 * testable without a browser.
 */

/**
 * Container/codec candidates, best first: webm+opus where the browser
 * records it (Chrome, Firefox, newer Safari), then mp4 (iOS Safari), then
 * ogg. The first one the browser reports as supported wins.
 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** The first supported candidate, or null when the browser can record none. */
export function pickRecorderMime(
  isSupported: (mime: string) => boolean,
): string | null {
  for (const m of RECORDER_MIME_CANDIDATES) {
    if (isSupported(m)) return m;
  }
  return null;
}

/**
 * Whole seconds left once the countdown starts (the last ten seconds before
 * the safety stop), else null. Ten seconds before the stop reads 10; one
 * hundredth of a second before it reads 1; at the stop, 0.
 */
export function countdownSeconds(elapsedMs: number): number | null {
  if (elapsedMs < COUNTDOWN_FROM_MS) return null;
  const left = Math.max(MAX_DURATION_MS - elapsedMs, 0);
  return Math.ceil(left / 1000);
}

/** Elapsed time as m:ss.t for the mono timer. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.min(ms, MAX_DURATION_MS));
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

// ---- Capture settings ------------------------------------------------------

/**
 * How the microphone is opened.
 *
 * "processed" is what the recorder has always asked for: echo cancellation
 * and noise suppression on, automatic gain left to the browser. All 131
 * clips recorded up to 2026-11-13 were made this way.
 *
 * "raw" asks the browser to turn OFF echo cancellation, noise suppression
 * and automatic gain, all three together: Chrome is reported to ignore the
 * gain setting unless echo cancellation is off too. It is what studio
 * sittings already use.
 *
 * The decision (2026-11-13, from the speech research and the recording spec):
 * new clips SHOULD be recorded raw. A denoiser baked into the upload cannot
 * be undone and is different on every phone; automatic gain changes the level
 * inside a clip and lifts the noise floor; both change what is measured from
 * the clip (pitch, level) and what a voice model learns. Clips are cleaned
 * later, as a copy, with the raw upload kept.
 *
 * The switch: raw clips will be quieter and noisier than the 131, so the
 * recording spec leaves the change to Halim to confirm. Until then the
 * default stays "processed", so nothing changes for a speaker. To switch,
 * set NEXT_PUBLIC_SPEECH_CAPTURE=raw and redeploy (the value is read at build
 * time); unset it to go back. Both modes go through captureConstraints and
 * are tested.
 *
 * Either way the browser may not honour the request, so the settings it
 * actually applied are read back (appliedCapture) and stored with each clip
 * from now on: that record is what a comparison of the two modes rests on.
 */
export type CaptureMode = "raw" | "processed";
export const DEFAULT_CAPTURE_MODE: CaptureMode = "processed";

/** The capture mode for ordinary clips. Studio takes are always raw. */
export function captureMode(
  env: string | undefined = process.env.NEXT_PUBLIC_SPEECH_CAPTURE,
): CaptureMode {
  return env === "raw" || env === "processed" ? env : DEFAULT_CAPTURE_MODE;
}

/** The audio constraints for a mode. Mono, 48 kHz asked for in both. */
export function captureConstraints(mode: CaptureMode): MediaTrackConstraints {
  const base = { channelCount: 1, sampleRate: { ideal: 48000 } };
  return mode === "raw"
    ? {
        ...base,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    : { ...base, echoCancellation: true, noiseSuppression: true };
}

/** What was asked for and what the browser says it applied, stored per clip. */
export interface CaptureSettings {
  requested: CaptureMode;
  /** As the browser reports them; null when it does not say. */
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  sampleRate: number | null;
  channelCount: number | null;
  /** The browser and device, as the browser names itself. */
  userAgent?: string;
}

const flag = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Read back what the browser applied (MediaStreamTrack.getSettings()). */
export function appliedCapture(
  requested: CaptureMode,
  settings: Partial<Record<string, unknown>> | null | undefined,
  userAgent?: string,
): CaptureSettings {
  const s = settings ?? {};
  return {
    requested,
    echoCancellation: flag(s.echoCancellation),
    noiseSuppression: flag(s.noiseSuppression),
    autoGainControl: flag(s.autoGainControl),
    sampleRate: count(s.sampleRate),
    channelCount: count(s.channelCount),
    ...(userAgent ? { userAgent: userAgent.slice(0, 200) } : {}),
  };
}

/**
 * True when a raw request was honoured as far as the browser reports: none of
 * the three is reported on. A browser that reports nothing counts as honoured
 * (unknown is not a failure), and a processed request is always honoured.
 */
export function captureHonoured(c: CaptureSettings): boolean {
  if (c.requested !== "raw") return true;
  return (
    c.echoCancellation !== true &&
    c.noiseSuppression !== true &&
    c.autoGainControl !== true
  );
}

/** Keep only a well-formed capture record from whatever the client sent. */
export function sanitizeCapture(raw: unknown): CaptureSettings | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.requested !== "raw" && r.requested !== "processed") return null;
  const rate = count(r.sampleRate);
  const channels = count(r.channelCount);
  return {
    requested: r.requested,
    echoCancellation: flag(r.echoCancellation),
    noiseSuppression: flag(r.noiseSuppression),
    autoGainControl: flag(r.autoGainControl),
    sampleRate: rate !== null && rate >= 8000 && rate <= 192000 ? rate : null,
    channelCount:
      channels !== null && channels >= 1 && channels <= 8 ? channels : null,
    ...(typeof r.userAgent === "string" && r.userAgent
      ? { userAgent: r.userAgent.slice(0, 200) }
      : {}),
  };
}
