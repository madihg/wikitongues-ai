import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signature the worker puts on its callback: hex HMAC-SHA256 of
 * `${timestamp}.${rawBody}` under SPEECH_WORKER_SECRET, timestamp in Unix
 * seconds. Mirrors worker/igala_speech/signing.py; both test the vector in
 * worker/tests/fixtures/hmac.json.
 */
export const MAX_SKEW_SECONDS = 300;

export function signBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Constant time. Anything that is not the right-length hex is a no. */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const want = Buffer.from(signBody(secret, timestamp, body), "utf8");
  const got = Buffer.from(signature, "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}

export function timestampFresh(
  timestamp: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= MAX_SKEW_SECONDS;
}

/** Constant-time equality for the shared-secret header. */
export function secretMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
