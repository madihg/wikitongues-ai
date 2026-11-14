import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Private object storage for Speech Lab clips (US-038): the Supabase Storage
 * bucket `igala-speech`. Server-side only: it holds the service-role key, so
 * it is imported by API routes and scripts, never by a component.
 *
 * Nothing runs at import. The client is built on first use from env read at
 * that moment, so the app boots with none of these set; every function then
 * throws an error naming the missing variable. `storageEnabled()` is the
 * rollback flag: true only when SPEECH_STORAGE is exactly "1" and the URL and
 * key are both present. Callers branch on it and keep the Postgres bytes.
 *
 * There is no public URL. Reads go through `signedUrl`, valid for an hour.
 */

export const BUCKET = "igala-speech";
export const SIGNED_URL_SECONDS = 3600;

function supabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    undefined
  );
}

export function storageEnabled(): boolean {
  return (
    process.env.SPEECH_STORAGE === "1" &&
    !!supabaseUrl() &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function bucket() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set: speech storage needs the service-role key.",
    );
  }
  if (!url) {
    throw new Error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set: speech storage needs the project URL.",
    );
  }
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage.from(BUCKET);
}

/** Upload one clip. Never overwrites: a key that exists is an error. */
export async function putClip(
  key: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const { error } = await bucket().upload(key, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`Speech storage upload failed: ${error.message}`);
}

/** A time-limited URL for one clip (an hour by default). */
export async function signedUrl(
  key: string,
  seconds: number = SIGNED_URL_SECONDS,
): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(key, seconds);
  if (error || !data) {
    throw new Error(
      `Speech storage could not sign a URL: ${error?.message ?? "no data"}`,
    );
  }
  return data.signedUrl;
}

export async function deleteClip(key: string): Promise<void> {
  const { error } = await bucket().remove([key]);
  if (error) throw new Error(`Speech storage delete failed: ${error.message}`);
}

/** Read a clip back (the backfill uses this to verify its upload). */
export async function downloadClip(key: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(key);
  if (error || !data) {
    throw new Error(
      `Speech storage download failed: ${error?.message ?? "no data"}`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}
