"use client";

import { useOnEmpty } from "@/components/work/use-on-empty";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerEditorDrawer } from "@/components/answer-editor";
import { ConsentGate } from "./consent-gate";
import { ClipChoiceCard } from "./tier-default";
import { GoodClipGuide } from "./good-clip-guide";
import { RoomCheck } from "./room-check";
import { AnswerBox } from "./record-parts";
import {
  EpisodeFooter,
  EpisodeHeader,
  FRAME_MAIN,
  FRAME_QUIET,
} from "@/components/episode-frame";
import { RecordClip, type ClipAnswerRef } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";
import {
  ENGLISH_CLIP_LABEL,
  EnglishTranslationField,
  TRANSLATION_OFF_REASON,
} from "./english-translation";
import { cleanTranslation, translationReady } from "@/lib/speech/limits";

/**
 * The Record page, the catch-up place for past answers, one step at a time
 * like Annotate (decided on the 2026-11-24 call: "sequential like the text
 * part"). The shared episode frame holds it: the header with what is left,
 * a numbered step bar, the prompt, and the footer (Back, Skip this prompt,
 * the main button). Three steps per prompt:
 *   1. Your answer: read it once; fix a word or a tone mark with Edit
 *      answer, or write and lock one when there is none yet.
 *   2. Say it in Igala: one RecordClip (record, listen back, Keep or
 *      Re-record, then save with the clip choice).
 *   3. Say it in English: a short translation the speaker types in a few
 *      words, then says. The longer English meaning shows above the box as a
 *      reminder and is never what the clip reads.
 * The main button moves on only once the step is done (the answer locked,
 * the clip saved); "Next prompt" shows once both clips are saved. A prompt
 * whose Igala clip is already saved comes back on step 3. Steps 2 and 3 stay
 * mounted while hidden, so stepping back never drops a take, and Back is off
 * while a clip is uploading.
 * Recording is disabled until the consent for the current text version is on
 * record. Everything inside a clip (feedback, Keep, tier, save) is
 * record-clip.tsx; the Episode's "Say it" block uses the same component.
 * Inside the one Annotate flow this is the Record tab (work-flow.tsx).
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
  /**
   * The English sentence a speech-set prompt gives (prompt bank v4.6). The
   * translation box starts filled with it; the speaker can change it.
   */
  suggestedTranslation?: string | null;
}

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "complete" }
  | { status: "task"; task: QueueTask };

export function RecordInterface({ onEmpty }: { onEmpty?: () => void } = {}) {
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
  // Inside the one Annotate flow: say when there is nothing left to record.
  useOnEmpty(queue.status === "complete", onEmpty);
  const [recorded, setRecorded] = useState(0);
  const excludeRef = useRef<string[]>([]);
  const demoRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const [editingAnswer, setEditingAnswer] = useState(false);
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
  // The step on screen; null means the prompt's first step.
  const [step, setStep] = useState<RecordStep | null>(null);
  // How many of the speaker's own answers still wait for a clip.
  const [waitingCount, setWaitingCount] = useState<number | null>(null);

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
        progress?: { recorded: number; waiting?: number };
        task?: QueueTask;
      } | null;
      if (!res.ok || !j) {
        throw new Error(j?.error ?? "Could not load a prompt.");
      }
      setRecorded(j.progress?.recorded ?? 0);
      setWaitingCount(
        typeof j.progress?.waiting === "number" && j.progress.waiting > 0
          ? j.progress.waiting
          : null,
      );
      // A speech-set prompt gives its English sentence: start the box on it.
      setTranslation(j.task?.suggestedTranslation ?? "");
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
    setStep(null);
    void loadNext();
  };
  const skip = () => {
    if (task) excludeRef.current.push(task.prompt.promptId);
    nextPrompt();
  };

  const anyBusy = busy.igala || busy.english;

  // The step on screen. A prompt that comes back for its English clip opens
  // on the English step: its Igala clip is saved already.
  const firstStep: RecordStep = task?.igalaDone ? "english" : "answer";
  const current: RecordStep = step ?? firstStep;
  const stageIndex = RECORD_STAGES.findIndex((s) => s.key === current);
  // Back goes one step back, never onto a part that is already saved before
  // this visit (the Igala step of a prompt that came back for English).
  const backTo: RecordStep | null =
    current === "english"
      ? task?.igalaDone
        ? "answer"
        : "igala"
      : current === "igala"
        ? "answer"
        : null;

  const main =
    current === "answer"
      ? {
          label: igalaDone ? "Next: the English" : "Next: record it",
          disabled: !answerReady,
          onClick: () => setStep(igalaDone ? "english" : "igala"),
        }
      : current === "igala"
        ? {
            label: "Next: the English",
            disabled: !savedIgala || anyBusy,
            onClick: () => setStep("english"),
          }
        : {
            label: "Next prompt",
            disabled: !promptDone || anyBusy,
            onClick: nextPrompt,
          };

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
        <div data-testid="record-episode">
          <EpisodeHeader left={waitingCount} />
          <RecordSteps active={stageIndex} />

          <section
            aria-label="Prompt"
            className="rounded-lg border border-border bg-surface p-4 sm:p-6"
          >
            <p className="font-mono text-xs text-text-tertiary">
              {task.prompt.promptId}
            </p>
            <p className="mt-1 text-base text-text-primary">{task.prompt.text}</p>

            {/* Step 1: the answer, read before it is said. Fixed here (spelling,
                tone marks) or written and locked here. */}
            <div hidden={current !== "answer"} className="mt-4 border-t border-border pt-4">
              {task.ownAnswer ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text-primary">
                      Your answer
                    </p>
                    {/* Fix a spelling, a tone mark or a wrong sentence here,
                        before reading it aloud, instead of hunting for it in
                        My Work. Not in demo: the editor changes the real
                        answer. */}
                    {!demoRef.current && !igalaDone && (
                      <button
                        type="button"
                        onClick={() => setEditingAnswer(true)}
                        className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
                      >
                        Edit answer
                      </button>
                    )}
                  </div>
                  <p lang="ig" className="igala mt-1 text-base text-text-primary">
                    {task.ownAnswer.text}
                  </p>
                  {!igalaDone && (
                    <p className="mt-2 text-xs text-text-tertiary">
                      Read it once. If a word or a tone mark is wrong, fix it
                      with Edit answer before you record.
                    </p>
                  )}
                  {editingAnswer && (
                    <AnswerEditorDrawer
                      target={{ type: "cold", id: task.ownAnswer.id }}
                      onClose={() => setEditingAnswer(false)}
                      onSaved={() => {
                        // Read the corrected text back from the server, so the
                        // clip is recorded against what was actually saved.
                        setEditingAnswer(false);
                        void loadNext();
                      }}
                    />
                  )}
                </>
              ) : lockedText !== null ? (
                <>
                  <p className="text-sm font-semibold text-text-primary">
                    Your answer (locked)
                  </p>
                  <p lang="ig" className="igala mt-1 text-base text-text-primary">
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

          {/* Steps 2 and 3 stay mounted while hidden, so a take is never lost
              by stepping back to read the answer again. */}
          <div key={`${task.prompt.promptId}-${round}`} className="mt-4 space-y-4">
            <div hidden={current !== "igala"} className="space-y-4">
              {/* Level and room help, once recording is possible: the guide
                  one tap away, and the room check before the first clip.
                  Neither blocks. */}
              {consentOk && !choiceNeeded && (
                <div className="space-y-3">
                  <GoodClipGuide />
                  <RoomCheck />
                </div>
              )}
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
            </div>

            <div hidden={current !== "english"} className="space-y-4">
              {igalaDone && (
                <p
                  data-testid="igala-saved-line"
                  className="text-sm text-text-secondary"
                >
                  Igala clip saved. Now the English: type a short translation,
                  then say it.
                </p>
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
            </div>
          </div>

          <EpisodeFooter
            left={
              backTo ? (
                <button
                  type="button"
                  onClick={() => setStep(backTo)}
                  disabled={anyBusy}
                  className={FRAME_QUIET}
                >
                  Back
                </button>
              ) : null
            }
            middle={
              !promptDone && !anyBusy ? (
                <button type="button" onClick={skip} className={FRAME_QUIET}>
                  Skip this prompt
                </button>
              ) : null
            }
            right={
              <button
                type="button"
                data-testid="record-main"
                onClick={main.onClick}
                disabled={main.disabled}
                className={FRAME_MAIN}
              >
                {main.label}
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

/** The three steps of one prompt on the Record page, in order. */
export const RECORD_STAGES = [
  { key: "answer", label: "Your answer" },
  { key: "igala", label: "Say it in Igala" },
  { key: "english", label: "Say it in English" },
] as const;
export type RecordStep = (typeof RECORD_STAGES)[number]["key"];

/**
 * The numbered step bar, the same shape as Annotate's: done steps are
 * ticked, the current one is marked, the rest wait.
 */
export function RecordSteps({ active }: { active: number }) {
  return (
    <ol
      aria-label="Steps"
      data-testid="record-steps"
      className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm"
    >
      {RECORD_STAGES.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === active ? "step" : undefined}
          className={`flex items-center gap-2 ${
            i === active
              ? "font-semibold text-text-primary"
              : i < active
                ? "text-text-secondary"
                : "text-text-muted"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border font-mono text-xs ${
              i === active
                ? "border-accent bg-accent text-accent-contrast"
                : i < active
                  ? "border-success text-success"
                  : "border-border-strong"
            }`}
          >
            {i < active ? "✓" : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
