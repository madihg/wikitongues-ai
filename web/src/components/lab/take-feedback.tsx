"use client";

import { verdicts, type QualityMetrics } from "@/lib/speech/analyse";

/**
 * The feedback card shown right after Stop, before Keep. Pure: metrics (or
 * null while analysing or when the browser could not decode the clip) in,
 * plain-language verdicts out. The wording and thresholds live in
 * lib/speech/analyse.ts. The card never blocks: a warning only suggests
 * another try, and Keep stays available.
 */

const TONE_CLASS = {
  good: "border-success bg-success-subtle",
  warn: "border-warning bg-warning-subtle",
  info: "border-info bg-info-subtle",
} as const;

const TONE_LABEL = { good: "Good", warn: "Check", info: "Note" } as const;

function metricLine(m: QualityMetrics): string {
  const parts = [
    `${(m.durationMs / 1000).toFixed(1)} s`,
    `level ${Math.round(m.rmsDbfs)} dBFS`,
    `peak ${Math.round(m.peakDbfs)} dBFS`,
  ];
  if (m.syllablesPerSecond !== null) {
    parts.push(`${m.syllablesPerSecond.toFixed(1)} syllables a second`);
  }
  return parts.join(", ");
}

export function TakeFeedback({
  metrics,
  status,
}: {
  metrics: QualityMetrics | null;
  status: "analysing" | "done";
}) {
  if (status === "analysing") {
    return (
      <p aria-live="polite" className="text-sm text-text-tertiary">
        Checking the take...
      </p>
    );
  }
  if (!metrics) {
    return (
      <p
        data-testid="take-feedback"
        className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-text-secondary"
      >
        This browser could not check the take. You can still listen, then keep
        it or record again.
      </p>
    );
  }
  const list = verdicts(metrics);
  return (
    <section
      aria-label="Take feedback"
      data-testid="take-feedback"
      className="space-y-2"
    >
      <ul className="space-y-2">
        {list.map((v) => (
          <li
            key={v.key}
            data-verdict={v.key}
            className={`rounded-md border-l-4 px-3 py-2 text-sm text-text-primary ${TONE_CLASS[v.tone]}`}
          >
            <span className="mr-2 font-mono text-xs uppercase tracking-wide text-text-secondary">
              {TONE_LABEL[v.tone]}
            </span>
            {v.message}
          </li>
        ))}
      </ul>
      <p className="font-mono text-xs text-text-tertiary">
        {metricLine(metrics)}
      </p>
    </section>
  );
}
