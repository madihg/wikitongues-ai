/**
 * Constants shared by the Speech Lab routes and screens. Client-safe: no
 * server imports, so the Record page can read the same numbers the API
 * enforces and the two cannot drift.
 */

/**
 * How long one take can run: five minutes, a safety stop and nothing more.
 *
 * Until 2026-11-24 the recorder stopped every take at 30 seconds. Speakers
 * reading a long answer were cut off mid-sentence and the rest was never
 * captured (a 135-word answer recorded on 2026-11-11: its Igala and English
 * clips both stopped at 30 s, about half way through). Decided on the 2026-11-24 call: a speaker
 * records the whole answer in one take and the whole take is kept. Long
 * takes are cut into model-sized pieces later, from the kept original (see
 * VOICE_TRAIN_MAX_MS), never by stopping the speaker.
 *
 * Five minutes covers the longest answer in the data (198 words, about two
 * minutes read aloud) with room to spare, and still stops a recorder someone
 * forgot to turn off. Raise it here if conversation recordings need longer;
 * the server and the upload read the same number.
 */
export const MAX_DURATION_MS = 5 * 60_000;

/**
 * Every take recorded before 2026-11-24 stopped here, and its duration was
 * clamped to exactly this many milliseconds. A clip of exactly 30,000 ms is
 * therefore one that ran into the old stop: its audio ends before its text.
 */
export const LEGACY_MAX_DURATION_MS = 30_000;

/**
 * The longest clip the first voice model trains on: 25 seconds, the voice
 * trainer's own limit (worker/first_model.py, tts-finetune,
 * max_duration_in_seconds 25). The trainer drops a longer clip without a
 * word, so the training plan leaves such clips out itself and counts them
 * (first-model-plan.ts). They stay kept, whole, to be cut into pieces later.
 *
 * Scoring is not limited: the recogniser (omniASR, which refuses audio over
 * 40 s) gets a long clip in pieces cut at quiet points (worker _split_long).
 */
export const VOICE_TRAIN_MAX_MS = 25_000;

/** The visible countdown starts once this much has elapsed (the last 10 s). */
export const COUNTDOWN_FROM_MS = MAX_DURATION_MS - 10_000;

/**
 * True when a clip stopped because the recorder did, not because the speaker
 * finished: it ran into the old 30 second stop (exactly 30,000 ms) or into
 * the five minute safety stop. Its text runs past its audio.
 */
export function ranIntoCap(durationMs: number): boolean {
  return (
    durationMs === LEGACY_MAX_DURATION_MS || durationMs >= MAX_DURATION_MS
  );
}

/**
 * One request body at most: 4 MB, enforced server side on the audio PUT (a
 * clip goes up as a request body, and a serverless function accepts at most
 * 4.5 MB of one). A take larger than this goes up in parts of this size.
 */
export const MAX_BYTES = 4 * 1024 * 1024;

/**
 * One clip at most, all parts together: 20 MB. Five minutes of the browser's
 * own Opus is 5 to 9 MB at the bit rates seen so far (128 to 231 kbit/s), so
 * this leaves room for a device that records richer audio.
 */
export const MAX_CLIP_BYTES = 20 * 1024 * 1024;

/** What the speaker said in a clip: the Igala answer, or its English meaning. */
export const LANGUAGES = ["igala", "english"] as const;
export type SpeechLanguage = (typeof LANGUAGES)[number];
export const LANGUAGE_LABEL: Record<SpeechLanguage, string> = {
  igala: "Igala",
  english: "English",
};

/** What the speaker chooses for each clip. No default: the UI preselects none. */
export const TIERS = ["open", "licensed", "community_only"] as const;
export type Tier = (typeof TIERS)[number];

export const REVIEW_STATUSES = ["keep", "bad_audio", "wrong_text"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Review verdicts that take a clip out of listening and every export.
 * "withdrawn" is not a reviewer choice (REVIEW_STATUSES omits it): the speaker
 * withdrew consent, see withdrawal.ts.
 */
export const REJECTED_REVIEW_STATUSES: readonly string[] = [
  "bad_audio",
  "wrong_text",
  "withdrawn",
];

/** Listen verdicts. Same shape as the text arena plus "both unusable". */
export const SPEECH_WINNERS = ["a", "b", "tie", "both_unusable"] as const;
export type SpeechWinner = (typeof SPEECH_WINNERS)[number];

/** The one required reason chip row in Listen. */
export const REASON_TAGS = [
  { key: "wrong_word", label: "Wrong word" },
  { key: "wrong_tone", label: "Wrong tone" },
  { key: "unclear", label: "Unclear" },
  { key: "robotic", label: "Robotic" },
  { key: "wrong_pronunciation", label: "Wrong pronunciation" },
] as const;
export const REASON_KEYS: readonly string[] = REASON_TAGS.map((r) => r.key);

/** Longest free-text note kept on a judgment. */
export const MAX_NOTE_CHARS = 500;

/** Longest answer a researcher can write on the Record page. */
export const MAX_ANSWER_CHARS = 2000;

/**
 * The short English translation a speaker types and then reads for the
 * English clip: "a few words". Recording turns on at MIN; the server refuses
 * anything over MAX.
 */
export const MIN_TRANSLATION_CHARS = 2;
export const MAX_TRANSLATION_CHARS = 200;

/** The typed translation as stored: NFC, single spaces, trimmed. */
export function cleanTranslation(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** True when the typed translation is long enough to record from. */
export function translationReady(text: string): boolean {
  return cleanTranslation(text).length >= MIN_TRANSLATION_CHARS;
}
