"use client";

import { useState } from "react";
import { formatWorked } from "@/lib/activity";

/**
 * "This week, 6 h 40 m worked" on the annotator Dashboard, with the panel
 * that says how time is counted and the "Tell us" note (annotator experience
 * spec, section 10.3). The figures come with the Dashboard's one request
 * (/api/annotator/summary) and are the same as this person's row in the
 * researcher's hours table.
 */
export interface WeekFigure {
  seconds: number;
  /** "estimate": the clock was not running that week; the figure is rebuilt from saved work. */
  basis: "measured" | "estimate";
}

export interface TimeSummary {
  thisWeek: WeekFigure;
  lastWeek: WeekFigure;
  measuredSince: string | null;
}

export const TIME_COPY = {
  heading: "This week",
  link: "How time is counted",
  panelTitle: "How time is counted",
  panel: [
    "The clock runs while this site is open in front of you and you are working: typing, tapping, recording or listening.",
    "It pauses after 5 minutes with no activity. It starts again when you come back.",
    "It counts every kind of work: answers, edits, clips, listening, checking, tone marks.",
    "We do not record what you type and we do not look at your screen.",
  ],
  estimate:
    "This is an estimate from the work you saved. The clock was not running yet.",
  wrong: "Does this look wrong?",
  tellUs: "Tell us",
  dayLabel: "Which day?",
  noteLabel: "What did you work on?",
  send: "Send note",
  sent: "Thank you. Your note is saved for your team lead. No email was sent.",
  failed: "We could not save your note. Please try again.",
} as const;

/** "6 h 40 m worked", or "About 6 h 40 m worked" for a week that was not measured. */
export function workedLine(f: WeekFigure): string {
  const worked = `${formatWorked(f.seconds)} worked`;
  return f.basis === "estimate" && f.seconds > 0 ? `About ${worked}` : worked;
}

function figure(f: WeekFigure): string {
  const t = formatWorked(f.seconds);
  return f.basis === "estimate" && f.seconds > 0 ? `About ${t}` : t;
}

/** Today's date in Lagos, "2026-11-13", the default answer to "Which day?". */
function todayInLagos(): string {
  return new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);
}

export function TimeWorked({
  time,
  defaultOpen = false,
}: {
  /** Undefined while loading, null when the numbers could not be loaded. */
  time: TimeSummary | null | undefined;
  /** For tests: render with the panel open. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(false);
  const [day, setDay] = useState(todayInLagos);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "sent" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState<string>(TIME_COPY.failed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || state === "saving") return;
    setState("saving");
    try {
      const res = await fetch("/api/annotator/time-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, note }),
      });
      if (res.ok) {
        setState("sent");
        setNote("");
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setMessage(json?.error ?? TIME_COPY.failed);
      setState("failed");
    } catch {
      setMessage(TIME_COPY.failed);
      setState("failed");
    }
  };

  const anyEstimate =
    !!time &&
    ((time.thisWeek.basis === "estimate" && time.thisWeek.seconds > 0) ||
      (time.lastWeek.basis === "estimate" && time.lastWeek.seconds > 0));

  return (
    <section aria-labelledby="time-worked-heading">
      <h2
        id="time-worked-heading"
        className="text-sm font-medium text-text-secondary"
      >
        {TIME_COPY.heading}
      </h2>
      <p className="mt-2 text-2xl font-semibold text-text-primary">
        {time
          ? workedLine(time.thisWeek)
          : time === null
            ? "Not available"
            : "…"}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="time-worked-panel"
        className="mt-1 text-sm text-accent-text underline-offset-2 hover:underline"
      >
        {TIME_COPY.link}
      </button>

      {open && (
        <div
          id="time-worked-panel"
          className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary"
        >
          <h3 className="font-medium text-text-primary">
            {TIME_COPY.panelTitle}
          </h3>
          {TIME_COPY.panel.map((line) => (
            <p key={line} className="mt-2">
              {line}
            </p>
          ))}

          {time && (
            <dl className="mt-4 grid max-w-xs grid-cols-2 gap-y-1 tabular-nums">
              <dt>This week</dt>
              <dd className="text-right font-medium text-text-primary">
                {figure(time.thisWeek)}
              </dd>
              <dt>Last week</dt>
              <dd className="text-right font-medium text-text-primary">
                {figure(time.lastWeek)}
              </dd>
            </dl>
          )}
          {anyEstimate && (
            <p className="mt-2 text-xs text-text-tertiary">
              {TIME_COPY.estimate}
            </p>
          )}

          <p className="mt-4">
            {TIME_COPY.wrong}{" "}
            <button
              type="button"
              onClick={() => setForm((v) => !v)}
              aria-expanded={form}
              className="rounded border border-border px-2 py-0.5 text-sm text-text-primary hover:bg-surface-sunken"
            >
              {TIME_COPY.tellUs}
            </button>
          </p>

          {form && state !== "sent" && (
            <form onSubmit={submit} className="mt-3 max-w-md space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-text-tertiary">
                  {TIME_COPY.dayLabel}
                </span>
                <input
                  type="date"
                  value={day}
                  max={todayInLagos()}
                  onChange={(e) => setDay(e.target.value)}
                  required
                  className="mt-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-text-tertiary">
                  {TIME_COPY.noteLabel}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  required
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                />
              </label>
              <button
                type="submit"
                disabled={state === "saving" || !note.trim()}
                className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "saving" ? "Saving..." : TIME_COPY.send}
              </button>
              {state === "failed" && (
                <p role="alert" className="text-sm text-danger">
                  {message}
                </p>
              )}
            </form>
          )}
          {state === "sent" && (
            <p role="status" className="mt-3 text-sm text-text-primary">
              {TIME_COPY.sent}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
