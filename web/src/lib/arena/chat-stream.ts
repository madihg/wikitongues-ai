/**
 * Wire protocol for the streaming chat route: newline-delimited JSON, one
 * event per line, multiplexing several models' token streams over a single
 * HTTP response.
 *
 * WHY NDJSON AND NOT ONE RESPONSE PER MODEL
 * -----------------------------------------
 * The chat page asks up to MAX_CHAT_MODELS candidates the same question at
 * once, and the comparison is side by side. One buffered JSON response meant
 * the reviewer stared at "Asking 4 models..." until the SLOWEST provider
 * finished - measured as the whole perceived latency of the rag-v3 arm,
 * because retrieval plus a long system prompt makes first-token slow and
 * full-completion much slower. Streaming deltas per model lets every column
 * fill as its provider produces tokens; the `reply` event carries the exact
 * Reply object the buffered contract used, so the finished exchange is
 * byte-identical to what the old route returned, just delivered sooner.
 *
 * The route writes events with encodeChatEvent; the client feeds raw fetch
 * chunks through ChatStreamParser, which owns the only subtle part: a chunk
 * boundary can fall mid-line, so partial trailing lines are carried over.
 *
 * THE `revision` EVENT AND BACKWARD COMPATIBILITY
 * ----------------------------------------------
 * The rag-v4-1 column runs a deterministic repair round (repair-round.ts): its
 * first attempt is checked, and a dirty one is re-asked ONCE, with the second
 * answer served. It used to be delivered BUFFERED for that reason - which made
 * the default-selected model the one column that showed nothing for 30-60s
 * while two full generations ran. It now streams both attempts, and `revision`
 * is the seam: emitted between them, it names the rule families the first
 * attempt broke and tells the client the deltas that follow REPLACE the column
 * rather than extend it.
 *
 * The event is additive on purpose. A client that has never heard of it drops
 * the line (parseLine ignores unknown types), appends the second attempt's
 * deltas to the first attempt's text, and is then CORRECTED by the closing
 * `reply` event, which carries the repaired text and replaces the column
 * wholesale. Old clients see a flicker of doubled text; they never end up with
 * the wrong transcript.
 */

/** One model's finished column - the same shape the buffered route returned. */
export interface ChatReply {
  slug: string;
  name: string;
  text: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  retrievedChunks: number;
  retrievedExemplars: number;
  error: string | null;
}

/**
 * What one column is doing right now, when that is not visible as text.
 *
 * Tokens narrate themselves - a column that is streaming needs no announcement.
 * The gaps do: the seconds before the first token, and (on the rag-v4-1 arm)
 * the pause between a finished first attempt and the repaired one while the
 * serving lint runs. Those are the windows where a reviewer stares at an empty
 * panel and concludes the page is broken, so the route names them.
 *
 * `retrieving` is emitted by a route that builds context inside the stream;
 * this one builds it BEFORE the response head (so the durations can ride in the
 * Server-Timing header, see server-timing.ts), and the client derives the same
 * phase from "request sent, nothing back yet" - the identical window.
 */
export type ColumnStage = "retrieving" | "writing" | "checking" | "revising";

export type ChatStreamEvent =
  /** A token (or token batch) from one model, append to its column. */
  | { type: "delta"; slug: string; text: string }
  /**
   * This column's finished first attempt broke the serving lint.
   *
   * `applied` absent (the ordinary case, and what every server before the turn
   * budget existed sent): a repaired second attempt is about to stream, so
   * DISCARD what has accumulated, show the reasons, and treat the deltas that
   * follow as the column's text.
   *
   * `applied: false`: the turn ran out of budget for a second generation, so
   * the first attempt STANDS. KEEP the accumulated text and show the reasons
   * beside it. Absence meaning "applied" is what makes the field additive: a
   * client that ignores it behaves exactly as it did before, and is corrected
   * by the closing `reply` event, which carries the kept first answer.
   */
  | { type: "revision"; slug: string; reasons: string[]; applied?: boolean }
  /**
   * Advisory progress marker for one column. Carries a fixed enum and a slug,
   * never text - a client may ignore it entirely and lose nothing but the
   * status line.
   */
  | { type: "stage"; slug: string; stage: ColumnStage }
  /** One model finished (or failed - then reply.error is set). */
  | { type: "reply"; reply: ChatReply };

/** The stage values a wire line may legally carry. */
const COLUMN_STAGES: readonly string[] = [
  "retrieving",
  "writing",
  "checking",
  "revising",
];

/** One event as a wire line, newline-terminated. */
export function encodeChatEvent(event: ChatStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Incremental NDJSON reader. Feed it raw text chunks in arrival order; it
 * returns the complete events in each chunk and buffers any trailing partial
 * line until the rest arrives. flush() surfaces a final unterminated line
 * (a well-behaved server never produces one, but truncation must not eat an
 * event silently).
 */
export class ChatStreamParser {
  private buffer = "";

  push(chunk: string): ChatStreamEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.flatMap((line) => parseLine(line));
  }

  flush(): ChatStreamEvent[] {
    const rest = this.buffer;
    this.buffer = "";
    return parseLine(rest);
  }
}

/**
 * One chat column's live state: the accumulated text while its model streams,
 * then the authoritative final reply once the `reply` event lands.
 */
export interface StreamingReply extends ChatReply {
  done: boolean;
  /**
   * Plain-language rule families the first attempt broke, once a `revision`
   * event has landed for this column; null while no revision has happened.
   * Survives the closing `reply` event so the finished column can still say it
   * was rewritten - the reply event itself stays exactly the buffered ChatReply
   * contract and carries no repair fields.
   */
  revisedFor: string[] | null;
  /**
   * Whether the revision named in `revisedFor` was actually carried out. False
   * only when the turn ran out of budget for the rewrite, in which case the
   * text here IS the flagged first attempt and the reader must be told so.
   * Meaningless while `revisedFor` is null; true then, so the ordinary case
   * needs no special reading.
   */
  revisionApplied: boolean;
}

/** Fresh columns for one exchange, in the order the models were selected. */
export function initStreamingReplies(
  models: { slug: string; name: string }[],
): StreamingReply[] {
  return models.map((m) => ({
    slug: m.slug,
    name: m.name,
    text: "",
    latencyMs: 0,
    tokensIn: null,
    tokensOut: null,
    retrievedChunks: 0,
    retrievedExemplars: 0,
    error: null,
    done: false,
    revisedFor: null,
    revisionApplied: true,
  }));
}

/**
 * Fold a batch of stream events into the columns. Pure and immutable (returns
 * new objects) so it can be handed straight to a React state update. The
 * closing `reply` event REPLACES the accumulated column: the server's final
 * text is authoritative, so a dropped delta costs a flicker, never a wrong
 * transcript.
 *
 * `revision` is the other replacement point: the repair round's first attempt
 * is discarded in favour of the second, so the accumulated text is cleared and
 * the reasons recorded. The reasons then RIDE THROUGH the closing reply event
 * (which knows nothing about repairs) so a finished column can still show why
 * it was rewritten. A revision carrying `applied: false` is the exception -
 * the turn ran out of budget for the rewrite, so the text stays and the
 * reasons become an annotation on it rather than an epitaph for it.
 */
export function applyChatEvents(
  replies: StreamingReply[],
  events: ChatStreamEvent[],
): StreamingReply[] {
  if (events.length === 0) return replies;
  const bySlug = new Map(replies.map((r) => [r.slug, { ...r }]));
  for (const ev of events) {
    if (ev.type === "delta") {
      const r = bySlug.get(ev.slug);
      if (r && !r.done) r.text += ev.text;
    } else if (ev.type === "revision") {
      const r = bySlug.get(ev.slug);
      if (r && !r.done) {
        // The text is discarded ONLY when the rewrite is actually happening.
        // A revision the server could not act on for lack of time leaves the
        // column exactly as it is: that text is the answer now, and clearing
        // it would blank a column whose content is the best we will get.
        const applied = ev.applied !== false;
        if (applied) r.text = "";
        r.revisedFor = ev.reasons;
        r.revisionApplied = applied;
      }
    } else if (ev.type === "reply") {
      const r = bySlug.get(ev.reply.slug);
      if (r)
        bySlug.set(ev.reply.slug, {
          ...ev.reply,
          done: true,
          revisedFor: r.revisedFor,
          revisionApplied: r.revisionApplied,
        });
    }
    // Anything else - a `stage` marker, or an event type a newer server sends
    // that this build has never heard of - changes no column text. Matching on
    // the KNOWN types and ignoring the rest is what makes the protocol
    // extensible.
    //
    // The previous shape was `else { ...ev.reply.slug }`, which threw on
    // anything that was not a delta. That was never REACHABLE from the wire -
    // parseLine has always dropped unknown types, so the fold only ever saw
    // delta and reply, and no deployed client crashes on the new events (pinned
    // in chat-stream.test.ts and end to end in the chat route's own test). It
    // was reachable from a hand-built event array, which is how a future caller
    // would have found it. Matching explicitly closes that, and costs nothing.
  }
  return replies.map((r) => bySlug.get(r.slug) as StreamingReply);
}

/**
 * The stream died (network drop, aborted response) - mark every column that
 * never got its `reply` event as failed, keeping the columns that DID finish.
 * Partial results are the point of streaming; a mid-stream error must not
 * wipe the three answers that already landed.
 */
export function failPendingReplies(
  replies: StreamingReply[],
  message: string,
): StreamingReply[] {
  return replies.map((r) =>
    r.done ? r : { ...r, done: true, error: message },
  );
}

function parseLine(line: string): ChatStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as ChatStreamEvent;
    if (parsed.type === "delta" || parsed.type === "reply") return [parsed];
    // A revision with a malformed reasons list is still a revision: the
    // replacement semantics matter, the wording is decoration.
    if (parsed.type === "revision") {
      const revision: ChatStreamEvent = {
        type: "revision",
        slug: parsed.slug,
        reasons: Array.isArray(parsed.reasons)
          ? parsed.reasons.filter((r): r is string => typeof r === "string")
          : [],
      };
      // Only an EXPLICIT false is carried. Anything else - absent, junk, a
      // literal true - normalizes to the historical meaning (the text is
      // superseded), so an old server's lines parse to exactly the objects
      // they parsed to before the field existed.
      if (parsed.applied === false) revision.applied = false;
      return [revision];
    }
    if (
      parsed.type === "stage" &&
      typeof parsed.slug === "string" &&
      COLUMN_STAGES.includes(parsed.stage)
    )
      return [parsed];
    // An unrecognised type is DROPPED, not thrown on: the protocol is additive,
    // and a client one deploy behind the server must degrade to "I saw fewer
    // events", never to a dead stream.
    return [];
  } catch {
    // A malformed line (e.g. proxy truncation) is dropped rather than
    // poisoning the whole stream; the reply event is what finalizes a column,
    // so a lost delta costs a flicker, not correctness.
    return [];
  }
}
