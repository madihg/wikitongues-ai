import type { ChatStreamEvent } from "@/lib/arena/chat-stream";

/**
 * Per-column progress for the chat page: what each model is doing, right now,
 * in its own column.
 *
 * WHY PER COLUMN AND NOT ONE GLOBAL LINE
 * --------------------------------------
 * The page used to print a single "Asking 1 model..." above the grid and then
 * nothing until text appeared. That is a lie whenever the columns are not in
 * lockstep, which is always: the arms differ in retrieval build, prompt length
 * and, on the rag-v4-1 arm, in whether a whole second generation runs. The
 * reviewer needs to know WHICH column is slow and WHY, because "this model is
 * slow" is a finding about the model, and "the page is broken" is a finding
 * about us. One status line per column separates those two readings.
 *
 * THE PHASES, AND WHERE EACH ONE COMES FROM
 * -----------------------------------------
 *   waiting     the column exists, the request has not gone out yet.
 *   retrieving  request in flight, nothing back for this column - which is
 *               exactly the window the server spends on auth and the per-
 *               version retrieval builds, before the response head.
 *   writing     deltas are arriving, or the route said a provider call started.
 *   checking    the rag-v4-1 serving lint is reading a finished first attempt.
 *   revising    the lint found violations and the repaired attempt is going out
 *               (driven by the wire's `revision` event, so the phase and the
 *               "rewrote its answer" note can never disagree).
 *   done/failed the closing `reply` event landed, with or without an error.
 *
 * Everything here is pure and event-driven so the machine can be tested without
 * a browser, a provider, or a clock.
 */

export type ColumnPhase =
  | "waiting"
  | "retrieving"
  | "writing"
  | "checking"
  | "revising"
  | "done"
  | "failed";

/** The status line a reader sees, one per phase. Short enough to sit under a
 * model name in a narrow column at 11px. */
export const COLUMN_PHASE_LABELS: Record<ColumnPhase, string> = {
  waiting: "Waiting to start",
  retrieving: "Retrieving context",
  writing: "Writing",
  checking: "Checking the answer",
  revising: "Revising",
  done: "Done",
  failed: "Failed",
};

/** Phases where the column is still working, so the line gets an ellipsis, a
 * (motion-safe) pulse, and - past the threshold - a running clock. */
export function isColumnActive(phase: ColumnPhase): boolean {
  return phase !== "done" && phase !== "failed";
}

/**
 * How long a column may take before its elapsed seconds are shown. Under this,
 * a counter is noise on every fast answer; over it, the reader has started to
 * wonder whether anything is happening, and a number that moves is the cheapest
 * possible proof that it is.
 */
export const ELAPSED_VISIBLE_AFTER_MS = 3000;

export function shouldShowElapsed(
  phase: ColumnPhase,
  elapsedMs: number,
): boolean {
  return isColumnActive(phase) && elapsedMs >= ELAPSED_VISIBLE_AFTER_MS;
}

/** Whole seconds - a jittering decimal reads as instability, not as progress. */
export function formatElapsed(elapsedMs: number): string {
  return `${Math.max(0, Math.floor(elapsedMs / 1000))}s`;
}

/** One exchange's phases, keyed by candidate slug. */
export type ColumnPhases = Readonly<Record<string, ColumnPhase>>;

export function initColumnPhases(
  slugs: readonly string[],
  phase: ColumnPhase = "waiting",
): ColumnPhases {
  return Object.fromEntries(slugs.map((slug) => [slug, phase]));
}

/** Move every column that has not finished to `phase`; terminal ones stay put. */
export function setPendingPhases(
  phases: ColumnPhases,
  phase: ColumnPhase,
): ColumnPhases {
  const next: Record<string, ColumnPhase> = {};
  for (const [slug, current] of Object.entries(phases)) {
    next[slug] = isColumnActive(current) ? phase : current;
  }
  return next;
}

/**
 * Fold stream events into the phase map. Immutable, so the result can be handed
 * straight to a React state update.
 *
 * Terminal phases are sticky: once a column reports `reply`, no later event can
 * put it back to work. That matters because the events for several columns are
 * interleaved on one stream and a late straggler delta must not resurrect a
 * column the reader has already finished reading.
 *
 * An event type this build does not know is IGNORED - not thrown on, not
 * treated as a reply. The wire protocol is additive (the `revision` event was
 * added after the first client shipped), so an unknown line must cost at most a
 * missing status transition.
 */
export function applyStatusEvents(
  phases: ColumnPhases,
  events: readonly ChatStreamEvent[],
): ColumnPhases {
  if (events.length === 0) return phases;
  let changed = false;
  const next: Record<string, ColumnPhase> = { ...phases };

  const move = (slug: string, phase: ColumnPhase) => {
    const current = next[slug];
    if (current === undefined || !isColumnActive(current)) return;
    if (current === phase) return;
    next[slug] = phase;
    changed = true;
  };

  for (const ev of events) {
    if (ev.type === "delta") {
      if (typeof ev.slug === "string") move(ev.slug, "writing");
    } else if (ev.type === "stage") {
      if (typeof ev.slug === "string") move(ev.slug, ev.stage);
    } else if (ev.type === "revision") {
      if (typeof ev.slug === "string") move(ev.slug, "revising");
    } else if (ev.type === "reply") {
      const reply = ev.reply;
      if (reply && typeof reply.slug === "string")
        move(reply.slug, reply.error ? "failed" : "done");
    }
    // Any other type: ignored on purpose. See the doc comment.
  }

  return changed ? next : phases;
}
