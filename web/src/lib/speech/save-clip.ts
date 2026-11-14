/**
 * The two-step save behind every clip, as one function with its network
 * calls passed in, so the order and the retry rule are unit tested without a
 * browser:
 *   1. POST /api/lab/speech/recording creates the row (unless a previous
 *      attempt already did: `existing`) and returns the audio URL;
 *   2. the audio goes up as the PUT body.
 * A failure at step 2 leaves the row id with the caller (via onRow, called
 * as soon as the row exists), so Try again repeats only the PUT and never
 * creates a second row for the same take. Client-safe.
 */

export interface SavedRow {
  id: string;
  audioUrl: string;
  coldAuthorAnswerId: string | null;
}

export class SaveError extends Error {
  constructor(
    message: string,
    /** The HTTP status when the server refused (428 means consent again). */
    readonly status?: number,
  ) {
    super(message);
    this.name = "SaveError";
  }
}

export interface SaveDeps {
  /** POST the row's JSON; resolves the parsed response. */
  createRow: (
    body: Record<string, unknown>,
  ) => Promise<{ ok: boolean; status: number; json: unknown }>;
  /** PUT the audio; rejects with an Error on failure. 409 is the caller's success. */
  putAudio: (
    url: string,
    blob: Blob,
    onProgress: (pct: number) => void,
  ) => Promise<void>;
}

export async function saveClip(
  deps: SaveDeps,
  args: {
    body: Record<string, unknown>;
    blob: Blob;
    existing: SavedRow | null;
    onRow: (row: SavedRow) => void;
    onProgress: (pct: number) => void;
  },
): Promise<SavedRow> {
  let row = args.existing;
  if (!row) {
    const res = await deps.createRow(args.body);
    const j = res.json as {
      id?: string;
      audioUrl?: string;
      coldAuthorAnswerId?: string | null;
      error?: string;
    } | null;
    if (!res.ok || !j?.id || !j.audioUrl) {
      throw new SaveError(j?.error ?? "Could not save the clip.", res.status);
    }
    row = {
      id: j.id,
      audioUrl: j.audioUrl,
      coldAuthorAnswerId: j.coldAuthorAnswerId ?? null,
    };
    args.onRow(row);
  }
  await deps.putAudio(row.audioUrl, args.blob, args.onProgress);
  return row;
}
