"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConsentGate } from "./consent-gate";
import { AnswerBox } from "./record-parts";
import { RecordClip, type ClipAnswerRef } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";

/**
 * The Record page, the catch-up place for past answers. One column, mobile
 * first:
 *   1. the prompt, then the researcher's own answer (or a box to write and
 *      lock one first);
 *   2. two clips of that answer, each a RecordClip: the Igala answer, then
 *      its English meaning (the answer's locked meaning, or the English
 *      question when no meaning was written, and the page says so). The
 *      English clip is optional; a prompt is done once its Igala clip is
 *      saved.
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
    dialect: string | null;
  } | null;
  source: "own_answer" | "no_answer";
}

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "complete" }
  | { status: "task"; task: QueueTask };

const NEXT_BUTTON =
  "min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export function RecordInterface() {
  const { consent, busy: consentBusy, error: consentError, accept, needAgain } =
    useLabConsent();

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

  const offReason = !consentOk
    ? consent.status === "error"
      ? null
      : "Read and accept the consent above to turn recording on."
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
  const nextPrompt = () => {
    setDraft("");
    setLockedText(null);
    setCreatedAnswerId(null);
    setSavedIgala(false);
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
            blocked={busy.english}
            onBusyChange={(b) => setBusy((s) => (s.igala === b ? s : { ...s, igala: b }))}
            onConsentRequired={needAgain}
            onSaved={(c) => {
              setSavedIgala(true);
              if (c.coldAuthorAnswerId) setCreatedAnswerId(c.coldAuthorAnswerId);
            }}
          />
          <RecordClip
            language="english"
            promptCode={task.prompt.promptId}
            textToRead={gloss || task.prompt.text}
            textLabel={
              gloss
                ? "Now say what it means, in English (optional)."
                : "No English meaning was written for this answer, so read the English question instead (optional)."
            }
            textIsIgala={false}
            syllableText={gloss || task.prompt.text}
            answer={answerRef}
            dialect={task.ownAnswer?.dialect}
            demoSessionId={demoRef.current}
            consentOk={consentOk}
            offReason={offReason}
            licensedAllowed={licensedAllowed}
            cloningAllowed={cloningAllowed}
            blocked={busy.igala}
            onBusyChange={(b) => setBusy((s) => (s.english === b ? s : { ...s, english: b }))}
            onConsentRequired={needAgain}
            onSaved={(c) => {
              if (c.coldAuthorAnswerId) setCreatedAnswerId(c.coldAuthorAnswerId);
            }}
          />
          {savedIgala && !anyBusy && (
            <button type="button" onClick={nextPrompt} className={NEXT_BUTTON}>
              Next prompt
            </button>
          )}
        </div>
      )}

      {task && !savedIgala && !anyBusy && (
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
