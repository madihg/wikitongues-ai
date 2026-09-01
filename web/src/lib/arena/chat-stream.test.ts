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

  it("round-trips a revision event", () => {
    const event: ChatStreamEvent = {
      type: "revision",
      slug: "a",
      reasons: ["letters that are not in the Igala alphabet"],
    };
    const parser = new ChatStreamParser();
    expect(parser.push(encodeChatEvent(event))).toEqual([event]);
  });

  it("keeps a revision whose reasons list is missing or junk", () => {
    // The replacement semantics are what matter; the wording is decoration, so
    // a mangled reasons field must not turn into a dropped revision - that
    // would leave the client appending the repaired answer to the discarded
    // one until the reply event lands.
    const parser = new ChatStreamParser();
    expect(parser.push('{"type":"revision","slug":"a"}\n')).toEqual([
      { type: "revision", slug: "a", reasons: [] },
    ]);
    expect(
      parser.push('{"type":"revision","slug":"a","reasons":[1,"kept"]}\n'),
    ).toEqual([{ type: "revision", slug: "a", reasons: ["kept"] }]);
  });
});

/**
 * Chunk boundaries are chosen by the network, not by us: a fetch reader can
 * split anywhere, including inside a multi-byte Igala character's JSON escape
 * or between the two halves of a revision event. 500 seeded trials over a
 * wire that contains every event type, each trial cut at random points, all
 * asserting the same thing: the parsed event sequence equals what was written.
 * Seeded so a failure is reproducible rather than a Heisenbug.
 */
describe("ChatStreamParser under randomized chunk boundaries", () => {
  /** mulberry32 - tiny, deterministic, good enough for split points. */
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const events: ChatStreamEvent[] = [
    { type: "delta", slug: "a", text: "Ọ́jọ́ " },
    { type: "delta", slug: "b", text: "neighbour tokens" },
    { type: "delta", slug: "a", text: "é-jẹu ádṣa" },
    {
      type: "revision",
      slug: "a",
      reasons: [
        "letters that are not in the Igala alphabet",
        "a hyphenated prefix Igala does not use",
      ],
    },
    { type: "delta", slug: "a", text: "Wọla\nọdudu" },
    { type: "reply", reply: reply("a", { text: "Wọla\nọdudu" }) },
    { type: "reply", reply: reply("b", { text: "neighbour tokens" }) },
  ];
  const wire = events.map(encodeChatEvent).join("");

  it("parses the identical event sequence for 500 random splittings", () => {
    for (let trial = 0; trial < 500; trial++) {
      const next = rng(trial + 1);
      const parser = new ChatStreamParser();
      const collected: ChatStreamEvent[] = [];
      let i = 0;
      while (i < wire.length) {
        // 1..8 characters at a time, so boundaries land inside JSON keys,
        // inside escaped newlines, and between combining marks.
        const size = 1 + Math.floor(next() * 8);
        collected.push(...parser.push(wire.slice(i, i + size)));
        i += size;
      }
      collected.push(...parser.flush());
      expect(collected, `trial ${trial}`).toEqual(events);
    }
  });

  it("folds to the same final columns however the wire was split", () => {
    const models = [
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ];
    for (let trial = 0; trial < 500; trial++) {
      const next = rng(trial + 1001);
      const parser = new ChatStreamParser();
      let replies = initStreamingReplies(models);
      let i = 0;
      while (i < wire.length) {
        const size = 1 + Math.floor(next() * 8);
        replies = applyChatEvents(
          replies,
          parser.push(wire.slice(i, i + size)),
        );
        i += size;
      }
      replies = applyChatEvents(replies, parser.flush());
      expect(replies[0].text, `trial ${trial}`).toBe("Wọla\nọdudu");
      expect(replies[0].revisedFor).toHaveLength(2);
      expect(replies[0].done).toBe(true);
      expect(replies[1].text).toBe("neighbour tokens");
      expect(replies[1].revisedFor).toBeNull();
    }
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

  it("folds a column that emits only a reply (no deltas) - still lands complete", () => {
    // Not the chat path any more, but the wire still allows it: a `reply` with
    // no prior deltas is a degenerate stream, and it must land the column
    // complete while a streaming neighbour is mid-flight.
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "b", text: "streaming neighbour" },
      {
        type: "reply",
        reply: reply("a", { text: "Wọla ọdudu", latencyMs: 4200 }),
      },
    ]);
    expect(replies[0].text).toBe("Wọla ọdudu");
    expect(replies[0].done).toBe(true);
    expect(replies[0].error).toBeNull();
    expect(replies[0].latencyMs).toBe(4200);
    expect(replies[1].text).toBe("streaming neighbour");
    expect(replies[1].done).toBe(false);
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

/**
 * The rag-v4-1 column: streamed like every other, with the repair round
 * applied AFTER the first attempt rather than before anything is shown. The
 * fold is what makes that safe, so it carries the whole contract.
 */
describe("applyChatEvents - the rag-v4-1 repair-round column", () => {
  const models = [
    { slug: "v41", name: "Gemini + v4.1" },
    { slug: "n", name: "Neighbour" },
  ];

  it("a clean answer behaves exactly like any other streaming column", () => {
    // No violations, so no revision event is ever emitted: deltas, then reply.
    // Indistinguishable from a plain streaming arm, which is the point - the
    // repair round costs nothing visible when it finds nothing.
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "Wọla " },
      { type: "delta", slug: "v41", text: "ọdudu" },
    ]);
    expect(replies[0].text).toBe("Wọla ọdudu");
    expect(replies[0].done).toBe(false);
    expect(replies[0].revisedFor).toBeNull();

    replies = applyChatEvents(replies, [
      { type: "reply", reply: reply("v41", { text: "Wọla ọdudu" }) },
    ]);
    expect(replies[0].text).toBe("Wọla ọdudu");
    expect(replies[0].done).toBe(true);
    expect(replies[0].revisedFor).toBeNull();
  });

  it("a dirty answer is discarded on revision and replaced by the repaired stream", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "é-jẹu " },
      { type: "delta", slug: "v41", text: "ádṣa" },
      { type: "delta", slug: "n", text: "neighbour keeps going" },
    ]);
    expect(replies[0].text).toBe("é-jẹu ádṣa");

    // The revision event: everything read so far is superseded.
    replies = applyChatEvents(replies, [
      {
        type: "revision",
        slug: "v41",
        reasons: [
          "letters that are not in the Igala alphabet",
          "a hyphenated prefix Igala does not use",
        ],
      },
    ]);
    expect(replies[0].text).toBe("");
    expect(replies[0].done).toBe(false);
    expect(replies[0].revisedFor).toEqual([
      "letters that are not in the Igala alphabet",
      "a hyphenated prefix Igala does not use",
    ]);
    // The neighbour is untouched by another column's revision.
    expect(replies[1].text).toBe("neighbour keeps going");
    expect(replies[1].revisedFor).toBeNull();

    // The repaired attempt REPLACES rather than extends, and the closing
    // reply lands the repaired text - what the exam would have measured.
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "Jẹñwu " },
      { type: "delta", slug: "v41", text: "aja" },
      {
        type: "reply",
        reply: reply("v41", { text: "Jẹñwu aja", latencyMs: 9000 }),
      },
    ]);
    expect(replies[0].text).toBe("Jẹñwu aja");
    expect(replies[0].done).toBe(true);
    // Latency sums both attempts, as generateWithRepairRound reports it.
    expect(replies[0].latencyMs).toBe(9000);
    // The reason survives the reply event, so a finished column can still say
    // it was rewritten.
    expect(replies[0].revisedFor).toHaveLength(2);
  });

  it("an OLD client that ignores the revision event still ends on the repaired text", () => {
    // Backward compatibility, spelled out: drop every revision event (what a
    // client built before this event existed does), and the fold appends the
    // repaired attempt to the discarded one - wrong mid-flight, corrected by
    // the authoritative reply event.
    const wire: ChatStreamEvent[] = [
      { type: "delta", slug: "v41", text: "é-jẹu ádṣa" },
      { type: "revision", slug: "v41", reasons: ["ignored by an old client"] },
      { type: "delta", slug: "v41", text: "Jẹñwu aja" },
      { type: "reply", reply: reply("v41", { text: "Jẹñwu aja" }) },
    ];
    const asOldClient = wire.filter((e) => e.type !== "revision");
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, asOldClient);
    expect(replies[0].text).toBe("Jẹñwu aja");
    expect(replies[0].done).toBe(true);
    expect(replies[0].revisedFor).toBeNull();
  });

  it("a death during the SECOND attempt fails only that column", () => {
    // The repaired generation threw (provider hiccup on the re-ask). The route
    // catches per candidate and emits an error reply for that column only; the
    // neighbour's landed answer and the still-streaming third column are
    // untouched.
    const three = [...models, { slug: "c", name: "C" }];
    let replies = initStreamingReplies(three);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "é-jẹu ádṣa" },
      { type: "reply", reply: reply("n", { text: "neighbour finished" }) },
      { type: "revision", slug: "v41", reasons: ["a rule family"] },
      { type: "delta", slug: "c", text: "third column mid-flight" },
      {
        type: "reply",
        reply: reply("v41", { text: "", error: "provider 503 on the re-ask" }),
      },
    ]);
    expect(replies[0].error).toBe("provider 503 on the re-ask");
    expect(replies[0].done).toBe(true);
    expect(replies[0].text).toBe("");
    expect(replies[0].revisedFor).toEqual(["a rule family"]);
    expect(replies[1].text).toBe("neighbour finished");
    expect(replies[1].error).toBeNull();
    expect(replies[2].text).toBe("third column mid-flight");
    expect(replies[2].done).toBe(false);
  });

  it("a connection drop during the SECOND attempt fails only the unfinished column", () => {
    // Harsher: the whole response is cut while the repaired attempt streams.
    // failPendingReplies must fail the revising column and keep the answers
    // that already landed, revision reason and all.
    const three = [...models, { slug: "c", name: "C" }];
    let replies = initStreamingReplies(three);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "é-jẹu ádṣa" },
      { type: "revision", slug: "v41", reasons: ["a rule family"] },
      { type: "delta", slug: "v41", text: "Jẹñ" },
      { type: "reply", reply: reply("n", { text: "neighbour finished" }) },
      { type: "reply", reply: reply("c", { text: "third finished" }) },
    ]);
    const failed = failPendingReplies(replies, "Response ended early");
    expect(failed[0].error).toBe("Response ended early");
    expect(failed[0].revisedFor).toEqual(["a rule family"]);
    expect(failed[1].text).toBe("neighbour finished");
    expect(failed[1].error).toBeNull();
    expect(failed[2].text).toBe("third finished");
    expect(failed[2].error).toBeNull();
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

describe("the stage event and unknown event types", () => {
  it("round-trips a stage marker through encode and parse", () => {
    const parser = new ChatStreamParser();
    const events = parser.push(
      encodeChatEvent({ type: "stage", slug: "a", stage: "checking" }),
    );
    expect(events).toEqual([{ type: "stage", slug: "a", stage: "checking" }]);
  });

  it("drops a stage line whose stage is not one of the known values", () => {
    const parser = new ChatStreamParser();
    expect(
      parser.push('{"type":"stage","slug":"a","stage":"vibing"}\n'),
    ).toEqual([]);
    expect(parser.push('{"type":"stage","stage":"writing"}\n')).toEqual([]);
  });

  it("drops a line whose type this build has never heard of", () => {
    // Forward compatibility: a client one deploy behind a newer server must
    // degrade to seeing fewer events, never to a dead stream.
    const parser = new ChatStreamParser();
    expect(parser.push('{"type":"usage","slug":"a","tokens":42}\n')).toEqual(
      [],
    );
    // ...and the next real event still lands.
    expect(parser.push('{"type":"delta","slug":"a","text":"hi"}\n')).toEqual([
      { type: "delta", slug: "a", text: "hi" },
    ]);
  });

  it("leaves the columns untouched for a stage or unknown event", () => {
    const replies = initStreamingReplies([{ slug: "a", name: "A" }]);
    const after = applyChatEvents(replies, [
      { type: "stage", slug: "a", stage: "writing" },
      { type: "usage", slug: "a", tokens: 42 } as unknown as ChatStreamEvent,
    ]);
    // The fold must not reach for ev.reply on an event that has none.
    expect(after[0].text).toBe("");
    expect(after[0].done).toBe(false);
    expect(after[0].error).toBeNull();
  });
});
