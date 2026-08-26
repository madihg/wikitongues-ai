/**
 * FAILURE TAGS - cheap, structured diagnostics for WHY a model output is wrong.
 *
 * Why this exists: 690 of the first 694 blind comparisons ended "both
 * inadequate", so the rubric - which only scores a WINNING output - almost never
 * fires (9 rubric rows total). We were collecting the fact that models fail and
 * almost nothing about HOW. The linguistics lead asked for the full 8-axis
 * rubric on every output; that roughly triples episode time against a 105-hour
 * annotator budget. Failure tags are the cheap alternative: a few taps per
 * output, aggregatable across thousands of episodes.
 *
 * Tags are ADDITIVE to the required written English explanation on the
 * both-inadequate path, never a replacement for it. Chips tell us the shape of
 * the failure; the sentence tells us the fix.
 *
 * This list is CONFIG, not schema (the columns are plain Postgres text arrays),
 * so a tag can be renamed, added, or dropped with a one-line edit and no
 * migration. Labels are written for non-linguists.
 */

export interface FailureTagDef {
  key: string;
  /** Plain-English chip label. No jargon - annotators are speakers, not NLP people. */
  label: string;
  /** One-line hover explanation. */
  hint: string;
}

export const FAILURE_TAGS: FailureTagDef[] = [
  {
    key: "not_igala",
    label: "Not Igala at all",
    hint: "This is not Igala at all - gibberish, or another language entirely.",
  },
  {
    key: "wrong_language",
    label: "It is Yoruba, Igbo, or Pidgin",
    hint: "Recognisably another Nigerian language rather than Igala.",
  },
  {
    key: "wrong_word",
    label: "Wrong word or meaning",
    hint: "Real Igala words, but the wrong one for what was asked.",
  },
  {
    key: "tone_marks",
    label: "Tone marks or spelling wrong",
    hint: "Missing or misplaced tone marks, or dotted vowels written as plain ones.",
  },
  {
    key: "invented",
    label: "Made-up word that does not exist",
    hint: "A word that looks Igala but no Igala speaker uses.",
  },
  {
    key: "grammar",
    label: "Grammar or word order wrong",
    hint: "The words may be right but the sentence is put together wrongly.",
  },
  {
    key: "cultural",
    label: "Culturally wrong or inappropriate",
    hint: "Does not match how Igala people actually do or say this.",
  },
  {
    key: "english_mixed",
    label: "Mixed English into the answer",
    hint: "English words or phrases left inside what should be Igala.",
  },
];

export const FAILURE_TAG_KEYS: string[] = FAILURE_TAGS.map((t) => t.key);

const TAG_BY_KEY: Record<string, FailureTagDef> = Object.fromEntries(
  FAILURE_TAGS.map((t) => [t.key, t]),
);

/** Encouragement copy shown above the chips. Kept here so it stays consistent. */
export const FAILURE_TAG_PROMPT =
  "Which of these are wrong? Tap all that apply - this is how we learn what the AI gets wrong.";

export function isFailureTag(value: unknown): boolean {
  return typeof value === "string" && FAILURE_TAG_KEYS.includes(value);
}

export function failureTagLabel(key: string): string {
  return TAG_BY_KEY[key]?.label ?? key;
}

/**
 * Coerce arbitrary client input into a storable tag array: drops non-strings,
 * drops unknown keys, de-duplicates, and preserves config order so aggregation
 * reads consistently. Never throws - a malformed `failureTags` payload must
 * degrade to "no tags", not 500 an annotator's whole episode.
 */
export function sanitizeFailureTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (isFailureTag(v)) seen.add(v as string);
  }
  return FAILURE_TAG_KEYS.filter((k) => seen.has(k));
}

/** Quick-pick reasons for edit segments (the editing ground): the failure
 *  taxonomy the team already knows from pairwise chips, plus edit-only
 *  entries. `unsure` is where per-verdict confidence went when the dead 1-4
 *  widget was removed - uncertainty attached to a SPAN ("please check this
 *  change") is actionable review signal; a global 1-4 never was. CONFIG, not
 *  schema. */
export const EDIT_REASON_TAGS: FailureTagDef[] = [
  ...FAILURE_TAGS, // same 8 keys/labels - one vocabulary across the platform
  {
    key: "unsure",
    label: "Not sure - please check",
    hint: "Flag this change for a linguist or the team to confirm.",
  },
  {
    key: "other",
    label: "Other reason",
    hint: "Use the text box to say what it is.",
  },
];

export const EDIT_REASON_TAG_KEYS: string[] = EDIT_REASON_TAGS.map(
  (t) => t.key,
);

const EDIT_TAG_BY_KEY: Record<string, FailureTagDef> = Object.fromEntries(
  EDIT_REASON_TAGS.map((t) => [t.key, t]),
);

export function editReasonTagLabel(key: string): string {
  return EDIT_TAG_BY_KEY[key]?.label ?? key;
}

/**
 * Mirrors sanitizeFailureTags for the edit-reason vocabulary: drops
 * non-strings and unknown keys, de-duplicates, preserves config order, never
 * throws - malformed reasonTags degrade to "no tags", they can never cost an
 * annotator their correction.
 */
export function sanitizeEditReasonTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v === "string" && EDIT_REASON_TAG_KEYS.includes(v)) seen.add(v);
  }
  return EDIT_REASON_TAG_KEYS.filter((k) => seen.has(k));
}

/**
 * Which output sides should be offered failure tags, given the pairwise pick.
 *
 *  - "both_inadequate" - both sides (the headline case: nothing to score, so the
 *    tags are the only structured signal the episode produces).
 *  - "a" / "b"         - the LOSING side only. The winner already gets the
 *    rubric; asking what is wrong with the one they rejected is the cheap
 *    diagnostic we are otherwise missing entirely.
 *  - "tie"             - neither. Both were judged adequate; there is no failure
 *    to describe, and offering chips would just add noise.
 *  - unset             - neither (nothing has been judged yet).
 */
export function failureTagSides(winner: string | null | undefined): {
  a: boolean;
  b: boolean;
} {
  if (winner === "both_inadequate") return { a: true, b: true };
  if (winner === "a") return { a: false, b: true };
  if (winner === "b") return { a: true, b: false };
  return { a: false, b: false };
}
