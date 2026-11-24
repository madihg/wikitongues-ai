"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { demoFromSearch, withDemo } from "@/lib/speech/demo-url";
import { EpisodeFooter, EpisodeHeader } from "@/components/episode-frame";
import {
  answerWords,
  CHECK_LEVELS,
  differingWords,
  MAX_CHECK_NOTE_CHARS,
  type CheckLevel,
  type CheckVerdict,
} from "@/lib/speech/check";

/**
 * The Check page: listen to another speaker's clip, read the answer they
 * wrote, and say whether the two match. The first look is blind to the
 * machine: the ASR transcript is fetched only AFTER the verdict is sent, and
 * is then shown beside the written answer with the words that differ
 * highlighted. "Change my verdict" sends a new one for the same clip.
 * "Does not match" asks on what level (word, sound, tone, missing or added,
 * other) before it can be sent; any verdict may carry a short note.
 */

export interface CheckTask {
  /**
   * endsAtStop: the clip ran into a recorder stop (every take before
   * 2026-11-24 stopped at 30 s), so its audio may end before the answer.
   */
  recording: { id: string; url: string; endsAtStop?: boolean };
  prompt: { promptId: string; text: string };
  answer: { text: string; words: string[] };
}

const VERDICTS: { key: CheckVerdict; label: string }[] = [
  { key: "matches", label: "Matches" },
  { key: "does_not_match", label: "Does not match" },
  { key: "cannot_hear", label: "Cannot hear it" },
];

function Words({ words, marked }: { words: string[]; marked: number[] }) {
  return (
    <p className="text-base leading-relaxed text-text-primary">
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 ? " " : ""}
          {marked.includes(i) ? (
            <mark className="rounded bg-warning-subtle px-0.5 text-text-primary">
              {w}
            </mark>
          ) : (
            w
          )}
        </span>
      ))}
    </p>
  );
}

/** The machine's reading beside the written answer, differences marked. */
export function TranscriptCompare({
  answer,
  transcript,
}: {
  answer: string;
  transcript: string | null;
}) {
  if (transcript === null) {
    return (
      <p data-testid="check-no-transcript" className="text-sm text-text-tertiary">
        There is no machine transcript for this clip yet.
      </p>
    );
  }
  const diff = differingWords(answer, transcript);
  return (
    <div data-testid="check-transcript" className="space-y-3">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Written
        </div>
        <Words words={answerWords(answer)} marked={diff.answer} />
      </div>
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Machine heard
        </div>
        <Words words={answerWords(transcript)} marked={diff.transcript} />
      </div>
      <p className="text-xs text-text-tertiary">
        {diff.answer.length === 0 && diff.transcript.length === 0
          ? "The machine heard the same words."
          : "Highlighted words differ."}
      </p>
    </div>
  );
}

export interface CheckViewProps {
  task: CheckTask;
  /** The verdict already sent for this clip, if any. */
  sent: CheckVerdict | null;
  /** Picked but not yet sent. */
  picked: CheckVerdict | null;
  wrongWord: number | null;
  /** The level picked for does_not_match, if any. */
  level: CheckLevel | null;
  note: string;
  busy: boolean;
  error: string | null;
  /** undefined: not loaded; null: none exists. */
  transcript: string | null | undefined;
  onPick: (v: CheckVerdict) => void;
  onWrongWord: (i: number | null) => void;
  onLevel: (l: CheckLevel) => void;
  onNote: (n: string) => void;
  onSend: () => void;
  onChange: () => void;
  onNext: () => void;
  /** Research leads only: may fix the written text after "Does not match". */
  canFix?: boolean;
  /** The fix was saved; the clip now matches the new text. */
  onFixed?: (text: string) => void;
}

export const FIX_COPY = {
  open: "Fix the written text",
  label: "What the clip says",
  help: "Write what you hear. The speaker's text is kept in the edit log, and this clip is marked as matching.",
  save: "Save fix",
  cancel: "Cancel",
  same: "The text is the same as before.",
  failed: "The fix could not be saved.",
} as const;

/**
 * A research lead's fix of someone else's written text, from Check
 * (POST /api/lab/speech/check/fix). Shown only to leads (Halim, Nov 20 2026).
 */
export function LeadFix({
  recordingId,
  text,
  onFixed,
}: {
  recordingId: string;
  text: string;
  onFixed: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        data-testid="check-fix-open"
        onClick={() => setOpen(true)}
        className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      >
        {FIX_COPY.open}
      </button>
    );
  }

  const save = async () => {
    if (value.trim() === text.trim()) {
      setError(FIX_COPY.same);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/speech/check/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId, answerText: value }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? FIX_COPY.failed);
      }
      onFixed(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : FIX_COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="check-fix" className="space-y-2">
      <label htmlFor="check-fix-text" className="block text-sm font-semibold text-text-primary">
        {FIX_COPY.label}
      </label>
      <textarea
        id="check-fix-text"
        value={value}
        rows={3}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      />
      <p className="text-xs text-text-tertiary">{FIX_COPY.help}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="check-fix-save"
          disabled={busy || !value.trim()}
          onClick={() => void save()}
          className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {FIX_COPY.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValue(text);
            setError(null);
          }}
          className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
        >
          {FIX_COPY.cancel}
        </button>
      </div>
    </div>
  );
}

export function CheckView(p: CheckViewProps) {
  const { task, sent, picked, wrongWord, level, note } = p;
  const choosing = sent === null || picked !== null;
  const pointing = choosing && picked === "does_not_match";
  const words = task.answer.words;

  return (
    <section aria-label="Check a clip" data-testid="check-view" className="space-y-4">
      <p className="text-sm text-text-secondary">{task.prompt.text}</p>
      <audio
        controls
        preload="none"
        src={task.recording.url}
        data-testid="check-audio"
        className="w-full"
      />
      {task.recording.endsAtStop ? (
        <p
          data-testid="check-ends-at-stop"
          className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-text-primary"
        >
          The recorder stopped this clip, not the speaker (until November 24
          every clip stopped at 30 seconds), so it may end before the answer
          does. Listen to the end. If words are missing, choose Does not match,
          then Words missing or added.
        </p>
      ) : null}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-text-muted">
          What they wrote
        </div>
        {pointing ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pick the word that does not match">
            {words.map((w, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={wrongWord === i}
                onClick={() => p.onWrongWord(wrongWord === i ? null : i)}
                className={`min-h-[44px] cursor-pointer rounded-md border px-3 text-base focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
                  wrongWord === i
                    ? "border-danger bg-danger-subtle text-text-primary"
                    : "border-border-strong bg-surface text-text-primary hover:bg-surface-sunken"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        ) : (
          <Words words={words} marked={[]} />
        )}
        {pointing && (
          <p className="mt-2 text-xs text-text-tertiary">
            Optional: tap the word that does not match.
          </p>
        )}
      </div>

      {choosing && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Your verdict">
            {VERDICTS.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={picked === v.key}
                disabled={p.busy}
                onClick={() => p.onPick(v.key)}
                className={`min-h-[44px] cursor-pointer rounded-md px-5 text-sm font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
                  picked === v.key
                    ? "bg-accent text-accent-contrast"
                    : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-tertiary">
            A dialect pronunciation of the same word still matches.
          </p>
          {picked === "does_not_match" && (
            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">
                On what level?
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="On what level does it not match"
              >
                {CHECK_LEVELS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    aria-pressed={level === l.key}
                    disabled={p.busy}
                    onClick={() => p.onLevel(l.key)}
                    className={`min-h-[44px] cursor-pointer rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
                      level === l.key
                        ? "border-danger bg-danger-subtle text-text-primary"
                        : "border-border-strong bg-surface text-text-primary hover:bg-surface-sunken"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label
              htmlFor="check-note"
              className="block text-sm font-semibold text-text-primary"
            >
              Note{" "}
              <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <input
              id="check-note"
              type="text"
              value={note}
              maxLength={MAX_CHECK_NOTE_CHARS}
              onChange={(e) => p.onNote(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
            />
            <p className="mt-1 text-right font-mono text-xs text-text-muted">
              {note.length}/{MAX_CHECK_NOTE_CHARS}
            </p>
          </div>
          {/* The shared footer bar: the main button on the right. */}
          <EpisodeFooter
            right={
              <button
                type="button"
                data-testid="check-send"
                disabled={
                  p.busy ||
                  picked === null ||
                  (picked === "does_not_match" && level === null)
                }
                onClick={p.onSend}
                className="min-h-[44px] w-full cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {sent ? "Send new verdict" : "Send verdict"}
              </button>
            }
          />
        </div>
      )}

      {p.error && (
        <p role="alert" className="text-sm text-danger">
          {p.error}
        </p>
      )}

      {sent !== null && !choosing && (
        <div className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4">
          <p className="text-sm text-text-secondary">
            Sent: {VERDICTS.find((v) => v.key === sent)?.label}. Here is what the
            machine heard.
          </p>
          {p.transcript === undefined ? (
            <p className="text-sm text-text-tertiary">Loading...</p>
          ) : (
            <TranscriptCompare
              answer={task.answer.text}
              transcript={p.transcript}
            />
          )}
          {p.canFix && sent === "does_not_match" && p.onFixed && (
            <LeadFix
              recordingId={task.recording.id}
              text={task.answer.text}
              onFixed={p.onFixed}
            />
          )}
          {/* The shared footer bar. "Change my verdict" is this screen's
              "Edit previous": it sits in the left place. */}
          <EpisodeFooter
            left={
              <button
                type="button"
                data-testid="check-change"
                onClick={p.onChange}
                className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
              >
                Change my verdict
              </button>
            }
            right={
              <button
                type="button"
                data-testid="check-next"
                onClick={p.onNext}
                className="min-h-[44px] w-full cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] sm:w-auto"
              >
                Next clip
              </button>
            }
          />
        </div>
      )}
    </section>
  );
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done" }
  | { status: "task"; task: CheckTask };

export function CheckInterface() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // The demo session on the address (the Speech band's Demo switch puts it
  // there). With it, a verdict is stored as demo and the clip is untouched.
  const demoRef = useRef<string | null>(null);
  const [picked, setPicked] = useState<CheckVerdict | null>(null);
  const [sent, setSent] = useState<CheckVerdict | null>(null);
  const [wrongWord, setWrongWord] = useState<number | null>(null);
  const [level, setLevel] = useState<CheckLevel | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null | undefined>(undefined);
  // How many clips are still waiting, for the header line. Null until known.
  const [remaining, setRemaining] = useState<number | null>(null);
  // Research leads may fix the written text (GET /api/admin/lead). Anyone
  // else gets a 403 there, which reads as "not a lead".
  const [isLead, setIsLead] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/lead")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { lead?: boolean } | null) => live && setIsLead(j?.lead === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const fetchNext = useCallback(async () => {
    setLoad({ status: "loading" });
    setPicked(null);
    setSent(null);
    setWrongWord(null);
    setLevel(null);
    setNote("");
    setError(null);
    setTranscript(undefined);
    try {
      // Read here, not at render: the first load runs before any effect.
      demoRef.current = demoFromSearch(window.location.search);
      const res = await fetch(
        withDemo("/api/lab/speech/check/next", demoRef.current),
      );
      if (!res.ok) throw new Error("load");
      const j = (await res.json()) as {
        complete: boolean;
        task?: CheckTask;
        progress?: { remaining?: number };
      };
      setRemaining(
        typeof j.progress?.remaining === "number" ? j.progress.remaining : null,
      );
      setLoad(j.complete || !j.task ? { status: "done" } : { status: "task", task: j.task });
    } catch {
      setLoad({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void fetchNext();
  }, [fetchNext]);

  if (load.status === "loading") {
    return <p className="text-sm text-text-tertiary">Loading...</p>;
  }
  if (load.status === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        The next clip could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (load.status === "done") {
    return <CheckEmpty />;
  }
  const { task } = load;

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/speech/check/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingId: task.recording.id,
          verdict: picked,
          ...(picked === "does_not_match" ? { level } : {}),
          ...(picked === "does_not_match" && wrongWord !== null
            ? { wrongWordIndex: wrongWord }
            : {}),
          ...(note.trim() ? { note } : {}),
          ...(demoRef.current ? { demoSessionId: demoRef.current } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "The verdict could not be saved.");
      }
      setSent(picked);
      setPicked(null);
      setTranscript(undefined);
      // The machine transcript is asked for only now, after the verdict.
      void fetch(
        `/api/lab/speech/check/transcript?recordingId=${encodeURIComponent(task.recording.id)}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { transcript?: string | null } | null) =>
          setTranscript(typeof j?.transcript === "string" ? j.transcript : null),
        )
        .catch(() => setTranscript(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The verdict could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {demoRef.current && (
        <p className="mb-3 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
          Demo session: verdicts here are not counted.
        </p>
      )}
      {/* The frame's header line. The page heading already says "Check". */}
      <EpisodeHeader left={remaining} />
    <CheckView
      task={task}
      sent={sent}
      picked={picked}
      wrongWord={wrongWord}
      level={level}
      note={note}
      busy={busy}
      error={error}
      transcript={transcript}
      onPick={(v) => {
        setPicked(v);
        if (v !== "does_not_match") {
          setWrongWord(null);
          setLevel(null);
        }
      }}
      onWrongWord={setWrongWord}
      onLevel={setLevel}
      onNote={setNote}
      onSend={() => void send()}
      onChange={() => setPicked(sent)}
      onNext={() => void fetchNext()}
      canFix={isLead && !demoRef.current}
      onFixed={(text) => {
        setLoad({
          status: "task",
          task: {
            ...task,
            answer: { text, words: answerWords(text) },
          },
        });
        setSent("matches");
        setPicked(null);
      }}
    />
    </>
  );
}

/** The empty state of the Check queue. */
export function CheckEmpty() {
  return (
    <p data-testid="check-done" className="text-sm text-text-secondary">
      No clips to check right now.
    </p>
  );
}
