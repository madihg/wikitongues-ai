/**
 * THE TURN BUDGET: how long one chat turn is allowed to take, and what happens
 * when it runs out.
 *
 * THE INCIDENT THIS EXISTS FOR (production, 2026-08-31)
 * ----------------------------------------------------
 * A researcher pasted a long English paragraph into the arena chat and asked
 * the rag-v4-1 column to translate it. Earlier turns in the same session took
 * 33.7s, 34.2s and 89.8s (that one retrieved 33 reference chunks). The next,
 * longer one came back as a bare "HTTP 504" card: 0.0s, no text, no
 * explanation. The whole answer was lost, and the page said nothing about why.
 *
 * The route declares `maxDuration = 120`. Declaring a number does not buy it:
 * the deployment is on the HOBBY plan, whose function ceiling is lower, and
 * when the platform kills a function the client gets a gateway error with NO
 * BODY - so nothing the route would like to say at that moment can be said.
 * The only fix that works is to finish, deliberately and early, BEFORE the
 * platform intervenes. Everything in this module serves that one sentence.
 *
 * WHY A MODULE AND NOT A LITERAL IN THE ROUTE
 * -------------------------------------------
 * Three places have to agree about the same deadline: the route (which sets
 * it and enforces it), the repair round (which decides whether a second
 * generation still fits), and the tests (which assert both). A literal copied
 * into three files is a literal that will disagree with itself - the
 * MIN_DECIDED_PER_PAIRING precedent. One module, imported everywhere.
 */

// ─── the ceiling ────────────────────────────────────────────────────────────

/**
 * What the chat route DECLARES. Next reads `export const maxDuration` at build
 * time, so the route re-exports this constant rather than writing its own
 * number.
 */
export const CHAT_MAX_DURATION_S = 120;

/**
 * What the PLATFORM actually enforces, which is the number that matters.
 *
 * The declared 120 was not honoured: that is the incident. Two observations
 * bracket the real ceiling - an 89.8s turn COMPLETED (so it is at or above
 * 90s) and a longer one was killed with a bodiless 504 (so it is below the
 * declared 120s). 100s sits inside that bracket, so it is safe under either
 * reading; it is INFERRED from those two observations, not read from the
 * dashboard. Note what the bracket already rules out: a 60s ceiling, since a
 * 89.8s turn returned successfully.
 *
 * THIS IS THE ONE NUMBER TO CONFIRM against the Vercel project settings, and
 * it is single-sourced precisely so that confirming it is a one-line edit. If
 * the plan changes, raise it here and CHAT_MAX_DURATION_S together; nothing
 * else in the codebase encodes a duration.
 */
export const PLATFORM_MAX_DURATION_S = 100;

/**
 * The budget a turn actually has: the smaller of what we asked for and what we
 * are given. Written as a min so that lowering the declared duration (a
 * deliberate choice) tightens the budget, while raising it past the platform
 * ceiling (the mistake that caused the incident) does nothing at all.
 */
export const TURN_BUDGET_MS =
  Math.min(CHAT_MAX_DURATION_S, PLATFORM_MAX_DURATION_S) * 1000;

/**
 * Headroom between our deadline and the platform's. It has to cover the work
 * that happens AFTER we decide to stop: closing every open column through the
 * wire format, flushing the last events, and closing the stream. A margin that
 * is too small turns a graceful close back into a 504, which is the failure
 * this whole module exists to prevent, so it is generous rather than tight.
 */
export const TURN_SAFETY_MARGIN_MS = 8_000;

/** The absolute moment a turn started at `startedAtMs` must be finished by. */
export function turnDeadlineFrom(startedAtMs: number): number {
  return startedAtMs + TURN_BUDGET_MS - TURN_SAFETY_MARGIN_MS;
}

/** Budget left, in ms. Negative once the deadline has passed. */
export function remainingMs(
  deadlineMs: number,
  now: number = Date.now(),
): number {
  return deadlineMs - now;
}

// ─── the re-ask decision ────────────────────────────────────────────────────

/**
 * How much budget a SECOND full generation needs before starting one is
 * defensible.
 *
 * From the incident's own timings: single-attempt turns in that session took
 * 33.7s and 34.2s, and the repaired turn (two generations) totalled 89.8s. A
 * re-ask is a full generation with a longer context, so it does not fit in
 * less than roughly half a minute. Starting one with 20s left does not produce
 * a better answer; it produces no answer at all, because the platform kills
 * the function mid-rewrite and the FIRST answer - which was already finished
 * and only cosmetically wrong - is lost with it.
 *
 * The asymmetry is the whole argument: a first answer with a lint violation is
 * worth vastly more than a rewrite that never lands.
 */
export const MIN_REASK_BUDGET_MS = 35_000;

/**
 * May a second generation be started right now?
 *
 * `undefined` means NO DEADLINE WAS GIVEN, and that answers true unconditionally:
 * the frozen exam and the eval-generation route call the repair round without a
 * budget, and their behaviour must stay byte-identical to what produced the
 * frozen numbers. Deadline-awareness is a property of the CHAT turn, not of the
 * round.
 */
export function hasBudgetForReask(
  deadlineMs: number | undefined,
  now: number = Date.now(),
): boolean {
  if (deadlineMs === undefined) return true;
  return remainingMs(deadlineMs, now) >= MIN_REASK_BUDGET_MS;
}

// ─── what the reviewer is told ──────────────────────────────────────────────

/**
 * The closing note on a column the deadline cut short. Plain language, states
 * what happened, says the text above is real and partial, and names the one
 * action that helps. It rides the `reply` event's existing `error` field, so
 * every client already routes it somewhere visible - and the reply's `text`
 * carries the partial answer, so the column is never an empty red card.
 */
export const TURN_CUTOFF_NOTICE =
  "The platform time limit cut this answer short. What you see above is what arrived before the cutoff, not the whole answer. A shorter question, or a long passage split in two, will come back complete.";

/**
 * The note on a column whose serving lint found violations with too little
 * budget left to rewrite. The first answer is kept and shown; this says why it
 * was not rewritten, so a reviewer is never quietly served an answer the
 * checker had already objected to.
 */
export const REASK_SKIPPED_NOTICE =
  "there was not enough time left in this turn to rewrite it";

// ─── long input, before it is ever sent ─────────────────────────────────────

/**
 * Where a pasted passage stops being a question and starts being a workload.
 *
 * A long input drives BOTH halves of the cost: retrieval breadth (every
 * content word is a lexicon lookup) and generation length (a translation is as
 * long as its source). 800 characters is roughly 130 words - past the length
 * of any question in the frozen bank, and about where the incident's paragraph
 * sat.
 *
 * The check WARNS and never blocks. Truncating a researcher's input silently
 * would be worse than the 504: she would get a confident answer to a question
 * she did not ask.
 */
export const LONG_INPUT_WARN_CHARS = 800;

export function isLongChatInput(text: string): boolean {
  return text.trim().length > LONG_INPUT_WARN_CHARS;
}

/**
 * The pre-flight warning, or null when the input is a normal question. The
 * length is measured from the text in front of the reviewer, never written
 * into the copy as a fixed figure.
 */
export function longInputNotice(text: string): string | null {
  if (!isLongChatInput(text)) return null;
  return `This passage is ${text.trim().length.toLocaleString("en-US")} characters. Long passages take longer to retrieve for and longer to answer, and can run past the platform time limit before the answer is finished. Sending it in a few shorter parts is more likely to come back complete. You can send it as it is.`;
}

// ─── the alarm ──────────────────────────────────────────────────────────────

/**
 * A cancellable "the deadline has arrived" promise.
 *
 * Injected timer functions so a test can drive it, and `cancel` is mandatory
 * rather than optional: an uncancelled timer holds the Node event loop open
 * for the length of the budget, which would make every request keep a worker
 * alive for a minute and a half after it finished answering.
 */
export function deadlineAlarm(
  deadlineMs: number,
  now: () => number = Date.now,
): { reached: Promise<"deadline">; cancel: () => void } {
  let cancel = () => {};
  const reached = new Promise<"deadline">((resolve) => {
    const id = setTimeout(
      () => resolve("deadline"),
      Math.max(0, deadlineMs - now()),
    );
    cancel = () => clearTimeout(id);
  });
  return { reached, cancel };
}
