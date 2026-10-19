"use client";

import { useState } from "react";

/**
 * The consent screen, shown before the first recording and again whenever the
 * consent text version changes. Withdrawal is explained first. Nothing is
 * pre-checked: the four questions are separate, each starts unchecked, and
 * the agree box starts unchecked too. The text comes from
 * GET /api/lab/consent (server-owned and versioned), not from this file.
 * An oral script sits in a collapsible "Read aloud" block for a facilitator.
 */

export interface ConsentSectionDoc {
  id: string;
  heading: string;
  body: string;
}

export interface ConsentQuestionDoc {
  key: "commercialLicensing" | "crossBorder" | "voiceCloning" | "speakerId";
  label: string;
  question: string;
}

export interface ConsentDoc {
  currentVersion: string;
  written: ConsentSectionDoc[];
  oral: ConsentSectionDoc[];
  questions: readonly ConsentQuestionDoc[];
  igalaPlaceholder: string;
}

export type ConsentFlags = Record<ConsentQuestionDoc["key"], boolean>;

const NO_FLAGS: ConsentFlags = {
  commercialLicensing: false,
  crossBorder: false,
  voiceCloning: false,
  speakerId: false,
};

export function ConsentGate({
  doc,
  busy,
  error,
  onAccept,
}: {
  doc: ConsentDoc;
  busy: boolean;
  error: string | null;
  onAccept: (flags: ConsentFlags) => void;
}) {
  // Every box starts false: nothing is ticked for the speaker.
  const [flags, setFlags] = useState<ConsentFlags>(NO_FLAGS);
  const [agreed, setAgreed] = useState(false);

  return (
    <section
      aria-labelledby="consent-title"
      className="rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <h2
        id="consent-title"
        className="text-lg font-semibold text-text-primary"
      >
        Before you record
      </h2>
      <p className="mt-1 text-xs text-text-tertiary">
        Consent text version{" "}
        <span className="font-mono">{doc.currentVersion}</span>
      </p>

      <div className="mt-4 space-y-4">
        {doc.written.map((s) => (
          <div key={s.id}>
            <h3 className="text-sm font-semibold text-text-primary">
              {s.heading}
            </h3>
            <p className="mt-1 text-base text-text-secondary">{s.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-tertiary">{doc.igalaPlaceholder}</p>

      <details className="mt-4 rounded-md border border-border">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-medium text-text-secondary">
          Read aloud (script for a facilitator)
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          {doc.oral.map((s) => (
            <div key={s.id}>
              <h3 className="text-sm font-semibold text-text-primary">
                {s.heading}
              </h3>
              <p className="mt-1 text-base text-text-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </details>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-text-primary">
          Your answers (none is ticked for you)
        </legend>
        <div className="mt-2 space-y-2">
          {doc.questions.map((q) => (
            <label
              key={q.key}
              className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-base text-text-secondary"
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
                checked={flags[q.key]}
                onChange={(e) =>
                  setFlags((f) => ({ ...f, [q.key]: e.target.checked }))
                }
              />
              <span>
                <span className="font-medium text-text-primary">
                  {q.label}.
                </span>{" "}
                {q.question}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-border-strong px-3 py-2 text-base text-text-primary">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I have read this. I understand I can stop at any time, and I agree to
          take part.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!agreed || busy}
        onClick={() => onAccept(flags)}
        className="mt-4 min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving..." : "Accept and continue"}
      </button>
    </section>
  );
}
