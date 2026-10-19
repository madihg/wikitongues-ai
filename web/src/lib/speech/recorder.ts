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
 * Whole seconds left once the countdown starts (the last five seconds of the
 * 30), else null. 25.0 s elapsed reads 5; 29.01 s reads 1; at the cap, 0.
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

/** Hex sha256 of a blob (browser: SubtleCrypto, needs a secure context). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
