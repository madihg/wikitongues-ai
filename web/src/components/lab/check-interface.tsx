"use client";

import { useCallback, useEffect, useState } from "react";
import {
  answerWords,
  differingWords,
  type CheckVerdict,
} from "@/lib/speech/check";

/**
 * The Check page: listen to another speaker's clip, read the answer they
 * wrote, and say whether the two match. The first look is blind to the
 * machine: the ASR transcript is fetched only AFTER the verdict is sent, and
 * is then shown beside the written answer with the words that differ
 * highlighted. "Change my verdict" sends a new one for the same clip.
 */

export interface CheckTask {
  recording: { id: string; url: string };
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
  busy: boolean;
  error: string | null;
  /** undefined: not loaded; null: none exists. */
  transcript: string | null | undefined;
  onPick: (v: CheckVerdict) => void;
  onWrongWord: (i: number | null) => void;
  onSend: () => void;
  onChange: () => void;
  onNext: () => void;
}

export function CheckView(p: CheckViewProps) {
  const { task, sent, picked, wrongWord } = p;
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
          <button
            type="button"
            data-testid="check-send"
            disabled={p.busy || picked === null}
            onClick={p.onSend}
            className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sent ? "Send new verdict" : "Send verdict"}
          </button>
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
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="check-change"
              onClick={p.onChange}
              className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
            >
              Change my verdict
            </button>
            <button
              type="button"
              data-testid="check-next"
              onClick={p.onNext}
              className="min-h-[44px] cursor-pointer rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
            >
              Next clip
            </button>
          </div>
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
  const [picked, setPicked] = useState<CheckVerdict | null>(null);
  const [sent, setSent] = useState<CheckVerdict | null>(null);
  const [wrongWord, setWrongWord] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null | undefined>(undefined);

  const fetchNext = useCallback(async () => {
    setLoad({ status: "loading" });
    setPicked(null);
    setSent(null);
    setWrongWord(null);
    setError(null);
    setTranscript(undefined);
    try {
      const res = await fetch("/api/lab/speech/check/next");
      if (!res.ok) throw new Error("load");
      const j = (await res.json()) as { complete: boolean; task?: CheckTask };
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
    return (
      <p data-testid="check-done" className="text-sm text-text-secondary">
        Nothing left to check right now. Thank you.
      </p>
    );
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
          ...(picked === "does_not_match" && wrongWord !== null
            ? { wrongWordIndex: wrongWord }
            : {}),
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
    <CheckView
      task={task}
      sent={sent}
      picked={picked}
      wrongWord={wrongWord}
      busy={busy}
      error={error}
      transcript={transcript}
      onPick={(v) => {
        setPicked(v);
        if (v !== "does_not_match") setWrongWord(null);
      }}
      onWrongWord={setWrongWord}
      onSend={() => void send()}
      onChange={() => setPicked(sent)}
      onNext={() => void fetchNext()}
    />
  );
}
