import { describe, it, expect } from "vitest";
import {
  ChatStreamParser,
  applyChatEvents,
  encodeChatEvent,
  failPendingReplies,
  initStreamingReplies,
  type ChatReply,
  type ChatStreamEvent,
} from "./chat-stream";

/**
 * The wire protocol between the streaming chat route and the reviewer's
 * browser. What the tests must hold it to: no event may be lost or corrupted
 * by chunk boundaries (fetch delivers arbitrary splits, including mid-JSON
 * and mid-multibyte-line), and the client-side fold must end every column in
 * the exact Reply the server declared final.
 */

const reply = (slug: string, over: Partial<ChatReply> = {}): ChatReply => ({
  slug,
  name: slug.toUpperCase(),
  text: "final text",
  latencyMs: 1234,
  tokensIn: 10,
  tokensOut: 20,
  retrievedChunks: 3,
  retrievedExemplars: 8,
  error: null,
  ...over,
});

describe("encodeChatEvent / ChatStreamParser round trip", () => {
  it("parses events fed in exactly one chunk per line", () => {
    const events: ChatStreamEvent[] = [
      { type: "delta", slug: "a", text: "Ómi" },
      { type: "reply", reply: reply("a") },
    ];
    const parser = new ChatStreamParser();
    const out = events.flatMap((e) => parser.push(encodeChatEvent(e)));
    expect(out).toEqual(events);
    expect(parser.flush()).toEqual([]);
  });

  it("survives a chunk boundary falling mid-line", () => {
    const wire =
      encodeChatEvent({ type: "delta", slug: "a", text: "ọ́kọ" }) +
      encodeChatEvent({ type: "delta", slug: "b", text: "second" });
    const parser = new ChatStreamParser();
    const collected: ChatStreamEvent[] = [];
    // Split at every third character - boundaries land inside JSON keys,
    // inside the Igala diacritics, everywhere.
    for (let i = 0; i < wire.length; i += 3) {
      collected.push(...parser.push(wire.slice(i, i + 3)));
    }
    collected.push(...parser.flush());
    expect(collected).toEqual([
      { type: "delta", slug: "a", text: "ọ́kọ" },
      { type: "delta", slug: "b", text: "second" },
    ]);
  });

  it("preserves newlines inside a delta payload (JSON escapes them)", () => {
    const event: ChatStreamEvent = {
      type: "delta",
      slug: "a",
      text: "line one\nline two",
    };
    const parser = new ChatStreamParser();
    expect(parser.push(encodeChatEvent(event))).toEqual([event]);
  });

  it("drops a malformed line without poisoning later events", () => {
    const parser = new ChatStreamParser();
    const out = [
      ...parser.push('{"type":"delta","slug":"a","tex\n'),
      ...parser.push(encodeChatEvent({ type: "delta", slug: "a", text: "ok" })),
    ];
    expect(out).toEqual([{ type: "delta", slug: "a", text: "ok" }]);
  });
});

describe("applyChatEvents - the client-side fold", () => {
  const models = [
    { slug: "a", name: "Model A" },
    { slug: "b", name: "Model B" },
  ];

  it("accumulates deltas per column, leaving other columns untouched", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "a", text: "Ómi " },
      { type: "delta", slug: "a", text: "du" },
      { type: "delta", slug: "b", text: "other" },
    ]);
    expect(replies[0].text).toBe("Ómi du");
    expect(replies[0].done).toBe(false);
    expect(replies[1].text).toBe("other");
  });

  it("lets the final reply event replace the accumulated column verbatim", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "a", text: "partial that lost a chunk" },
      { type: "reply", reply: reply("a", { text: "the authoritative text" }) },
    ]);
    expect(replies[0].text).toBe("the authoritative text");
    expect(replies[0].done).toBe(true);
    expect(replies[0].latencyMs).toBe(1234);
    expect(replies[0].retrievedExemplars).toBe(8);
  });

  it("keeps column order stable whatever order models finish in", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "reply", reply: reply("b") },
      { type: "reply", reply: reply("a") },
    ]);
    expect(replies.map((r) => r.slug)).toEqual(["a", "b"]);
    expect(replies.every((r) => r.done)).toBe(true);
  });

  it("does not mutate its input - safe for React state updates", () => {
    const before = initStreamingReplies(models);
    const snapshot = JSON.parse(JSON.stringify(before));
    applyChatEvents(before, [{ type: "delta", slug: "a", text: "x" }]);
    expect(before).toEqual(snapshot);
  });

  it("ignores deltas for unknown slugs and deltas arriving after done", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "ghost", text: "??" },
      { type: "reply", reply: reply("a", { text: "done" }) },
      { type: "delta", slug: "a", text: "straggler" },
    ]);
    expect(replies).toHaveLength(2);
    expect(replies[0].text).toBe("done");
  });
});

describe("failPendingReplies - mid-stream death", () => {
  it("fails only the columns that never finished, keeping landed answers", () => {
    const models = [
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ];
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "reply", reply: reply("a", { text: "made it" }) },
      { type: "delta", slug: "b", text: "was still going" },
    ]);
    const failed = failPendingReplies(replies, "Response ended early");
    expect(failed[0].error).toBeNull();
    expect(failed[0].text).toBe("made it");
    expect(failed[1].error).toBe("Response ended early");
    expect(failed[1].done).toBe(true);
  });

  it("is a no-op on a fully finished exchange", () => {
    const replies = applyChatEvents(
      initStreamingReplies([{ slug: "a", name: "A" }]),
      [{ type: "reply", reply: reply("a") }],
    );
    expect(failPendingReplies(replies, "boom")).toEqual(replies);
  });
});
