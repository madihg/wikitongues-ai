"use client";

import { MAX_TRANSLATION_CHARS } from "@/lib/speech/limits";

/**
 * The short English translation, typed in a few words and then read aloud for
 * the English clip (story C2). The speaker's longer English meaning sits
 * above it as a reminder, read-only: it stays what it always was. The clip
 * reads the translation, never the meaning, which annotators wrote as an
 * explanation ("It means ...").
 *
 * Pure: props in, markup out. Once an answer has a translation it is shown
 * read-only here; changing it is an edit, made where answers are edited.
 */

export const TRANSLATION_LABEL = "Short English translation";
export const TRANSLATION_HELP =
  "A few words. Say what the Igala says, nothing more.";
export const TRANSLATION_OFF_REASON =
  "Type the short English translation to turn recording on.";
export const ENGLISH_CLIP_LABEL = "Now say the same thing in English.";
export const MEANING_REMINDER = "Your English meaning:";

export function EnglishTranslationField({
  id,
  meaning,
  value,
  onChange,
  saved = null,
  locked = false,
}: {
  /** Unique per page: the label points at the box. */
  id: string;
  /** The speaker's own English meaning, shown as a reminder. Empty: left out. */
  meaning: string;
  value: string;
  onChange: (v: string) => void;
  /** The translation already saved with the answer: shown, not edited. */
  saved?: string | null;
  /** A take exists or is saving: the words must stay the ones just said. */
  locked?: boolean;
}) {
  const reminder = meaning.trim();
  return (
    <div data-testid="english-translation" className="space-y-2">
      {reminder && (
        <p className="text-sm text-text-secondary">
          {MEANING_REMINDER}{" "}
          <span className="text-text-primary">&quot;{reminder}&quot;</span>
        </p>
      )}
      {saved ? (
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {TRANSLATION_LABEL}
          </p>
          <p
            data-testid="translation-saved"
            className="mt-1 text-base text-text-primary"
          >
            {saved}
          </p>
        </div>
      ) : (
        <div>
          <label
            htmlFor={id}
            className="block text-sm font-semibold text-text-primary"
          >
            {TRANSLATION_LABEL}
          </label>
          <input
            id={id}
            type="text"
            value={value}
            maxLength={MAX_TRANSLATION_CHARS}
            disabled={locked}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-text-tertiary">{TRANSLATION_HELP}</p>
        </div>
      )}
    </div>
  );
}
