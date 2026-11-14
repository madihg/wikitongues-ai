"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANGUAGE_LABEL,
  MAX_NOTE_CHARS,
  REASON_TAGS,
  type SpeechLanguage,
  type SpeechWinner,
} from "@/lib/speech/limits";
import {
  AXES_BLOCK_LABEL,
  AXIS_MAX,
  AXIS_MIN,
  SPEECH_AXES,
  axesTargetFor,
  type AxisScores,
  type AxisValue,
  type SpeechAxisKey,
} from "@/lib/speech/speech-axes";

/**
 * The Listen page: a blind A/B judgment of two clips of the same prompt.
 * Prompt text, two player cards stacked (A then B, in the arena's colours),
 * four 44px choices (A, B, Tie, Both unusable), a required reason chip row
 * and an optional note. Submit stays disabled until a choice and at least one
 * reason are in. The task carries no tier, speaker or source: the researcher
 * judges the sound only, and sees the language (a pair is always one
 * language). After the verdict and reason, an optional row of five
 * PROVISIONAL speech axes (0 to 5 or N/A) on the winner, or on both when it
 * is a tie; labels come from lib/speech/speech-axes.ts. One counted judgment
 * per prompt and language (the server answers 409 on a second, and the page
 * then moves on).
 */

export interface ListenTask {
  prompt: { id: string; promptId: string; text: string };
  language?: SpeechLanguage;
  /** Present when the prompt is a tone minimal pair: the two spellings, target not marked. */
  minimalPair?: { options: Array<{ text: string }> };
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

const AXIS_VALUES: AxisValue[] = [
  "na",
  ...Array.from({ length: AXIS_MAX - AXIS_MIN + 1 }, (_, i) => AXIS_MIN + i),
];

/**
 * The provisional speech axes. Optional and hidden when both clips are
 * unusable. Each axis is a radio group of N/A and 0 to 5 in 44px buttons;
 * tapping the chosen value again clears it.
 */
export function SpeechAxesRow({
  winner,
  scores,
  onScore,
}: {
  winner: SpeechWinner;
  scores: AxisScores;
  onScore: (axis: SpeechAxisKey, value: AxisValue | null) => void;
}) {
  const target = axesTargetFor(winner);
  if (target === null) return null;
  const about =
    target === "both"
      ? "Scored on both clips (a tie)."
      : `Scored on the winner, clip ${target.toUpperCase()}.`;
  return (
    <fieldset
      data-testid="speech-axes"
      className="rounded-lg border border-border bg-surface-sunken p-4"
    >
      <legend className="px-1 text-sm font-semibold text-text-primary">
        {AXES_BLOCK_LABEL}
      </legend>
      <p className="text-xs text-text-tertiary">
        Optional. {about} 0 is worst, 5 is best.
      </p>
      <div className="mt-3 space-y-4">
        {SPEECH_AXES.map((axis) => (
          <div
            key={axis.key}
            role="radiogroup"
            aria-label={axis.label}
            data-axis={axis.key}
          >
            <p className="text-sm font-medium text-text-primary">
              {axis.label}{" "}
              <span className="font-normal text-text-tertiary">
                {axis.hint}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {AXIS_VALUES.map((v) => {
                const checked = scores[axis.key] === v;
                return (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={`${axis.label} ${v === "na" ? "not applicable" : v}`}
                    onClick={() => onScore(axis.key, checked ? null : v)}
                    className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
                      checked
                        ? "border-accent bg-accent-subtle text-accent-text"
                        : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {v === "na" ? "N/A" : v}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** What the listener said they heard for each clip: a spelling, null for not sure, undefined for unanswered. */
export type HeardAnswers = Partial<Record<"a" | "b", string | null>>;

/**
 * "Which word did you hear?" for a tone minimal pair, once per clip. The
 * spellings are offered in an order fixed per listener, never marked; "Not
 * sure" counts as not correct when tone accuracy is scored.
 */
export function MinimalPairQuestion({
  options,
  heard,
  onHeard,
}: {
  options: Array<{ text: string }>;
  heard: HeardAnswers;
  onHeard: (side: "a" | "b", value: string | null) => void;
}) {
  return (
    <fieldset
      data-testid="minimal-pair"
      className="rounded-lg border border-border bg-surface-sunken p-4"
    >
      <legend className="px-1 text-sm font-semibold text-text-primary">
        Which word did you hear?
      </legend>
      <div className="mt-2 space-y-4">
        {(["a", "b"] as const).map((side) => (
          <div key={side} role="radiogroup" aria-label={`Word heard in clip ${side.toUpperCase()}`}>
            <p className="text-sm font-medium text-text-primary">
              Clip {side.toUpperCase()}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {[...options.map((o) => o.text), null].map((text) => {
                const checked = heard[side] === text;
                return (
                  <button
                    key={text ?? "unsure"}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => onHeard(side, text)}
                    className={`igala min-h-[44px] cursor-pointer rounded-md border px-4 py-2 text-base focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
                      checked
                        ? "border-accent bg-accent-subtle text-accent-text"
                        : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {text ?? "Not sure"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** The pure view: render it with a task to see every control. */
export function ListenView({
  task,
  winner,
  reasons,
  note,
  axes,
  heard = {},
  busy,
  error,
  onWinner,
  onToggleReason,
  onNote,
  onAxis,
  onHeard = () => {},
  onSubmit,
}: {
  task: ListenTask;
  winner: SpeechWinner | null;
  reasons: string[];
  note: string;
  axes: AxisScores;
  heard?: HeardAnswers;
  busy: boolean;
  error: string | null;
  onWinner: (w: SpeechWinner) => void;
  onToggleReason: (key: string) => void;
  onNote: (v: string) => void;
  onAxis: (axis: SpeechAxisKey, value: AxisValue | null) => void;
  onHeard?: (side: "a" | "b", value: string | null) => void;
  onSubmit: () => void;
}) {
  const tone = task.minimalPair;
  const toneDone = !tone || (heard.a !== undefined && heard.b !== undefined);
  const canSubmit = winner !== null && reasons.length > 0 && toneDone && !busy;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <p className="font-mono text-xs text-text-tertiary">
          {task.prompt.promptId}
          {task.language && (
            <span data-testid="clip-language">
              {" "}
              · {LANGUAGE_LABEL[task.language]} clips
            </span>
          )}
        </p>
        <p className="mt-1 text-base text-text-primary">{task.prompt.text}</p>
      </section>

      <div className="space-y-2">
        <ClipPlayer side="a" url={task.clipA.url} />
        <ClipPlayer side="b" url={task.clipB.url} />
      </div>

      {tone && (
        <MinimalPairQuestion options={tone.options} heard={heard} onHeard={onHeard} />
      )}

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

      {winner !== null && (
        <SpeechAxesRow winner={winner} scores={axes} onScore={onAxis} />
      )}

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
  const [axes, setAxes] = useState<AxisScores>({});
  const [heard, setHeard] = useState<HeardAnswers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const demoRef = useRef<string | null>(null);

  const loadNext = useCallback(async () => {
    setQueue({ status: "loading" });
    setWinner(null);
    setReasons([]);
    setNote("");
    setAxes({});
    setHeard({});
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
          ...(Object.keys(axes).length > 0 && winner !== "both_unusable"
            ? { axes }
            : {}),
          ...(task.minimalPair
            ? {
                toneAnswers: (["a", "b"] as const)
                  .filter((side) => heard[side] !== undefined)
                  .map((side) => ({
                    recordingId: side === "a" ? task.clipA.id : task.clipB.id,
                    heardSpelling: heard[side] ?? null,
                  })),
              }
            : {}),
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
          axes={axes}
          heard={heard}
          onHeard={(side, value) => setHeard((h) => ({ ...h, [side]: value }))}
          busy={busy}
          error={error}
          onWinner={setWinner}
          onToggleReason={(key) =>
            setReasons((r) =>
              r.includes(key) ? r.filter((k) => k !== key) : [...r, key],
            )
          }
          onNote={setNote}
          onAxis={(axis, value) =>
            setAxes((cur) => {
              const next = { ...cur };
              if (value === null) delete next[axis];
              else next[axis] = value;
              return next;
            })
          }
          onSubmit={() => void submit()}
        />
      )}
    </div>
  );
}
