"use client";

import { useState } from "react";
import { ConsentGate } from "./consent-gate";
import { RecordClip } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";

/**
 * The "Say it" block: the speech layer inside the text episode, shown to
 * researchers (never annotators) right after the cold answer is locked and
 * before the pairwise step. Two optional clips: the Igala answer, and its
 * English meaning (the locked englishGloss; when that is empty, the English
 * prompt text to read instead, and the block says so). Each has its own
 * record control, the same RecordClip as the Record page.
 *
 * The block never blocks the episode: "Skip for now" goes straight on to
 * the pairwise step, and so does "Continue" once something is saved. The
 * answer is already locked and the AI outputs are still unseen, so nothing
 * recorded here can be influenced by them. The clips are created unattached
 * (the answer row does not exist until the episode is submitted); the parent
 * attaches them after submit through /api/lab/speech/attach. A researcher
 * who has not given consent is shown the consent screen here, and may skip it.
 */

export interface SayItBlockProps {
  promptCode: string;
  promptText: string;
  igalaText: string;
  /** The locked English meaning; empty when the speaker wrote none. */
  glossText: string;
  dialect?: string | null;
  demoSessionId?: string | null;
  /** Each saved clip's id, so the parent can attach them after submit. */
  onClipSaved: (id: string) => void;
  /** Continue to the pairwise step (also what Skip does). */
  onDone: () => void;
}

export function SayItBlock({
  promptCode,
  promptText,
  igalaText,
  glossText,
  dialect,
  demoSessionId,
  onClipSaved,
  onDone,
}: SayItBlockProps) {
  const { consent, busy: consentBusy, error: consentError, accept, needAgain } =
    useLabConsent();
  const [saved, setSaved] = useState(0);
  const [busy, setBusy] = useState({ igala: false, english: false });

  const consentOk = consent.status === "granted";
  const offReason = !consentOk
    ? consent.status === "error"
      ? null
      : "Accept the consent below to turn recording on, or skip."
    : null;
  const licensedAllowed =
    consent.status === "granted" ? consent.grant.commercialLicensing : false;
  const cloningAllowed =
    consent.status === "granted" ? consent.grant.voiceCloning : false;
  const gloss = glossText.trim();
  const anyBusy = busy.igala || busy.english;

  return (
    <section
      aria-label="Say it"
      data-testid="say-it-block"
      className="mt-4 space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Say it</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Optional. Record your answer out loud, and what it means in English.
          Your answer stays locked, and you have not seen the AI outputs yet.
        </p>
      </div>

      {consent.status === "needed" && (
        <ConsentGate
          doc={consent.doc}
          busy={consentBusy}
          error={consentError}
          onAccept={accept}
        />
      )}
      {consent.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {consent.message}
        </p>
      )}

      <RecordClip
        language="igala"
        promptCode={promptCode}
        textToRead={igalaText}
        textLabel="Read your answer out loud."
        textIsIgala
        syllableText={igalaText}
        answer={null}
        dialect={dialect}
        demoSessionId={demoSessionId}
        consentOk={consentOk}
        offReason={offReason}
        licensedAllowed={licensedAllowed}
        cloningAllowed={cloningAllowed}
        blocked={busy.english}
        onBusyChange={(b) => setBusy((s) => (s.igala === b ? s : { ...s, igala: b }))}
        onConsentRequired={needAgain}
        onSaved={(c) => {
          setSaved((n) => n + 1);
          onClipSaved(c.id);
        }}
      />
      <RecordClip
        language="english"
        promptCode={promptCode}
        textToRead={gloss || promptText}
        textLabel={
          gloss
            ? "Now say what it means, in English."
            : "You wrote no English meaning, so read the English question instead."
        }
        textIsIgala={false}
        syllableText={gloss || promptText}
        answer={null}
        dialect={dialect}
        demoSessionId={demoSessionId}
        consentOk={consentOk}
        offReason={offReason}
        licensedAllowed={licensedAllowed}
        cloningAllowed={cloningAllowed}
        blocked={busy.igala}
        onBusyChange={(b) => setBusy((s) => (s.english === b ? s : { ...s, english: b }))}
        onConsentRequired={needAgain}
        onSaved={(c) => {
          setSaved((n) => n + 1);
          onClipSaved(c.id);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="say-it-continue"
          disabled={anyBusy}
          onClick={onDone}
          className={`min-h-[44px] cursor-pointer rounded-md px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
            saved > 0
              ? "bg-accent text-accent-contrast hover:bg-accent-hover"
              : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
          }`}
        >
          {saved > 0 ? "Continue to the AI outputs" : "Skip for now"}
        </button>
        <p className="text-xs text-text-tertiary">
          You can also record past answers later on the Lab&apos;s Record page.
        </p>
      </div>
    </section>
  );
}
