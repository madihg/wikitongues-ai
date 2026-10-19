"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_NOTE_CHARS,
  REASON_TAGS,
  type SpeechWinner,
} from "@/lib/speech/limits";

/**
 * The Listen page: a blind A/B judgment of two clips of the same prompt.
 * Prompt text, two player cards stacked (A then B, in the arena's colours),
 * four 44px choices (A, B, Tie, Both unusable), a required reason chip row
 * and an optional note. Submit stays disabled until a choice and at least one
 * reason are in. The task carries no tier, speaker or source: the researcher
 * judges the sound only. One counted judgment per prompt (the server answers
 * 409 on a second, and the page then moves on).
 */

export interface ListenTask {
  prompt: { id: string; promptId: string; text: string };
  clipA: { id: string; url: string };
  clipB: { id: string; url: string };
}

const CHOICES: { key: SpeechWinner; label: string }[] = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "tie", label: "Tie" },
  { key: "both_unusable", label: "Both unusable" },
];

/** Only one clip plays at a time: starting one pauses the other. */
let playing: HTMLAudioElement | null = null;

export function ClipPlayer({ side, url }: { side: "a" | "b"; url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const label = side === "a" ? "A" : "B";

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      void el.play();
    } else {
      el.pause();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-2 bg-surface p-3 ${
        side === "a" ? "border-pick-a" : "border-pick-b"
      }`}
    >
      <span
        className={`font-mono text-sm font-semibold ${
          side === "a" ? "text-pick-a" : "text-pick-b"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${isPlaying ? "Pause" : "Play"} clip ${label}`}
        className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-text-primary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

/** The pure view: render it with a task to see every control. */
export function ListenView({
  task,
  winner,
  reasons,
  note,
  busy,
  error,
  onWinner,
  onToggleReason,
  onNote,
  onSubmit,
}: {
  task: ListenTask;
  winner: SpeechWinner | null;
  reasons: string[];
  note: string;
  busy: boolean;
  error: string | null;
  onWinner: (w: SpeechWinner) => void;
  onToggleReason: (key: string) => void;
  onNote: (v: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = winner !== null && reasons.length > 0 && !busy;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <p className="font-mono text-xs text-text-tertiary">
          {task.prompt.promptId}
        </p>
        <p className="mt-1 text-base text-text-primary">{task.prompt.text}</p>
      </section>

      <div className="space-y-2">
        <ClipPlayer side="a" url={task.clipA.url} />
        <ClipPlayer side="b" url={task.clipB.url} />
      </div>

      <div
        role="radiogroup"
        aria-label="Which clip is better"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={winner === c.key}
            onClick={() => onWinner(c.key)}
            className={`min-h-[44px] cursor-pointer rounded-md border px-3 py-2 text-sm font-medium ${
              winner === c.key
                ? "border-accent bg-accent-subtle text-accent-text"
                : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div>
        <p
          id="reason-label"
          className="text-sm font-semibold text-text-primary"
        >
          Why?{" "}
          <span className="font-normal text-text-tertiary">
            (pick at least one)
          </span>
        </p>
        <div
          role="group"
          aria-labelledby="reason-label"
          className="mt-2 flex flex-wrap gap-2"
        >
          {REASON_TAGS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={reasons.includes(r.key)}
              onClick={() => onToggleReason(r.key)}
              className={`min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm ${
                reasons.includes(r.key)
                  ? "border-accent bg-accent-subtle text-accent-text"
                  : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="listen-note"
          className="block text-sm font-semibold text-text-primary"
        >
          Note{" "}
          <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <textarea
          id="listen-note"
          value={note}
          maxLength={MAX_NOTE_CHARS}
          rows={2}
          onChange={(e) => onNote(e.target.value)}
          className="mt-2 min-h-[44px] w-full rounded-md border border-border-strong bg-surface p-3 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        data-testid="submit-button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Submitting..." : "Submit"}
      </button>
    </div>
  );
}

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "complete" }
  | { status: "task"; task: ListenTask };

export function ListenInterface() {
  const [queue, setQueue] = useState<QueueState>({ status: "loading" });
  const [winner, setWinner] = useState<SpeechWinner | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const demoRef = useRef<string | null>(null);

  const loadNext = useCallback(async () => {
    setQueue({ status: "loading" });
    setWinner(null);
    setReasons([]);
    setNote("");
    setError(null);
    const qs = demoRef.current
      ? `?demo=${encodeURIComponent(demoRef.current)}`
      : "";
    try {
      const res = await fetch(`/api/lab/speech/listen/next${qs}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Could not load a pair.");
      setDone(j.progress?.completed ?? 0);
      setQueue(
        j.complete || !j.task
          ? { status: "complete" }
          : { status: "task", task: j.task },
      );
    } catch (e) {
      setQueue({
        status: "error",
        message: e instanceof Error ? e.message : "Could not load a pair.",
      });
    }
  }, []);

  useEffect(() => {
    demoRef.current = new URLSearchParams(window.location.search).get("demo");
    void loadNext();
  }, [loadNext]);

  const submit = async () => {
    if (queue.status !== "task" || winner === null) return;
    const { task } = queue;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/speech/listen/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: task.prompt.promptId,
          recordingAId: task.clipA.id,
          recordingBId: task.clipB.id,
          winner,
          reasonTags: reasons,
          note,
          ...(demoRef.current ? { demoSessionId: demoRef.current } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 409) {
        // Already judged elsewhere: nothing to redo, move to the next pair.
        await loadNext();
        return;
      }
      if (!res.ok) throw new Error(j?.error ?? "Could not save your judgment.");
      setBusy(false);
      await loadNext();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your judgment.",
      );
      setBusy(false);
    }
  };

  return (
    <div aria-live="polite">
      {demoRef.current && (
        <p className="mb-4 rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-text-primary">
          Demo session: judgments here are not counted.
        </p>
      )}
      {queue.status === "loading" && (
        <p className="text-sm text-text-tertiary">Loading a pair...</p>
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
          Nothing to listen to right now. A prompt needs clips from two
          different voices before it appears here. You have judged {done}.
        </p>
      )}
      {queue.status === "task" && (
        <ListenView
          task={queue.task}
          winner={winner}
          reasons={reasons}
          note={note}
          busy={busy}
          error={error}
          onWinner={setWinner}
          onToggleReason={(key) =>
            setReasons((r) =>
              r.includes(key) ? r.filter((k) => k !== key) : [...r, key],
            )
          }
          onNote={setNote}
          onSubmit={() => void submit()}
        />
      )}
    </div>
  );
}
