import { MAX_BYTES } from "./limits";

/**
 * Sending one take in parts, for a take larger than one request body may be
 * (MAX_BYTES, 4 MB). Since 2026-11-24 a take can run five minutes, which is
 * 5 to 9 MB of the browser's own Opus. Client-safe and free of the network:
 * the caller passes the function that sends one part, so the order, the
 * resume rule and the stall guard are unit tested without a browser.
 *
 * The server's rule (PUT /api/lab/speech/recording/[id]/audio?offset&total):
 * a part is stored only when its offset is exactly what the server already
 * holds, and every answer says how much it holds. So this loop always
 * carries on from `received`: a part that was stored but whose answer was
 * lost is not sent again, and a gap is filled from where the server stands.
 */

export interface PartAnswer {
  /** Bytes of this clip the server holds after this request. */
  received: number;
  /** True once the whole clip is stored (or was already: a 409). */
  complete: boolean;
}

/** Send one part; onLoaded reports this part's own bytes sent so far. */
export type PutPart = (
  part: Blob,
  offset: number,
  total: number,
  onLoaded: (loaded: number) => void,
) => Promise<PartAnswer>;

/** Answers in a row that did not move the server forward before giving up. */
export const MAX_STALLS = 3;

export async function uploadInParts(
  blob: Blob,
  putPart: PutPart,
  onProgress: (pct: number) => void,
  partBytes: number = MAX_BYTES,
): Promise<void> {
  const total = blob.size;
  if (total === 0) throw new Error("The recording is empty.");
  let offset = 0;
  let stalls = 0;
  for (;;) {
    const end = Math.min(offset + partBytes, total);
    const answer = await putPart(blob.slice(offset, end), offset, total, (n) =>
      onProgress(((offset + n) / total) * 100),
    );
    if (answer.complete) {
      onProgress(100);
      return;
    }
    const received = Math.max(0, Math.min(answer.received, total));
    // The server holds everything but does not call it complete: something
    // is wrong on its side, and sending nothing more cannot fix it.
    if (received >= total) {
      throw new Error("The upload did not finish. Try again.");
    }
    stalls = received > offset ? 0 : stalls + 1;
    if (stalls >= MAX_STALLS) {
      throw new Error(
        "The upload is not moving. Check your connection, then try again.",
      );
    }
    offset = received;
    onProgress((offset / total) * 100);
  }
}
