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

export type ChatStreamEvent =
  /** A token (or token batch) from one model, append to its column. */
  | { type: "delta"; slug: string; text: string }
  /** One model finished (or failed - then reply.error is set). */
  | { type: "reply"; reply: ChatReply };

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
  }));
}

/**
 * Fold a batch of stream events into the columns. Pure and immutable (returns
 * new objects) so it can be handed straight to a React state update. The
 * closing `reply` event REPLACES the accumulated column: the server's final
 * text is authoritative, so a dropped delta costs a flicker, never a wrong
 * transcript.
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
    } else {
      const r = bySlug.get(ev.reply.slug);
      if (r) bySlug.set(ev.reply.slug, { ...ev.reply, done: true });
    }
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
    return [];
  } catch {
    // A malformed line (e.g. proxy truncation) is dropped rather than
    // poisoning the whole stream; the reply event is what finalizes a column,
    // so a lost delta costs a flicker, not correctness.
    return [];
  }
}
