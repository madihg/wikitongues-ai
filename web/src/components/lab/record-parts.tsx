"use client";

import { MAX_ANSWER_CHARS, type Tier } from "@/lib/speech/limits";
import { countdownSeconds, formatClock } from "@/lib/speech/recorder";

/**
 * The presentational pieces of the Record page. Pure: props in, markup out,
 * so the invariants (a disabled record button before consent, no tier
 * pre-selected, a save control that waits for a tier, the countdown, 44px
 * targets) can be proved by rendering them. The stateful flow that wires
 * them together is record-interface.tsx.
 */

/** The 56px round record / stop button with its label. */
export function RecordButton({
  recording,
  disabled,
  onClick,
}: {
  recording: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        data-testid="record-button"
        aria-label={recording ? "Stop recording" : "Record"}
        disabled={disabled}
        onClick={onClick}
        className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-danger text-white shadow-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {recording ? (
          <span aria-hidden="true" className="h-5 w-5 rounded-sm bg-white" />
        ) : (
          <span aria-hidden="true" className="h-5 w-5 rounded-full bg-white" />
        )}
      </button>
      <span className="text-sm font-medium text-text-primary">
        {recording ? "Stop" : "Record"}
      </span>
    </div>
  );
}

/**
 * Elapsed time with the live dot, in mono. The dot pulses only when the
 * visitor has not asked for reduced motion (motion-safe).
 */
export function Timer({
  elapsedMs,
  recording,
}: {
  elapsedMs: number;
  recording: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {recording && (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full bg-danger motion-safe:animate-pulse"
        />
      )}
      <span
        role="timer"
        aria-label="Elapsed recording time"
        className={`font-mono text-lg tabular-nums ${
          recording ? "text-danger" : "text-text-tertiary"
        }`}
      >
        {formatClock(elapsedMs)}
      </span>
    </div>
  );
}

/**
 * The countdown for the last five seconds of the 30. The live region is
 * always present (so screen readers announce changes) and empty until the
 * countdown starts.
 */
export function Countdown({ elapsedMs }: { elapsedMs: number }) {
  const seconds = countdownSeconds(elapsedMs);
  return (
    <span
      aria-live="polite"
      data-testid="countdown"
      className="font-mono text-sm font-medium text-danger"
    >
      {seconds === null ? "" : `${seconds} s left`}
    </span>
  );
}

const TIER_CARDS: { key: Tier; title: string; body: string }[] = [
  {
    key: "community_only",
    title: "Stays with my community",
    body: "Only used inside the Igala tools. Never shared.",
  },
  {
    key: "licensed",
    title: "Licensed to AI labs",
    body: "Shared under a signed contract. You are paid a share. You can withdraw later.",
  },
  {
    key: "open",
    title: "Open to everyone",
    body: "Published under CC-BY 4.0. Permanent once published.",
  },
];

/**
 * The three tier radio cards. `value` is null until the speaker picks:
 * nothing is pre-selected, ever. A card the speaker's consent answers do not
 * allow (licensing) is disabled and says why.
 */
export function TierChoice({
  value,
  onChange,
  licensedAllowed,
  disabled = false,
  name = "tier",
}: {
  value: Tier | null;
  onChange: (tier: Tier) => void;
  licensedAllowed: boolean;
  disabled?: boolean;
  /** Radio group name: unique per clip when two choices share a page. */
  name?: string;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-text-primary">
        What happens to this clip? (choose one)
      </legend>
      <div className="mt-2 space-y-2">
        {TIER_CARDS.map((card) => {
          const blocked = card.key === "licensed" && !licensedAllowed;
          const checked = value === card.key;
          return (
            <label
              key={card.key}
              className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                checked
                  ? "border-accent bg-accent-subtle"
                  : "border-border bg-surface hover:bg-surface-sunken"
              } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={card.key}
                checked={checked}
                disabled={blocked}
                onChange={() => onChange(card.key)}
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span>
                <span className="block text-base font-medium text-text-primary">
                  {card.title}
                </span>
                <span className="block text-sm text-text-secondary">
                  {card.body}
                </span>
                {blocked && (
                  <span className="block text-xs text-text-tertiary">
                    Your consent answers do not allow licensing.
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The separate, unchecked-by-default voice cloning opt-in. */
export function VoiceCloningOptIn({
  checked,
  allowed,
  onChange,
}: {
  checked: boolean;
  allowed: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md px-1 py-2 text-base text-text-secondary ${
        allowed ? "" : "cursor-not-allowed opacity-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!allowed}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
      />
      <span>
        Also allow a synthetic copy of my voice to be made from this clip.
        {!allowed && (
          <span className="block text-xs text-text-tertiary">
            Your consent answers do not allow voice cloning.
          </span>
        )}
      </span>
    </label>
  );
}

/** Save: disabled until a tier is chosen (and while a save is running). */
export function SaveBar({
  tier,
  busy,
  onSave,
}: {
  tier: Tier | null;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="save-button"
      disabled={tier === null || busy}
      onClick={onSave}
      className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Saving..." : "Save"}
    </button>
  );
}

/** Upload progress. Replaces the buttons while a clip is going up. */
export function UploadProgress({ pct }: { pct: number }) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-accent" style={{ width: `${value}%` }} />
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-text-tertiary">
        Uploading... {value}%
      </p>
    </div>
  );
}

/** The textarea for writing the answer first, when the prompt has none of yours. */
export function AnswerBox({
  value,
  onChange,
  onLock,
}: {
  value: string;
  onChange: (v: string) => void;
  onLock: () => void;
}) {
  return (
    <div>
      <label
        htmlFor="lab-answer"
        className="block text-sm font-semibold text-text-primary"
      >
        Write your answer first
      </label>
      <p className="mt-1 text-xs text-text-tertiary">
        You will read this out loud. Once locked, it cannot be changed.
      </p>
      <textarea
        id="lab-answer"
        value={value}
        maxLength={MAX_ANSWER_CHARS}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="igala mt-2 min-h-[44px] w-full rounded-md border border-border-strong bg-surface p-3 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      />
      <button
        type="button"
        disabled={value.trim().length === 0}
        onClick={onLock}
        className="mt-2 min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
      >
        Lock answer
      </button>
    </div>
  );
}
