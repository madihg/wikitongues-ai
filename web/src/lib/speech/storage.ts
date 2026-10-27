/**
 * Audio types and clip naming for the Speech Lab. There is no bucket: a clip
 * is stored in Postgres as `bytes` on its SpeechRecording row, uploaded as the
 * request body of PUT /api/lab/speech/recording/[id]/audio and served by the
 * GET beside it, both researcher-only. Nothing here talks to a network or a
 * database, so it is safe in a client component and in a test.
 */

/** Clips a browser can record. Parameters (codecs=opus) are stripped first. */
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;

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
 * A stable name for a clip, `clips/<recordingId>.<ext>`. It is an identifier
 * in the export manifest, not a location: the id is minted by the server, so
 * the name carries no speaker, prompt or text, and the bytes live in the
 * database row.
 */
export function recordingPath(recordingId: string, mime: string): string {
  const ext = EXTENSIONS[baseMime(mime)];
  if (!ext) throw new Error(`Unsupported audio type: ${mime}`);
  return `clips/${recordingId}.${ext}`;
}

/** The URL of a clip's audio endpoint. Same origin, researcher-only. */
export function audioUrl(recordingId: string): string {
  return `/api/lab/speech/recording/${encodeURIComponent(recordingId)}/audio`;
}
