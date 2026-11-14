"use client";

import { useState } from "react";
import { TIER_TITLE, type ClipChoice } from "@/lib/speech/clip-choice";
import type { Tier } from "@/lib/speech/limits";
import {
  TIER_LEGEND_CLIPS,
  TierChoice,
  VoiceCloningOptIn,
} from "./record-parts";
import { useLabConsent } from "./use-lab-consent";

/**
 * The clip choice, asked once (story C1). Three pieces, all built from the
 * same three cards the speaker already knows (TierChoice):
 *
 *   ClipChoiceCard    the card shown once, straight after consent: "What
 *                     happens to your clips?". Nothing is preselected and
 *                     "Save my choice" is off until one card is picked.
 *   ClipChoiceLine    the quiet line on each clip: "This clip: Stays with my
 *                     community. Change".
 *   ClipChoiceChange  what Change opens: the same cards with two buttons,
 *                     "Only this clip" and "All my clips from now on".
 *   YourClips         the Profile block that shows the choice and Change.
 *
 * The platform never chooses: every tier on a clip is one the speaker picked,
 * here or on the clip itself.
 */

const PRIMARY =
  "min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON =
  "min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
const LINK =
  "inline-flex min-h-[44px] cursor-pointer items-center px-1 text-sm font-medium text-accent-text underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export const CLIP_CHOICE_NOTE =
  "We will use this for every clip you save. You can change it at any time, for one clip or for all of them.";

/** The card asked once after consent, and again from Profile's Change. */
export function ClipChoiceCard({
  licensedAllowed,
  cloningAllowed,
  busy,
  error,
  onSave,
  initial = null,
  onCancel,
  name = "tier-default",
}: {
  licensedAllowed: boolean;
  cloningAllowed: boolean;
  busy: boolean;
  error: string | null;
  onSave: (choice: ClipChoice) => void;
  /** The speaker's own current choice, when they are changing it. */
  initial?: ClipChoice | null;
  /** Present only when there is a choice to go back to. */
  onCancel?: () => void;
  name?: string;
}) {
  // Null until the speaker picks: nothing is chosen for them. When they are
  // changing an earlier choice, the cards start on that choice (their own).
  const [tier, setTier] = useState<Tier | null>(initial?.tier ?? null);
  const [voiceCloning, setVoiceCloning] = useState(
    initial?.voiceCloning ?? false,
  );
  return (
    <section
      aria-label="What happens to your clips"
      data-testid="clip-choice-card"
      className="rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <TierChoice
        name={name}
        legend={TIER_LEGEND_CLIPS}
        value={tier}
        onChange={setTier}
        licensedAllowed={licensedAllowed}
        disabled={busy}
      />
      <div className="mt-3">
        <VoiceCloningOptIn
          scope="clips"
          checked={voiceCloning && cloningAllowed}
          allowed={cloningAllowed}
          onChange={setVoiceCloning}
        />
      </div>
      <p className="mt-3 text-sm text-text-secondary">{CLIP_CHOICE_NOTE}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="save-choice-button"
          disabled={tier === null || busy}
          onClick={() => {
            if (tier !== null) {
              onSave({ tier, voiceCloning: voiceCloning && cloningAllowed });
            }
          }}
          className={PRIMARY}
        >
          {busy ? "Saving..." : "Save my choice"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

/** "This clip: Stays with my community. Change", above Save. */
export function ClipChoiceLine({
  choice,
  onChange,
  subject = "This clip",
}: {
  choice: ClipChoice;
  onChange: () => void;
  /** "This clip" on a clip; "Your clips" on the Profile page. */
  subject?: string;
}) {
  return (
    <p
      data-testid="clip-choice-line"
      className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary"
    >
      <span>
        {subject}:{" "}
        <span className="font-medium text-text-primary">
          {TIER_TITLE[choice.tier]}
        </span>
        .{choice.voiceCloning ? " A synthetic copy of my voice may be made." : ""}
      </span>
      <button
        type="button"
        data-testid="clip-choice-change"
        onClick={onChange}
        className={LINK}
      >
        Change
      </button>
    </p>
  );
}

/**
 * What Change opens on a clip: the same three cards, starting on the choice
 * the clip has now, with "Only this clip" and "All my clips from now on".
 * Neither button works until a card is picked.
 */
export function ClipChoiceChange({
  name,
  current,
  licensedAllowed,
  cloningAllowed,
  busy,
  error,
  onOnlyThis,
  onAll,
  onCancel,
}: {
  /** Radio group name: unique per clip when two clips share a page. */
  name: string;
  current: ClipChoice | null;
  licensedAllowed: boolean;
  cloningAllowed: boolean;
  busy: boolean;
  error: string | null;
  onOnlyThis: (choice: ClipChoice) => void;
  /** Absent where the choice cannot be remembered: only "Only this clip" shows. */
  onAll?: (choice: ClipChoice) => void;
  onCancel: () => void;
}) {
  const [tier, setTier] = useState<Tier | null>(current?.tier ?? null);
  const [voiceCloning, setVoiceCloning] = useState(
    current?.voiceCloning ?? false,
  );
  const picked: ClipChoice | null =
    tier === null
      ? null
      : { tier, voiceCloning: voiceCloning && cloningAllowed };
  return (
    <div data-testid="clip-choice-change-panel" className="space-y-3">
      <TierChoice
        name={name}
        value={tier}
        onChange={setTier}
        licensedAllowed={licensedAllowed}
        disabled={busy}
      />
      <VoiceCloningOptIn
        checked={voiceCloning && cloningAllowed}
        allowed={cloningAllowed}
        onChange={setVoiceCloning}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="choice-only-this"
          disabled={picked === null || busy}
          onClick={() => picked && onOnlyThis(picked)}
          className={PRIMARY}
        >
          Only this clip
        </button>
        {onAll && (
          <button
            type="button"
            data-testid="choice-all"
            disabled={picked === null || busy}
            onClick={() => picked && onAll(picked)}
            className={BUTTON}
          >
            {busy ? "Saving..." : "All my clips from now on"}
          </button>
        )}
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The pure view of the Profile block "Your clips". */
export function YourClipsView({
  state,
  licensedAllowed,
  cloningAllowed,
  busy,
  error,
  changing,
  onChange,
  onCancel,
  onSave,
}: {
  state:
    | { status: "loading" }
    | { status: "no_consent" }
    | { status: "needed" }
    | { status: "set"; choice: ClipChoice };
  licensedAllowed: boolean;
  cloningAllowed: boolean;
  busy: boolean;
  error: string | null;
  changing: boolean;
  onChange: () => void;
  onCancel: () => void;
  onSave: (choice: ClipChoice) => void;
}) {
  return (
    <section
      aria-labelledby="your-clips-title"
      data-testid="your-clips"
      className="mt-8 border-t border-border pt-6"
    >
      <h2
        id="your-clips-title"
        className="text-lg font-semibold text-text-primary"
      >
        Your clips
      </h2>
      <div className="mt-3">
        {state.status === "loading" && (
          <p className="text-sm text-text-tertiary">Loading...</p>
        )}
        {state.status === "no_consent" && (
          <p className="text-sm text-text-secondary">
            You choose what happens to your clips when you first record, on
            the Record page.
          </p>
        )}
        {state.status === "set" && !changing && (
          <ClipChoiceLine
            subject="Your clips"
            choice={state.choice}
            onChange={onChange}
          />
        )}
        {(state.status === "needed" || (state.status === "set" && changing)) && (
          <ClipChoiceCard
            name="tier-profile"
            licensedAllowed={licensedAllowed}
            cloningAllowed={cloningAllowed}
            busy={busy}
            error={error}
            initial={state.status === "set" ? state.choice : null}
            onCancel={state.status === "set" ? onCancel : undefined}
            onSave={onSave}
          />
        )}
      </div>
    </section>
  );
}

/** "Your clips" on the Profile page: the current choice and the same Change. */
export function YourClips() {
  const { consent, clipChoice, choiceBusy, choiceError, saveClipChoice } =
    useLabConsent();
  const [changing, setChanging] = useState(false);

  // The choice could not be loaded: say nothing rather than something wrong.
  if (clipChoice.status === "unavailable" || consent.status === "error") {
    return null;
  }
  const state =
    consent.status === "loading" || clipChoice.status === "loading"
      ? ({ status: "loading" } as const)
      : consent.status === "needed"
        ? ({ status: "no_consent" } as const)
        : clipChoice;
  const grant = consent.status === "granted" ? consent.grant : null;

  return (
    <YourClipsView
      state={state}
      licensedAllowed={grant?.commercialLicensing ?? false}
      cloningAllowed={grant?.voiceCloning ?? false}
      busy={choiceBusy}
      error={choiceError}
      changing={changing}
      onChange={() => setChanging(true)}
      onCancel={() => setChanging(false)}
      onSave={(choice) => {
        void saveClipChoice(choice).then((ok) => {
          if (ok) setChanging(false);
        });
      }}
    />
  );
}
