/**
 * Constants shared by the Speech Lab routes and screens. Client-safe: no
 * server imports, so the Record page can read the same numbers the API
 * enforces and the two cannot drift.
 */

/** A clip is at most 30 seconds. The recorder hard-stops here. */
export const MAX_DURATION_MS = 30_000;

/** The visible countdown starts once this much has elapsed (the last 5 s). */
export const COUNTDOWN_FROM_MS = 25_000;

/** A clip is at most 5 MB. A bucket file-size limit should say the same. */
export const MAX_BYTES = 5 * 1024 * 1024;

/** What the speaker chooses for each clip. No default: the UI preselects none. */
export const TIERS = ["open", "licensed", "community_only"] as const;
export type Tier = (typeof TIERS)[number];

export const REVIEW_STATUSES = ["keep", "bad_audio", "wrong_text"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Review verdicts that take a clip out of listening and every export. */
export const REJECTED_REVIEW_STATUSES: readonly string[] = [
  "bad_audio",
  "wrong_text",
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
