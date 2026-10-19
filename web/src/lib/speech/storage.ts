import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Private audio storage for the Speech Lab (PRD FR-4). Every clip lives in
 * the private bucket `igala-speech`; the database stores a path, and the only
 * way to reach a file is a short-lived signed URL minted here, server-side,
 * with the service role key. No public URL is ever produced: there is no
 * function in this module that returns one, and the bucket must be created
 * private (an ops step; see the lab design doc).
 *
 * Server-only. The service role key must never reach a browser, so nothing in
 * this file is imported by a client component.
 */

export const SPEECH_BUCKET = "igala-speech";

/** Clips a browser can record. Parameters (codecs=opus) are stripped first. */
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;

/** Seconds a signed read URL stays valid unless the caller asks for less. */
export const DEFAULT_READ_TTL_SECONDS = 300;

/** Thrown when the storage environment is not configured. */
export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

/** The media type without parameters, lower-cased: "audio/webm;codecs=opus" -> "audio/webm". */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** True for a recordable audio type (parameters allowed). */
export function isAllowedAudioMime(mime: string): boolean {
  return (AUDIO_MIME_TYPES as readonly string[]).includes(baseMime(mime));
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

/**
 * Where a clip lives: `clips/<recordingId>.<ext>`. The id is a cuid minted by
 * the database layer, so the path carries no speaker, prompt or text.
 */
export function recordingPath(recordingId: string, mime: string): string {
  const ext = EXTENSIONS[baseMime(mime)];
  if (!ext) throw new Error(`Unsupported audio type: ${mime}`);
  return `clips/${recordingId}.${ext}`;
}

/** Paths are plain relative segments: no traversal, no odd characters. */
const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-/]{1,200}$/;

function assertSafePath(path: string): void {
  if (!SAFE_PATH.test(path)) throw new Error("Invalid storage path.");
}

/** A service-role client, built per call so env changes and test mocks apply. */
function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new StorageConfigError(
      "Speech storage is not configured: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).",
    );
  }
  if (!key) {
    throw new StorageConfigError(
      "Speech storage is not configured: set SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Resolve fetch at call time so a stubbed global fetch is honoured.
    global: { fetch: (input, init) => fetch(input, init) },
  });
}

export interface SignedUpload {
  /** PUT the audio here. Expires on its own; single object, single path. */
  uploadUrl: string;
  token: string;
  path: string;
  /** The Content-Type the client must send (parameters stripped). */
  contentType: string;
}

/**
 * A signed upload URL for one new object. Refuses a path that is unsafe and a
 * type that is not audio; the object cannot be overwritten (no upsert).
 */
export async function signedUploadUrl(
  path: string,
  mime: string,
): Promise<SignedUpload> {
  assertSafePath(path);
  if (!isAllowedAudioMime(mime)) {
    throw new Error(`Unsupported audio type: ${mime}`);
  }
  const { data, error } = await client()
    .storage.from(SPEECH_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(
      `Could not create an upload URL: ${error?.message ?? "no data"}`,
    );
  }
  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    contentType: baseMime(mime),
  };
}

/**
 * A short-lived signed URL to read one object. The default is five minutes;
 * callers re-mint rather than cache. Never a public URL.
 */
export async function signedReadUrl(
  path: string,
  expiresInSeconds: number = DEFAULT_READ_TTL_SECONDS,
): Promise<string> {
  assertSafePath(path);
  const ttl = Math.min(Math.max(Math.floor(expiresInSeconds), 1), 3600);
  const { data, error } = await client()
    .storage.from(SPEECH_BUCKET)
    .createSignedUrl(path, ttl);
  if (error || !data) {
    throw new Error(
      `Could not create a read URL: ${error?.message ?? "no data"}`,
    );
  }
  return data.signedUrl;
}
