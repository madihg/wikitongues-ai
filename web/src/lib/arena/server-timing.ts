/**
 * Server-Timing header construction for the arena chat route.
 *
 * WHY THIS IS A MODULE AND NOT A TEMPLATE STRING IN THE ROUTE
 * ----------------------------------------------------------
 * The header is the answer to the next "why is this slow" - it has to be
 * trustworthy and it has to be safe. Safe means one rule, enforced in one
 * place: a Server-Timing entry here is a NAME and a DURATION, never a `desc`.
 * `desc` is the field that carries free text, and the only free text in reach
 * of this route is the reviewer's question and the candidate registry - a
 * prompt fragment or a model id in a response header would be leaked to every
 * proxy and browser extension on the path. Names come from a fixed allowlist
 * shape (`^[a-z][a-z0-9-]*$`), so anything derived from caller input fails the
 * pattern and is dropped rather than emitted.
 *
 * WHAT CAN AND CANNOT BE IN THIS HEADER
 * -------------------------------------
 * The chat response streams NDJSON, so the response HEAD is flushed before any
 * provider has produced a byte. Everything measurable before that point - auth,
 * the candidate lookup, each version's retrieval build, and their total - goes
 * in the header. Per-provider first-token and completion times physically
 * cannot: they happen after the headers are on the wire. Those are carried per
 * column instead (`reply.latencyMs` on the stream, and the live per-column
 * elapsed counter the chat UI renders), which is where a reader comparing two
 * columns wants them anyway.
 */

/** One measured server stage. `durMs` is milliseconds, rounded on the way out. */
export interface TimedStage {
  name: ServerTimingStageName;
  durMs: number;
}

/**
 * Every stage name this route may emit. Fixed and exhaustive: the header's
 * shape does not vary with which models were selected, so the set of names
 * cannot be read as a description of the request.
 */
export const SERVER_TIMING_STAGE_NAMES = [
  "auth",
  "candidates",
  "retrieval-v1",
  "retrieval-v2",
  "retrieval-v4",
  "total",
] as const;

export type ServerTimingStageName = (typeof SERVER_TIMING_STAGE_NAMES)[number];

const ALLOWED_NAMES: ReadonlySet<string> = new Set(SERVER_TIMING_STAGE_NAMES);

/**
 * Render stages as a Server-Timing header value. Entries whose name is not on
 * the allowlist, or whose duration is not a real measurement, are DROPPED.
 *
 * The check is an ALLOWLIST and not a shape test on purpose. A pattern like
 * "lowercase letters, digits and hyphens" reads as strict and lets
 * `gpt-4o-igala-rag-v4-1` straight through - candidate slugs are exactly that
 * shape, and a stage timed per candidate is the most natural next change
 * anyone would make to this route. Enumerating the six stage names is the only
 * version of this guard that survives that change.
 */
export function formatServerTiming(stages: readonly TimedStage[]): string {
  const parts: string[] = [];
  for (const stage of stages) {
    if (!ALLOWED_NAMES.has(stage.name)) continue;
    if (!Number.isFinite(stage.durMs) || stage.durMs < 0) continue;
    parts.push(`${stage.name};dur=${Math.round(stage.durMs)}`);
  }
  return parts.join(", ");
}

/**
 * Time one awaited stage. Returns the value and reports the elapsed ms through
 * `report`, including when the promise rejects - a stage that failed slowly is
 * the most interesting measurement there is.
 */
export async function timeStage<T>(
  fn: () => Promise<T>,
  report: (durMs: number) => void,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    report(Date.now() - start);
  }
}
