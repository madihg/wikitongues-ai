import type { ReactNode } from "react";
import {
  COLUMN_PHASE_LABELS,
  formatElapsed,
  isColumnActive,
  shouldShowElapsed,
  type ColumnPhase,
} from "@/lib/arena/column-status";

/**
 * The one status line under a chat column: what this model is doing, and - once
 * the wait is long enough to be worth counting - how long it has been doing it.
 *
 * NEVER WAIT SILENTLY. A column with no text and no line is indistinguishable
 * from a broken page, and the arms here differ enough in latency (retrieval
 * build, prompt length, an entire second generation on the repaired arm) that
 * the reviewer's first question is always "is it stuck or is it slow". The
 * label answers which, and the clock answers how long.
 *
 * The pulse is `motion-safe:` only. A reader with prefers-reduced-motion set
 * gets a static dot and the same words - the information is in the text, the
 * animation was never carrying it.
 *
 * WHAT THE LIVE REGION MAY AND MAY NOT CONTAIN
 * --------------------------------------------
 * The line is `aria-live="polite"` so a screen reader hears the PHASE change -
 * "Writing", "Checking the answer", "Revising" - without the answer text being
 * interrupted. The elapsed counter is `aria-hidden` for exactly the same
 * reason. It re-reads the clock twice a second, so leaving it inside the live
 * region would queue a fresh announcement of the whole line every single second
 * for the length of the wait: 30-60s of "Writing 8s", "Writing 9s" on the
 * repaired arm, which is the slow column this feature exists for. A polite
 * region still queues; polite is not quiet. The seconds are reassurance for an
 * eye watching an empty panel, and there is no empty panel to watch when the
 * page is being read aloud - the phase transitions carry all of it.
 */
export function ColumnStatusLine({
  phase,
  elapsedMs,
  detail,
}: {
  phase: ColumnPhase;
  /** Milliseconds since this exchange was sent. Ignored on finished columns. */
  elapsedMs: number;
  /** Finished-column facts (latency, retrieval counts) shown after the label. */
  detail?: ReactNode;
}) {
  const active = isColumnActive(phase);
  const showElapsed = shouldShowElapsed(phase, elapsedMs);

  return (
    <p
      className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary"
      // Announced, but politely: a screen reader user gets the transitions
      // without having the answer text interrupted.
      aria-live="polite"
      data-phase={phase}
    >
      <span
        aria-hidden="true"
        className={[
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          phase === "failed"
            ? "bg-danger"
            : active
              ? "bg-accent motion-safe:animate-pulse"
              : "bg-border",
        ].join(" ")}
      />
      <span>
        {COLUMN_PHASE_LABELS[phase]}
        {active ? "…" : ""}
      </span>
      {showElapsed && (
        // Tabular figures so a ticking counter does not shuffle the line, and
        // aria-hidden so the tick does not re-announce the line every second
        // inside the live region above - see the header.
        <span aria-hidden="true" className="tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
      )}
      {detail !== undefined && detail !== null && detail !== false && (
        <span>· {detail}</span>
      )}
    </p>
  );
}
