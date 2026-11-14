"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EpisodeFooter,
  EpisodeHeader,
  FRAME_MAIN,
  FRAME_QUIET,
  SavedStrip,
} from "@/components/episode-frame";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { wordDiff } from "@/lib/diff";
import {
  lastSavedKey,
  parseLastSaved,
  type LastSaved,
} from "@/lib/episode-draft";
import {
  isToneOnlyChange,
  projectToneOnto,
  stripTone,
  wordsOf,
} from "@/lib/tone/tone";
import type { ToneTask } from "@/lib/tone/tone-pass";

/**
 * PASS 2: TONE MARKS, the screen (annotator experience spec, section 9; the
 * brief is hmart task 1549b74a). In the shared episode frame: the prompt,
 * the first version read-only, an editable copy with the tone keyboard under
 * it, and the footer bar (Edit previous, Skip this one, Save & next).
 *
 * The tone-only guard runs here before the save and again on the server: if
 * anything other than tone marks changed, the marker chooses between "Undo
 * the other changes" and "Keep it and flag it as a correction".
 *
 * Who wrote the first version, and who else marks it, is never shown: the
 * server does not send it.
 */

export const TONE_COPY = {
  firstVersion: "First version",
  editable: "Add the tone marks here",
  unsure: "I am not sure about a word",
  unsureHelp:
    "Tap the word you are not sure about. Tap it again to take it back.",
  warning:
    "Something other than tone marks changed. In this pass, add tone marks only.",
  undo: "Undo the other changes",
  keep: "Keep it and flag it as a correction",
  editPrevious: "Edit previous",
  skip: "Skip this one",
  save: "Save & next",
  saving: "Saving...",
  empty: "No answers to mark right now.",
  note: "Note (optional)",
} as const;

export interface ToneViewProps {
  task: ToneTask;
  text: string;
  unsure: number[];
  unsureOpen: boolean;
  note: string;
  /** True when the guard found a change that is not a tone mark. */
  warning: boolean;
  busy: boolean;
  error: string | null;
  hasPrevious: boolean;
  onText: (next: string) => void;
  onToggleUnsureOpen: () => void;
  onToggleUnsure: (index: number) => void;
  onNote: (next: string) => void;
  onUndo: () => void;
  onKeep: () => void;
  onEditPrevious: () => void;
  onSkip: () => void;
  onSave: () => void;
}

/** What changed besides tone marks, with tone taken out of both sides. */
export function OtherChanges({
  firstVersion,
  text,
}: {
  firstVersion: string;
  text: string;
}) {
  return (
    <p
      data-testid="tone-other-changes"
      className="whitespace-pre-wrap break-words rounded bg-surface p-3 font-mono text-sm leading-relaxed"
    >
      {wordDiff(stripTone(firstVersion).trim(), stripTone(text).trim()).map(
        (seg, i) =>
          seg.type === "same" ? (
            <span key={i}>{seg.value}</span>
          ) : seg.type === "added" ? (
            <span key={i} className="rounded bg-success-subtle text-success">
              {seg.value}
            </span>
          ) : (
            <span
              key={i}
              className="rounded bg-danger-subtle text-danger line-through"
            >
              {seg.value}
            </span>
          ),
      )}
    </p>
  );
}

export function ToneView(p: ToneViewProps) {
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const words = wordsOf(p.task.firstVersion);

  return (
    <section aria-label="Pass 2: tone marks" data-testid="tone-view">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Prompt
        </p>
        <p className="mt-1 text-sm text-text-primary">{p.task.promptText}</p>

        <p className="mt-5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          {TONE_COPY.firstVersion}
        </p>
        <p
          data-testid="tone-first-version"
          className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-surface-sunken p-3 font-mono text-sm leading-relaxed text-text-secondary"
        >
          {p.task.firstVersion}
        </p>

        <label
          htmlFor="tone-box"
          className="mt-5 block text-xs font-medium uppercase tracking-wider text-text-tertiary"
        >
          {TONE_COPY.editable}
        </label>
        <textarea
          id="tone-box"
          ref={boxRef}
          value={p.text}
          onChange={(e) => p.onText(e.target.value)}
          rows={4}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-base leading-relaxed text-text-primary focus-visible:border-accent"
        />
        <ToneKeyboard
          targetRef={boxRef}
          value={p.text}
          onValueChange={p.onText}
          disabled={p.busy}
        />

        <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="size-5"
            checked={p.unsureOpen}
            onChange={p.onToggleUnsureOpen}
          />
          {TONE_COPY.unsure}
        </label>
        {p.unsureOpen && (
          <div>
            <p className="text-xs text-text-tertiary">{TONE_COPY.unsureHelp}</p>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="group"
              aria-label="Pick the word you are not sure about"
            >
              {words.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={p.unsure.includes(i)}
                  onClick={() => p.onToggleUnsure(i)}
                  className={`min-h-[44px] cursor-pointer rounded-md border px-3 font-mono text-base ${
                    p.unsure.includes(i)
                      ? "border-warning bg-warning-subtle text-text-primary"
                      : "border-border-strong bg-surface text-text-primary hover:bg-surface-sunken"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <label
              htmlFor="tone-note"
              className="mt-3 block text-xs text-text-tertiary"
            >
              {TONE_COPY.note}
            </label>
            <input
              id="tone-note"
              type="text"
              value={p.note}
              maxLength={500}
              onChange={(e) => p.onNote(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-primary"
            />
          </div>
        )}

        {p.warning && (
          <div
            role="alert"
            data-testid="tone-warning"
            className="mt-5 rounded-md border border-warning/40 bg-warning-subtle p-4"
          >
            <p className="text-sm font-medium text-text-primary">
              {TONE_COPY.warning}
            </p>
            <div className="mt-3">
              <OtherChanges firstVersion={p.task.firstVersion} text={p.text} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={p.onUndo}
                disabled={p.busy}
                className="min-h-[44px] cursor-pointer rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-40"
              >
                {TONE_COPY.undo}
              </button>
              <button
                type="button"
                onClick={p.onKeep}
                disabled={p.busy}
                className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
              >
                {TONE_COPY.keep}
              </button>
            </div>
          </div>
        )}

        {p.error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {p.error}
          </p>
        )}

        <EpisodeFooter
          left={
            p.hasPrevious ? (
              <button
                type="button"
                onClick={p.onEditPrevious}
                disabled={p.busy}
                className={FRAME_QUIET}
              >
                {TONE_COPY.editPrevious}
              </button>
            ) : null
          }
          middle={
            <button
              type="button"
              onClick={p.onSkip}
              disabled={p.busy}
              className={FRAME_QUIET}
            >
              {TONE_COPY.skip}
            </button>
          }
          right={
            <button
              type="button"
              data-testid="tone-save"
              onClick={p.onSave}
              disabled={p.busy || p.text.trim().length === 0}
              className={FRAME_MAIN}
            >
              {p.busy ? TONE_COPY.saving : TONE_COPY.save}
            </button>
          }
        />
      </div>
    </section>
  );
}

export function ToneEmpty() {
  return (
    <p
      data-testid="tone-empty"
      className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary"
    >
      {TONE_COPY.empty}
    </p>
  );
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done" }
  | { status: "task"; task: ToneTask; reopened: boolean };

export function ToneInterface() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [unsure, setUnsure] = useState<number[]>([]);
  const [unsureOpen, setUnsureOpen] = useState(false);
  const [note, setNote] = useState("");
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  // Seconds this item was on screen with the tab in view, for honest time.
  const visibleSince = useRef<number | null>(null);
  const seconds = useRef(0);

  const fetchTask = useCallback(async (reopen?: string) => {
    setLoad({ status: "loading" });
    setWarning(false);
    setError(null);
    try {
      const res = await fetch(
        `/api/annotator/tone/next${reopen ? `?item=${encodeURIComponent(reopen)}` : ""}`,
      );
      if (!res.ok) throw new Error("load");
      const j = (await res.json()) as {
        complete: boolean;
        task?: ToneTask;
        progress?: { remaining?: number };
      };
      setRemaining(
        typeof j.progress?.remaining === "number" ? j.progress.remaining : null,
      );
      if (j.complete || !j.task) {
        setLoad({ status: "done" });
        return;
      }
      // The editable copy starts as the first version, or as what this
      // person saved when they reopen it.
      setText(j.task.mine?.text ?? j.task.firstVersion);
      setUnsure(j.task.mine?.unsureWords ?? []);
      setUnsureOpen((j.task.mine?.unsureWords.length ?? 0) > 0);
      setNote(j.task.mine?.note ?? "");
      seconds.current = 0;
      visibleSince.current =
        document.visibilityState === "visible" ? Date.now() : null;
      setLoad({ status: "task", task: j.task, reopened: !!reopen });
    } catch {
      setLoad({ status: "error" });
    }
  }, []);

  useEffect(() => {
    try {
      const found = parseLastSaved(
        sessionStorage.getItem(lastSavedKey("tone")),
      );
      if (found) setLastSaved(found);
    } catch {
      // No storage: the strip does not persist across a reload.
    }
    void fetchTask();
  }, [fetchTask]);

  // Count only the time the tab is in view.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        visibleSince.current = Date.now();
      } else if (visibleSince.current !== null) {
        seconds.current += (Date.now() - visibleSince.current) / 1000;
        visibleSince.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const activeSeconds = () =>
    Math.round(
      seconds.current +
        (visibleSince.current !== null
          ? (Date.now() - visibleSince.current) / 1000
          : 0),
    );

  if (load.status === "loading") {
    return <p className="text-sm text-text-tertiary">Loading...</p>;
  }
  if (load.status === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        The next answer could not be loaded. Reload the page to try again.
      </p>
    );
  }

  const strip = lastSaved ? (
    <SavedStrip
      promptText={lastSaved.promptText}
      onEdit={() => void fetchTask(lastSaved.id)}
    />
  ) : null;

  if (load.status === "done") {
    return (
      <>
        {strip}
        <ToneEmpty />
      </>
    );
  }
  const { task } = load;

  const send = async (keepAsCorrection: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/annotator/tone/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: task.itemId,
          text,
          keepAsCorrection,
          unsureWords: unsure,
          note,
          activeSeconds: activeSeconds(),
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      if (res.status === 409 && j?.code === "non_tone_change") {
        setWarning(true);
        return;
      }
      if (!res.ok) throw new Error(j?.error ?? "Could not save.");
      const saved: LastSaved = {
        type: "tone",
        id: task.itemId,
        promptText: task.promptText,
      };
      setLastSaved(saved);
      try {
        sessionStorage.setItem(lastSavedKey("tone"), JSON.stringify(saved));
      } catch {
        // Shown for this page view only.
      }
      await fetchTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    // The tone-only guard, before anything is sent.
    if (!isToneOnlyChange(task.firstVersion, text)) {
      setWarning(true);
      return;
    }
    void send(false);
  };

  const skip = async () => {
    setBusy(true);
    setError(null);
    try {
      // A reopened item is already saved: "skip" only leaves it as it is.
      if (!load.reopened) {
        const res = await fetch("/api/annotator/tone/skip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: task.itemId }),
        });
        if (!res.ok) throw new Error("skip");
      }
      await fetchTask();
    } catch {
      setError("Could not skip. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <EpisodeHeader left={remaining} />
      {strip}
      <ToneView
        task={task}
        text={text}
        unsure={unsure}
        unsureOpen={unsureOpen}
        note={note}
        warning={warning}
        busy={busy}
        error={error}
        // "Edit previous" is for the item saved last, and never while that
        // same item is the one on screen.
        hasPrevious={lastSaved !== null && lastSaved.id !== task.itemId}
        onText={(next) => {
          setText(next);
          setWarning(false);
        }}
        onToggleUnsureOpen={() => setUnsureOpen((o) => !o)}
        onToggleUnsure={(i) =>
          setUnsure((u) =>
            u.includes(i)
              ? u.filter((x) => x !== i)
              : [...u, i].sort((a, b) => a - b),
          )
        }
        onNote={setNote}
        onUndo={() => {
          setText(projectToneOnto(task.firstVersion, text));
          setWarning(false);
        }}
        onKeep={() => void send(true)}
        onEditPrevious={() => lastSaved && void fetchTask(lastSaved.id)}
        onSkip={() => void skip()}
        onSave={save}
      />
    </>
  );
}
