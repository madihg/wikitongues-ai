"use client";

import { useEffect, useRef, useState } from "react";
import { ConsentGate } from "./consent-gate";
import { ClipChoiceCard } from "./tier-default";
import { GoodClipGuide } from "./good-clip-guide";
import { RecordClip } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";
import {
  ENGLISH_CLIP_LABEL,
  EnglishTranslationField,
  TRANSLATION_OFF_REASON,
} from "./english-translation";
import { cleanTranslation, translationReady } from "@/lib/speech/limits";
import type { SayItClip } from "@/lib/episode-draft";

/**
 * The "Say it" step: the speech half of a prompt, inside the text episode,
 * shown to researchers, and to annotators while SPEECH_LAYER_ANNOTATORS is
 * on, right after the cold answer is locked and before the pairwise step.
 * One prompt, text then speech (Halim, 2026-11-26: "they annotate text for
 * one prompt and then record speech for that prompt"), so the answer is said
 * while it is fresh and never has to come back as a Record task. Two clips:
 * the Igala answer, and a short English translation the speaker types in a
 * few words and then says (the locked English meaning shows above the box as
 * a reminder and is never what the clip reads). Each has its own record
 * control, the same RecordClip as the Record screen.
 *
 * The step never blocks the episode: "Skip, no recording" goes straight on to
 * the pairwise step, and so does "Continue" once something is saved. An
 * answer left without a clip waits in Record, the catch-up kind of the same
 * Annotate page. The answer is already locked and cannot be edited here, so
 * a clip can never read words that later change under it, and the AI outputs
 * are still unseen, so nothing recorded here can be influenced by them. The
 * clips are created unattached (the answer row does not exist until the
 * episode is submitted); the parent attaches them after submit through
 * /api/lab/speech/attach, which also gives the new answer the translation
 * the English clip read. The parent keeps the saved clips with the episode
 * draft, so a reload comes back to this step with them (`savedClips`): a
 * language already saved shows as saved and is not asked again. A speaker
 * who has not given consent is shown the consent screen here, and may skip
 * it.
 */

export interface SayItBlockProps {
  promptCode: string;
  /** The English question. No longer read aloud: the speaker types a translation instead. */
  promptText?: string;
  igalaText: string;
  /** The locked English meaning; empty when the speaker wrote none. */
  glossText: string;
  dialect?: string | null;
  demoSessionId?: string | null;
  /** Each saved clip, so the parent can attach them after submit. */
  onClipSaved: (clip: SayItClip) => void;
  /** Continue to the pairwise step (also what Skip does). */
  onDone: () => void;
  /** Clips of this answer saved before a reload (the episode draft has them). */
  savedClips?: readonly SayItClip[];
  /**
   * Inside the Annotate flow: the microphone is on or a clip is uploading, so
   * the flow must not move this screen out of sight.
   */
  onLiveChange?: (live: boolean) => void;
}

export function SayItBlock({
  promptCode,
  igalaText,
  glossText,
  dialect,
  demoSessionId,
  onClipSaved,
  onDone,
  savedClips,
  onLiveChange,
}: SayItBlockProps) {
  const {
    consent,
    busy: consentBusy,
    error: consentError,
    accept,
    needAgain,
    clipChoice,
    choiceBusy,
    choiceError,
    saveClipChoice,
  } = useLabConsent();
  // What a reload brought back: these languages are saved already.
  const hadIgala = savedClips?.some((c) => c.language === "igala") ?? false;
  const hadEnglish = savedClips?.some((c) => c.language === "english") ?? false;
  const [saved, setSaved] = useState(savedClips?.length ?? 0);
  const [busy, setBusy] = useState({ igala: false, english: false });
  const [recording, setRecording] = useState({ igala: false, english: false });
  const [translation, setTranslation] = useState("");
  const [englishHasTake, setEnglishHasTake] = useState(false);
  const [savedEnglish, setSavedEnglish] = useState(false);

  const consentOk = consent.status === "granted";
  // Asked once, straight after consent (the same card as the Record page).
  const choiceNeeded = consentOk && clipChoice.status === "needed";
  const rememberedChoice =
    clipChoice.status === "set" ? clipChoice.choice : null;
  const offReason = !consentOk
    ? consent.status === "error"
      ? null
      : "Accept the consent below to turn recording on, or skip."
    : choiceNeeded
      ? "Choose what happens to your clips to turn recording on, or skip."
      : clipChoice.status === "loading"
        ? "Loading your clip choice..."
        : null;
  const licensedAllowed =
    consent.status === "granted" ? consent.grant.commercialLicensing : false;
  const cloningAllowed =
    consent.status === "granted" ? consent.grant.voiceCloning : false;
  const gloss = glossText.trim();
  // The English clip reads the typed translation, never the longer meaning.
  const englishText = cleanTranslation(translation);
  const englishOffReason =
    offReason ?? (translationReady(englishText) ? null : TRANSLATION_OFF_REASON);
  const anyBusy = busy.igala || busy.english;
  // Tell the Annotate flow while the microphone is on or a clip is on its
  // way; a step that goes away says it is quiet again.
  const live = anyBusy || recording.igala || recording.english;
  const onLiveRef = useRef(onLiveChange);
  useEffect(() => {
    onLiveRef.current = onLiveChange;
  });
  useEffect(() => {
    onLiveRef.current?.(live);
  }, [live]);
  useEffect(() => () => onLiveRef.current?.(false), []);

  return (
    <section
      aria-label="Say it"
      data-testid="say-it-block"
      className="mt-4 space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Say it</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Now say the answer you just wrote, while it is fresh, then a short
          English translation of it. Your answer stays locked, and you have
          not seen the AI outputs yet.
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
      {choiceNeeded && (
        <ClipChoiceCard
          name="tier-default-say-it"
          licensedAllowed={licensedAllowed}
          cloningAllowed={cloningAllowed}
          busy={choiceBusy}
          error={choiceError}
          onSave={(choice) => void saveClipChoice(choice)}
        />
      )}

      <GoodClipGuide />

      {hadIgala ? (
        <p
          data-testid="say-it-igala-saved"
          className="rounded-lg border border-success bg-success-subtle p-4 text-sm text-text-primary"
        >
          Your Igala clip is saved.
        </p>
      ) : (
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
          rememberedChoice={rememberedChoice}
          onRememberChoice={saveClipChoice}
          rememberError={choiceError}
          blocked={busy.english}
          onRecordingChange={(r) =>
            setRecording((s) => (s.igala === r ? s : { ...s, igala: r }))
          }
          onBusyChange={(b) => setBusy((s) => (s.igala === b ? s : { ...s, igala: b }))}
          onConsentRequired={needAgain}
          onSaved={(c) => {
            setSaved((n) => n + 1);
            onClipSaved({ id: c.id, language: "igala" });
          }}
        />
      )}
      {hadEnglish ? (
        <p
          data-testid="say-it-english-saved"
          className="rounded-lg border border-success bg-success-subtle p-4 text-sm text-text-primary"
        >
          Your English clip is saved.
        </p>
      ) : (
        <RecordClip
          language="english"
          promptCode={promptCode}
          textToRead={englishText}
          textLabel={ENGLISH_CLIP_LABEL}
          textIsIgala={false}
          syllableText={englishText}
          englishTranslation={englishText}
          onTakeChange={setEnglishHasTake}
          before={
            <EnglishTranslationField
              id="say-it-translation"
              meaning={gloss}
              value={translation}
              onChange={setTranslation}
              locked={englishHasTake || busy.english || savedEnglish}
            />
          }
          answer={null}
          dialect={dialect}
          demoSessionId={demoSessionId}
          consentOk={consentOk}
          offReason={englishOffReason}
          licensedAllowed={licensedAllowed}
          cloningAllowed={cloningAllowed}
          rememberedChoice={rememberedChoice}
          onRememberChoice={saveClipChoice}
          rememberError={choiceError}
          blocked={busy.igala}
          onRecordingChange={(r) =>
            setRecording((s) => (s.english === r ? s : { ...s, english: r }))
          }
          onBusyChange={(b) => setBusy((s) => (s.english === b ? s : { ...s, english: b }))}
          onConsentRequired={needAgain}
          onSaved={(c) => {
            setSaved((n) => n + 1);
            setSavedEnglish(true);
            onClipSaved({ id: c.id, language: "english" });
          }}
        />
      )}

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
          {saved > 0 ? "Continue to the AI outputs" : "Skip, no recording"}
        </button>
        <p className="text-xs text-text-tertiary">
          An answer you skip here waits for you in Record, on this same
          page.
        </p>
      </div>
    </section>
  );
}
