"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  CLUES,
  WALKTHROUGH_KEY,
  WALKTHROUGH_STEPS,
  canMoveOn,
  cluesFoundBefore,
  type WalkthroughStep,
} from "@/lib/speech/walkthrough";

/**
 * "How Speech works" (lib/speech/walkthrough.ts): shown once on the Record
 * tab, and again any time from the "How Speech works" button. The guide talks,
 * asks one small question, and waits for the speaker's tap before moving on.
 * The clue strip at the top fills as the speaker finds Record, Check and
 * Listen. Remembered per browser; with no storage it shows each visit.
 */

export function WalkthroughView({
  index,
  tapped,
  onTap,
  onNext,
  onBack,
  onClose,
}: {
  index: number;
  tapped: number | null;
  onTap: (i: number) => void;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const step: WalkthroughStep = WALKTHROUGH_STEPS[index];
  const last = index === WALKTHROUGH_STEPS.length - 1;
  const found = cluesFoundBefore(last ? WALKTHROUGH_STEPS.length : index);
  const ready = canMoveOn(step, tapped);
  const reply =
    step.question && tapped !== null ? step.question.choices[tapped]?.reply : null;
  const right =
    step.question && tapped !== null ? !!step.question.choices[tapped]?.correct : false;

  return (
    <section
      aria-label="How Speech works"
      data-testid="speech-walkthrough"
      className="rounded-lg border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <ol className="flex gap-2" aria-label="Clues">
          {CLUES.map((c) => {
            const on = found.includes(c.key);
            return (
              <li
                key={c.key}
                data-testid={`clue-${c.key}`}
                data-found={on ? "1" : "0"}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border text-text-tertiary"
                }`}
              >
                {on ? "✓ " : ""}
                {c.label}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] cursor-pointer px-2 text-sm text-text-tertiary underline underline-offset-2"
        >
          Skip
        </button>
      </div>

      <div className="mt-5 flex gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-accent-contrast"
        >
          ◕‿◕
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">{step.title}</h2>
          {step.lines.map((line) => (
            <p key={line} className="mt-2 text-base text-text-secondary">
              {line}
            </p>
          ))}
        </div>
      </div>

      {step.question ? (
        <div className="mt-5">
          <p className="text-base font-medium text-text-primary">
            {step.question.text}
          </p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label={step.question.text}
          >
            {step.question.choices.map((c, i) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={tapped === i}
                onClick={() => onTap(i)}
                className={`min-h-[44px] cursor-pointer rounded-md border px-4 py-2 text-sm ${
                  tapped === i
                    ? "border-accent bg-accent-subtle text-text-primary"
                    : "border-border text-text-secondary hover:border-accent"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {reply ? (
            <p
              role="status"
              data-testid="walkthrough-reply"
              className={`mt-3 text-sm ${right ? "text-text-primary" : "text-text-secondary"}`}
            >
              {reply}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {index > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] cursor-pointer px-2 text-sm text-text-tertiary underline underline-offset-2"
          >
            Back
          </button>
        ) : null}
        {last ? (
          <>
            <Link
              href="/speak/check"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
            >
              {step.next}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] cursor-pointer px-2 text-sm text-accent-text underline underline-offset-2"
            >
              Record first
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={onNext}
            className="min-h-[44px] cursor-pointer rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step.next}
          </button>
        )}
        <span className="ml-auto text-xs text-text-tertiary">
          {index + 1} of {WALKTHROUGH_STEPS.length}
        </span>
      </div>
    </section>
  );
}

const noopSubscribe = () => () => {};

function readSeen(): boolean {
  try {
    return localStorage.getItem(WALKTHROUGH_KEY) === "1";
  } catch {
    // No storage: the walkthrough opens each visit.
    return false;
  }
}

/** The Record tab's walkthrough: open on a first visit, reopenable from its button. */
export function SpeechWalkthrough() {
  // Read once from storage on the client; the server render counts as seen,
  // so the first paint is the button and the card opens after hydration.
  const seen = useSyncExternalStore(noopSubscribe, readSeen, () => true);
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !seen;
  const setOpen = (v: boolean) => setOverride(v);
  const [index, setIndex] = useState(0);
  const [tapped, setTapped] = useState<number | null>(null);

  const go = (i: number) => {
    setIndex(i);
    setTapped(null);
  };
  const close = () => {
    setOpen(false);
    go(0);
    try {
      localStorage.setItem(WALKTHROUGH_KEY, "1");
    } catch {
      // Shown again next visit.
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="walkthrough-open"
        onClick={() => setOpen(true)}
        className="min-h-[44px] cursor-pointer text-sm font-medium text-accent-text underline underline-offset-2"
      >
        How Speech works
      </button>
    );
  }
  return (
    <WalkthroughView
      index={index}
      tapped={tapped}
      onTap={setTapped}
      onNext={() => go(Math.min(index + 1, WALKTHROUGH_STEPS.length - 1))}
      onBack={() => go(Math.max(index - 1, 0))}
      onClose={close}
    />
  );
}
