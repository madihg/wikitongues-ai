"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConsentGate } from "./consent-gate";
import { ClipChoiceCard } from "./tier-default";
import { AnswerBox } from "./record-parts";
import { RecordClip, type ClipAnswerRef } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";
import {
  ENGLISH_CLIP_LABEL,
  EnglishTranslationField,
  TRANSLATION_OFF_REASON,
} from "./english-translation";
import { cleanTranslation, translationReady } from "@/lib/speech/limits";

/**
 * The Record page, the catch-up place for past answers. One column, mobile
 * first:
 *   1. the prompt, then the researcher's own answer (or a box to write and
 *      lock one first);
 *   2. two clips of that answer, each a RecordClip: the Igala answer, then a
 *      short English translation the speaker types in a few words and then
 *      says. The longer English meaning shows above the box as a reminder
 *      and is never what the clip reads. Both clips are needed to finish a
 *      prompt here: "Next prompt" shows once both are saved, and "Skip this
 *      prompt" stays. A prompt whose Igala clip is already saved comes back
 *      with that part shown as done.
 * Recording is disabled until the consent for the current text version is on
 * record. Everything inside a clip (feedback, Keep, tier, save) is
 * record-clip.tsx; the Episode's "Say it" block uses the same component.
 */

interface QueueTask {
  prompt: { id: string; promptId: string; text: string; bucket: string };
  ownAnswer: {
    id: string;
    text: string;
    englishGloss?: string | null;
    /** The short English translation, once typed and saved. */
    englishTranslation?: string | null;
    dialect: string | null;
  } | null;
  source: "own_answer" | "no_answer";
  /** The Igala clip is already saved: only the English clip is missing. */
  igalaDone?: boolean;
}

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "complete" }
  | { status: "task"; task: QueueTask };

const NEXT_BUTTON =
  "min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export function RecordInterface() {
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

  const [queue, setQueue] = useState<QueueState>({ status: "loading" });
  const [recorded, setRecorded] = useState(0);
  const excludeRef = useRef<string[]>([]);
  const demoRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const [lockedText, setLockedText] = useState<string | null>(null);
  // The answer row the first clip created (when the answer was written here),
  // so the second clip attaches to it instead of making another.
  const [createdAnswerId, setCreatedAnswerId] = useState<string | null>(null);
  const [savedIgala, setSavedIgala] = useState(false);
  const [savedEnglish, setSavedEnglish] = useState(false);
  // The short English translation as typed, and whether the English clip is
  // holding a take (the words must not change under a take).
  const [translation, setTranslation] = useState("");
  const [englishHasTake, setEnglishHasTake] = useState(false);
  const [busy, setBusy] = useState({ igala: false, english: false });
  // Bumped to remount the clips for the next prompt.
  const [round, setRound] = useState(0);

  const loadNext = useCallback(async () => {
    setQueue({ status: "loading" });
    const qs = new URLSearchParams();
    if (demoRef.current) qs.set("demo", demoRef.current);
    if (excludeRef.current.length)
      qs.set("exclude", excludeRef.current.join(","));
    try {
      const res = await fetch(`/api/lab/speech/next?${qs.toString()}`);
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        complete: boolean;
        progress?: { recorded: number };
        task?: QueueTask;
      } | null;
      if (!res.ok || !j) {
        throw new Error(j?.error ?? "Could not load a prompt.");
      }
      setRecorded(j.progress?.recorded ?? 0);
      setQueue(
        j.complete || !j.task
          ? { status: "complete" }
          : { status: "task", task: j.task },
      );
    } catch (e) {
      setQueue({
        status: "error",
        message: e instanceof Error ? e.message : "Could not load a prompt.",
      });
    }
  }, []);

  useEffect(() => {
    demoRef.current = new URLSearchParams(window.location.search).get("demo");
    void loadNext();
  }, [loadNext]);

  const task = queue.status === "task" ? queue.task : null;
  const answerText = task?.ownAnswer?.text ?? lockedText;
  const answerReady = answerText !== null;
  const consentOk = consent.status === "granted";
  const licensedAllowed =
    consent.status === "granted" ? consent.grant.commercialLicensing : false;
  const cloningAllowed =
    consent.status === "granted" ? consent.grant.voiceCloning : false;

  // The clip choice is asked once, straight after consent. Until it is made
  // nothing can be recorded, so nothing can be saved without it. If the
  // server could not say ("unavailable"), each clip asks, as it always did.
  const choiceNeeded = consentOk && clipChoice.status === "needed";
  const rememberedChoice =
    clipChoice.status === "set" ? clipChoice.choice : null;

  const offReason = !consentOk
    ? consent.status === "error"
      ? null
      : "Read and accept the consent above to turn recording on."
    : choiceNeeded
      ? "Choose what happens to your clips above to turn recording on."
      : clipChoice.status === "loading"
        ? "Loading your clip choice..."
        : task && !answerReady
          ? "Lock your answer to turn recording on."
          : null;

  const answerRef: ClipAnswerRef | null = task?.ownAnswer
    ? { coldAuthorAnswerId: task.ownAnswer.id }
    : createdAnswerId
      ? { coldAuthorAnswerId: createdAnswerId }
      : lockedText !== null
        ? { answerText: lockedText }
        : null;

  const gloss = task?.ownAnswer?.englishGloss?.trim() ?? "";
  // The words the English clip reads: the translation already saved with the
  // answer, or the one being typed. Never the longer meaning.
  const savedTranslation = task?.ownAnswer?.englishTranslation?.trim() ?? "";
  const englishText = savedTranslation || cleanTranslation(translation);
  const englishOffReason =
    offReason ?? (translationReady(englishText) ? null : TRANSLATION_OFF_REASON);
  // The Igala part is done when it was saved before (the prompt came back for
  // its English clip) or just now.
  const igalaDone = task?.igalaDone === true || savedIgala;
  const promptDone = igalaDone && savedEnglish;
  const nextPrompt = () => {
    setDraft("");
    setLockedText(null);
    setCreatedAnswerId(null);
    setSavedIgala(false);
    setSavedEnglish(false);
    setTranslation("");
    setEnglishHasTake(false);
    setBusy({ igala: false, english: false });
    setRound((r) => r + 1);
    void loadNext();
  };
  const skip = () => {
    if (task) excludeRef.current.push(task.prompt.promptId);
    nextPrompt();
  };

  const anyBusy = busy.igala || busy.english;

  return (
    <div className="space-y-6">
      {demoRef.current && (
        <p className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-text-primary">
          Demo session: clips recorded here are not counted.
        </p>
      )}

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
          licensedAllowed={licensedAllowed}
          cloningAllowed={cloningAllowed}
          busy={choiceBusy}
          error={choiceError}
          onSave={(choice) => void saveClipChoice(choice)}
        />
      )}

      {queue.status === "loading" && (
        <p className="text-sm text-text-tertiary">Loading a prompt...</p>
      )}
      {queue.status === "error" && (
        <div>
          <p role="alert" className="text-sm text-danger">
            {queue.message}
          </p>
          <button
            type="button"
            onClick={() => void loadNext()}
            className="mt-2 min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
          >
            Try again
          </button>
        </div>
      )}
      {queue.status === "complete" && (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
          Nothing left to record right now. You have recorded {recorded}.
        </p>
      )}

      {task && (
        <section
          aria-label="Prompt"
          className="rounded-lg border border-border bg-surface p-4 sm:p-6"
        >
          <p className="font-mono text-xs text-text-tertiary">
            {task.prompt.promptId}
          </p>
          <p className="mt-1 text-base text-text-primary">{task.prompt.text}</p>

          <div className="mt-4 border-t border-border pt-4">
            {task.ownAnswer ? (
              <>
                <p className="text-sm font-semibold text-text-primary">
                  Your answer
                </p>
                <p className="igala mt-1 text-base text-text-primary">
                  {task.ownAnswer.text}
                </p>
              </>
            ) : lockedText !== null ? (
              <>
                <p className="text-sm font-semibold text-text-primary">
                  Your answer (locked)
                </p>
                <p className="igala mt-1 text-base text-text-primary">
                  {lockedText}
                </p>
              </>
            ) : (
              <AnswerBox
                value={draft}
                onChange={setDraft}
                onLock={() => setLockedText(draft.trim())}
              />
            )}
          </div>
        </section>
      )}

      {task && (
        <div key={`${task.prompt.promptId}-${round}`} className="space-y-4">
          {task.igalaDone ? (
            <p
              data-testid="igala-done"
              className="rounded-lg border border-success bg-success-subtle p-4 text-sm text-text-primary"
            >
              Your Igala clip is saved. One more: the English.
            </p>
          ) : (
            <RecordClip
              language="igala"
              promptCode={task.prompt.promptId}
              textToRead={answerText ?? "Your answer appears here once it is locked."}
              textLabel="Read your answer out loud."
              textIsIgala
              syllableText={answerText ?? ""}
              answer={answerRef}
              dialect={task.ownAnswer?.dialect}
              demoSessionId={demoRef.current}
              consentOk={consentOk}
              offReason={offReason}
              licensedAllowed={licensedAllowed}
              cloningAllowed={cloningAllowed}
              rememberedChoice={rememberedChoice}
              onRememberChoice={saveClipChoice}
              rememberError={choiceError}
              blocked={busy.english}
              onBusyChange={(b) => setBusy((s) => (s.igala === b ? s : { ...s, igala: b }))}
              onConsentRequired={needAgain}
              onSaved={(c) => {
                setSavedIgala(true);
                if (c.coldAuthorAnswerId) setCreatedAnswerId(c.coldAuthorAnswerId);
              }}
            />
          )}
          <RecordClip
            language="english"
            promptCode={task.prompt.promptId}
            textToRead={englishText}
            textLabel={ENGLISH_CLIP_LABEL}
            textIsIgala={false}
            syllableText={englishText}
            englishTranslation={englishText}
            onTakeChange={setEnglishHasTake}
            before={
              <EnglishTranslationField
                id="record-translation"
                meaning={gloss}
                value={translation}
                onChange={setTranslation}
                saved={savedTranslation || null}
                locked={englishHasTake || busy.english || savedEnglish}
              />
            }
            answer={answerRef}
            dialect={task.ownAnswer?.dialect}
            demoSessionId={demoRef.current}
            consentOk={consentOk}
            offReason={englishOffReason}
            licensedAllowed={licensedAllowed}
            cloningAllowed={cloningAllowed}
            rememberedChoice={rememberedChoice}
            onRememberChoice={saveClipChoice}
            rememberError={choiceError}
            blocked={busy.igala}
            onBusyChange={(b) => setBusy((s) => (s.english === b ? s : { ...s, english: b }))}
            onConsentRequired={needAgain}
            onSaved={(c) => {
              setSavedEnglish(true);
              if (c.coldAuthorAnswerId) setCreatedAnswerId(c.coldAuthorAnswerId);
            }}
          />
          {promptDone && !anyBusy && (
            <button type="button" onClick={nextPrompt} className={NEXT_BUTTON}>
              Next prompt
            </button>
          )}
        </div>
      )}

      {task && !promptDone && !anyBusy && (
        <button
          type="button"
          onClick={skip}
          className="inline-flex min-h-[44px] cursor-pointer items-center text-sm text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        >
          Skip this prompt
        </button>
      )}
    </div>
  );
}
