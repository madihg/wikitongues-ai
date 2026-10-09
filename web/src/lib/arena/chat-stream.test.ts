import { describe, it, expect } from "vitest";
import {
  ChatStreamParser,
  allRepliesClosed,
  applyChatEvents,
  closedSlugs,
  createComposerLock,
  encodeChatEvent,
  failPendingReplies,
  initStreamingReplies,
  type ChatReply,
  type ChatStreamEvent,
} from "./chat-stream";
import { referenceFormReport } from "./reference-form";

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

/**
 * THE REVISION THAT COULD NOT BE APPLIED.
 *
 * When the turn's budget runs out before a rewrite could plausibly finish, the
 * route reports the violations anyway and marks the revision `applied: false`.
 * The two cases are opposites for the fold - one discards the column, the other
 * must not - so the distinction is pinned here rather than left to the reader
 * of a boolean.
 */
describe("applyChatEvents - a revision the server had no time to apply", () => {
  const models = [
    { slug: "v41", name: "Gemini + v4.1" },
    { slug: "n", name: "Neighbour" },
  ];

  it("KEEPS the streamed text and records why it was flagged", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "sooro " },
      { type: "delta", slug: "v41", text: "ada" },
      {
        type: "revision",
        slug: "v41",
        reasons: ["letters that are not in the Igala alphabet"],
        applied: false,
      },
    ]);
    // Clearing here would blank a column whose content is the best answer the
    // reviewer is going to get - the failure this whole change exists to stop.
    expect(replies[0].text).toBe("sooro ada");
    expect(replies[0].revisedFor).toEqual([
      "letters that are not in the Igala alphabet",
    ]);
    expect(replies[0].revisionApplied).toBe(false);
    expect(replies[1].text).toBe("");
    expect(replies[1].revisedFor).toBeNull();
  });

  it("carries the not-applied flag through the closing reply event", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "sooro ada" },
      {
        type: "revision",
        slug: "v41",
        reasons: ["letters that are not in the Igala alphabet"],
        applied: false,
      },
      { type: "reply", reply: reply("v41", { text: "sooro ada" }) },
    ]);
    expect(replies[0].text).toBe("sooro ada");
    expect(replies[0].done).toBe(true);
    // The finished column can still say the answer was flagged and why it was
    // not rewritten. The reply event itself knows nothing about repairs.
    expect(replies[0].revisedFor).toHaveLength(1);
    expect(replies[0].revisionApplied).toBe(false);
  });

  it("an ordinary revision still replaces, and still reads as applied", () => {
    let replies = initStreamingReplies(models);
    replies = applyChatEvents(replies, [
      { type: "delta", slug: "v41", text: "sooro ada" },
      { type: "revision", slug: "v41", reasons: ["a rule family"] },
    ]);
    expect(replies[0].text).toBe("");
    expect(replies[0].revisionApplied).toBe(true);
  });

  it("defaults to applied for a fresh column, so the flag needs no null check", () => {
    expect(initStreamingReplies(models)[0].revisionApplied).toBe(true);
  });
});

describe("the applied flag on the wire", () => {
  it("round-trips an explicit false", () => {
    const event: ChatStreamEvent = {
      type: "revision",
      slug: "a",
      reasons: ["letters that are not in the Igala alphabet"],
      applied: false,
    };
    const parser = new ChatStreamParser();
    expect(parser.push(encodeChatEvent(event))).toEqual([event]);
  });

  it("normalizes anything that is not an explicit false to the old meaning", () => {
    // Absence is the historical wire: a server that predates the turn budget
    // must parse to exactly the object it always parsed to, with no flag to
    // reason about.
    const parser = new ChatStreamParser();
    for (const line of [
      '{"type":"revision","slug":"a","reasons":["x"]}\n',
      '{"type":"revision","slug":"a","reasons":["x"],"applied":true}\n',
      '{"type":"revision","slug":"a","reasons":["x"],"applied":"maybe"}\n',
    ]) {
      expect(parser.push(line)).toEqual([
        { type: "revision", slug: "a", reasons: ["x"] },
      ]);
    }
  });
});

/**
 * THE REFERENCE EVENT: the second pass's rendering, delivered after the
 * column has closed, with what the pass cost. The fold must accept it on a
 * done column (the one place `done` is not a bar), the reply must not erase
 * it whichever order the two arrive in, a line with junk numbers or a junk
 * report keeps its text and loses only the junk, and a client that has never
 * heard of it must see nothing change.
 */
describe("the reference event", () => {
  const report = referenceFormReport("Ma k'ọla wa", "Mà kí ọ́lá wà");
  const reference = (over: Record<string, unknown> = {}): ChatStreamEvent =>
    ({
      type: "reference",
      slug: "a",
      text: "Mà kí ọ́lá wà",
      report,
      latencyMs: 4200,
      tokensIn: 300,
      tokensOut: 50,
      ...over,
    }) as ChatStreamEvent;
  const closed = (text: string): ChatStreamEvent => ({
    type: "reply",
    reply: reply("a", { name: "A", text }),
  });

  it("round-trips through encode and parse, cost and report included", () => {
    const parser = new ChatStreamParser();
    expect(parser.push(encodeChatEvent(reference()))).toEqual([reference()]);
  });

  it("keeps the text when the report or the numbers are unreadable", () => {
    const parser = new ChatStreamParser();
    const line = (over: Record<string, unknown>) =>
      encodeChatEvent(reference(over));
    expect(parser.push(line({ report: "junk" }))).toEqual([
      reference({ report: null }),
    ]);
    // A report whose lists are not lists of strings is not a report.
    expect(parser.push(line({ report: { ...report, dropped: [1] } }))).toEqual([
      reference({ report: null }),
    ]);
    expect(
      parser.push(line({ latencyMs: "slow", tokensIn: null, tokensOut: 7 })),
    ).toEqual([reference({ latencyMs: null, tokensIn: null, tokensOut: 7 })]);
  });

  it("drops a line with no text", () => {
    const parser = new ChatStreamParser();
    expect(parser.push(encodeChatEvent(reference({ text: undefined })))).toEqual(
      [],
    );
  });

  it("lands on a column that has already closed, leaving the answer untouched", () => {
    const after = applyChatEvents(
      initStreamingReplies([{ slug: "a", name: "A" }]),
      [
        { type: "delta", slug: "a", text: "Ma k'ọla wa" },
        closed("Ma k'ọla wa"),
        reference(),
      ],
    );
    expect(after[0].done).toBe(true);
    expect(after[0].text).toBe("Ma k'ọla wa");
    expect(after[0].referenceForm).toEqual({
      text: "Mà kí ọ́lá wà",
      report,
      latencyMs: 4200,
      tokensIn: 300,
      tokensOut: 50,
    });
  });

  it("survives a reply that arrives after it", () => {
    const after = applyChatEvents(
      initStreamingReplies([{ slug: "a", name: "A" }]),
      [reference({ report: null }), closed("Ma k'ọla wa")],
    );
    expect(after[0].referenceForm?.text).toBe("Mà kí ọ́lá wà");
    expect(after[0].referenceForm?.report).toBeNull();
  });

  it("ignores the empty-text 'no rendering' signal: the column gets no reference form", () => {
    const after = applyChatEvents(
      initStreamingReplies([{ slug: "a", name: "A" }]),
      [
        closed("Ma k'ọla wa"),
        reference({
          text: "",
          report: null,
          latencyMs: null,
          tokensIn: null,
          tokensOut: null,
        }),
      ],
    );
    expect(after[0].referenceForm).toBeNull();
    expect(after[0].text).toBe("Ma k'ọla wa");
    // And it survives the wire as itself, not dropped as a line with no text.
    const parser = new ChatStreamParser();
    expect(
      parser.push(encodeChatEvent(reference({ text: "", report: null }))),
    ).toHaveLength(1);
  });

  it("is null on a fresh column and on a column of another slug", () => {
    const replies = initStreamingReplies([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ]);
    expect(replies[0].referenceForm).toBeNull();
    const after = applyChatEvents(replies, [reference()]);
    expect(after[1].referenceForm).toBeNull();
  });

  it("parses the rendering stage the route sends before the second pass", () => {
    const parser = new ChatStreamParser();
    expect(
      parser.push(
        encodeChatEvent({ type: "stage", slug: "a", stage: "rendering" }),
      ),
    ).toEqual([{ type: "stage", slug: "a", stage: "rendering" }]);
  });
});

/**
 * WHEN THE REVIEWER MAY ASK AGAIN: once every column's reply has landed, not
 * when the stream ends. A rag-v4-5 column keeps the stream open for its
 * reference form, and the composer must not wait on a rendering nobody judges.
 */
/**
 * WHO OWNS THE COMPOSER. The composer frees when an exchange's last reply
 * lands, while its stream may still carry a reference form, so a second
 * question can go out before the first request's `finally` runs. These are
 * the interleavings send() goes through, each pinned.
 */
describe("createComposerLock", () => {
  it("one request: acquired, released once, and a second release of the same token is a no-op", () => {
    const lock = createComposerLock();
    expect(lock.held()).toBe(false);
    const a = lock.acquire();
    expect(lock.held()).toBe(true);
    // All replies landed: the composer frees.
    expect(lock.release(a)).toBe(true);
    expect(lock.held()).toBe(false);
    // The same request's finally, later: nothing to do.
    expect(lock.release(a)).toBe(false);
    expect(lock.held()).toBe(false);
  });

  it("an older request's late release after a newer acquire is a no-op", () => {
    const lock = createComposerLock();
    const a = lock.acquire();
    expect(lock.release(a)).toBe(true); // a's replies all landed
    const b = lock.acquire(); // the reviewer asks again while a still streams
    expect(lock.release(a)).toBe(false); // a's finally, as its reference form lands
    expect(lock.held()).toBe(true); // b keeps the composer
    expect(lock.release(b)).toBe(true);
    expect(lock.held()).toBe(false);
  });

  it("every acquire is eventually released, whichever order the releases arrive in", () => {
    const lock = createComposerLock();
    const tokens: number[] = [];
    for (let i = 0; i < 5; i++) {
      // Each request frees the composer early, then the next one starts.
      const t = lock.acquire();
      tokens.push(t);
      expect(lock.release(t)).toBe(true);
    }
    // The late finallys, in any order: none of them locks or unlocks anything.
    for (const t of [...tokens].reverse()) expect(lock.release(t)).toBe(false);
    expect(lock.held()).toBe(false);
    // Tokens are distinct, so an old one can never pass for a new one.
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("a request that never freed early is released by its own finally", () => {
    // A stream that dies before every reply lands: only finally releases.
    const lock = createComposerLock();
    const a = lock.acquire();
    expect(lock.release(a)).toBe(true);
    expect(lock.held()).toBe(false);
  });
});

describe("allRepliesClosed / closedSlugs", () => {
  it("is false until the last column's reply, true from then on, whatever else follows", () => {
    const slugs = ["a", "b"];
    let seen = closedSlugs(new Set(), [
      { type: "delta", slug: "a", text: "x" },
      { type: "reply", reply: reply("a") },
    ]);
    expect(allRepliesClosed(slugs, seen)).toBe(false);
    seen = closedSlugs(seen, [
      { type: "stage", slug: "a", stage: "rendering" },
      { type: "reply", reply: reply("b") },
    ]);
    expect(allRepliesClosed(slugs, seen)).toBe(true);
    // A reference form still to come does not reopen anything.
    seen = closedSlugs(seen, [
      {
        type: "reference",
        slug: "a",
        text: "x",
        report: null,
        latencyMs: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
    expect(allRepliesClosed(slugs, seen)).toBe(true);
  });

  it("does not mutate the set it was given, and an empty exchange is never closed", () => {
    const prev = new Set<string>();
    closedSlugs(prev, [{ type: "reply", reply: reply("a") }]);
    expect(prev.size).toBe(0);
    expect(allRepliesClosed([], new Set(["a"]))).toBe(false);
  });
});
