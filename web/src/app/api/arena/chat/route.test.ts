import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE CHAT ROUTE AT THE WIRE LEVEL.
 *
 * Everything else that covers this change is a unit test over a pure helper
 * (repair-round.ts, chat-stream.ts, column-status.ts) or a grep over route
 * source (frozen-exam.test.ts). None of them run the route, so none of them can
 * answer the question the change was made to answer: does a token actually
 * reach the client's socket before the repair round does its work?
 *
 * This file runs the real POST handler, reads the real ReadableStream with a
 * reader while the (mocked) providers are still producing, and records ONE
 * timeline that interleaves two independent clocks:
 *
 *   provider side  gen-start:N / provider-delta:N:<tok> / gen-end:N
 *   wire side      wire:<the exact NDJSON line the client just read>
 *
 * An ordering claim about streaming is only meaningful against that timeline.
 * "The route calls onDelta" proves nothing; "byte X was readable by the client
 * before the first generation had even finished" is the actual property.
 *
 * WHAT THE BUG WAS
 * ----------------
 * rag-v4-1 is the default-preselected column (highest agreement score). It was
 * served BUFFERED so the repair round could see a finished answer, so the first
 * thing every reviewer saw was the one panel that stayed blank - and on a dirty
 * answer it stayed blank across TWO full generations. Under HEAD the v4.1
 * column emitted zero `delta` events; the assertions below would have been
 * unsatisfiable, which is the point.
 */

const {
  mockPrisma,
  mockRequireResearcher,
  mockStreamForCandidate,
  mockBuildRetrievalV2,
  mockBuildRetrievalV4,
  mockSearchRag,
} = vi.hoisted(() => ({
  mockPrisma: {
    candidateModel: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
  mockStreamForCandidate: vi.fn(),
  mockBuildRetrievalV2: vi.fn(),
  mockBuildRetrievalV4: vi.fn(),
  mockSearchRag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
vi.mock("@/lib/arena/providers", () => ({
  streamForCandidate: mockStreamForCandidate,
}));
vi.mock("@/lib/arena/retrieval-v2", () => ({
  buildRetrievalV2: mockBuildRetrievalV2,
}));
vi.mock("@/lib/arena/retrieval-v4", () => ({
  buildRetrievalV4: mockBuildRetrievalV4,
}));
vi.mock("@/lib/rag", () => ({ searchRag: mockSearchRag }));

/**
 * The turn budget, made testable. A real turn has ~112s of budget, which is not
 * a thing a unit test can wait for, so `turnBudgetMs` shortens the route's
 * deadline and nothing else: TURN_CUTOFF_NOTICE, MIN_REASK_BUDGET_MS and the
 * real hasBudgetForReask gate all come through untouched, so the tests below
 * exercise the shipped decisions rather than a mock of them.
 *
 * `forceReask` is the one exception, used by a single test that needs a
 * REWRITE to be mid-flight when the deadline lands - impossible otherwise,
 * since permitting a re-ask requires more budget than a test can wait out.
 */
const { turnBudgetMs, forceReask } = vi.hoisted(() => ({
  turnBudgetMs: { value: 92_000 },
  forceReask: { value: false },
}));
vi.mock("@/lib/arena/turn-budget", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/arena/turn-budget")>();
  return {
    ...actual,
    turnDeadlineFrom: (startedAtMs: number) => startedAtMs + turnBudgetMs.value,
    hasBudgetForReask: (deadlineMs?: number, now?: number) =>
      forceReask.value || actual.hasBudgetForReask(deadlineMs, now),
  };
});

import { POST } from "./route";
import type { ChatStreamEvent } from "@/lib/arena/chat-stream";
import {
  applyChatEvents,
  initStreamingReplies,
  type StreamingReply,
} from "@/lib/arena/chat-stream";
import { SERVER_TIMING_STAGE_NAMES } from "@/lib/arena/server-timing";
import {
  CHAT_MAX_DURATION_S,
  TURN_CUTOFF_NOTICE,
} from "@/lib/arena/turn-budget";
import { readFileSync } from "node:fs";
import { buildUserTurnV4, IGALA_SYSTEM_V4 } from "@/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";
import { buildUserTurnV2, IGALA_SYSTEM_V2 } from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";

// ─── fixtures ───────────────────────────────────────────────────────────────

const V4 = {
  dictionaryBlock: "DICTIONARY\nabc = thing",
  parallelBlock: "PARALLEL\nx = y",
  correctionsBlock: "CORRECTIONS\nnot z",
  exampleTurns: [{ question: "q1", answer: "a1" }],
  contextIds: ["lex:1", "pp:2", "edit:3", "gold:4"],
  leakReport: { pass: true, hitCount: 0, hits: [] },
};

const V2 = {
  dictionaryBlock: "DICTIONARY\nabc = thing",
  parallelBlock: "PARALLEL\nx = y",
  exampleTurns: [{ question: "q2", answer: "a2" }],
  contextIds: ["lex:9", "gold:8"],
  leakReport: { pass: true, hitCount: 0, hits: [] },
};

const candidate = (over: Record<string, unknown>) => ({
  id: "c1",
  slug: "slug",
  name: "Name",
  provider: "openai",
  baseModelId: "gpt-x",
  ragEnabled: true,
  archived: false,
  versionLabel: null,
  decodingParams: null,
  ...over,
});

const QUESTION = "How do I greet an elder in the morning?";
const HISTORY = [
  { role: "user" as const, content: "earlier question" },
  { role: "assistant" as const, content: "earlier answer" },
];

function request(slugs: string[], question = QUESTION) {
  return new Request("http://localhost/api/arena/chat", {
    method: "POST",
    body: JSON.stringify({
      slugs,
      messages: [...HISTORY, { role: "user", content: question }],
    }),
  });
}

/** The interleaved provider/wire clock. Reset per test. */
let timeline: string[] = [];
/** How many provider generations have started, across all columns. */
let genCount = 0;

const sleep = (ms = 1) => new Promise((r) => setTimeout(r, ms));

/**
 * Script one provider generation per call, in call order. Each token is emitted
 * after a real timer tick so the response reader genuinely gets a chance to run
 * between them - the whole ordering claim is worthless if the mock resolves
 * synchronously and the reader only ever sees a finished queue.
 */
function scriptGenerations(scripts: string[][]) {
  mockStreamForCandidate.mockImplementation(
    async (
      _candidate: unknown,
      _args: unknown,
      onDelta: (d: string) => void,
    ) => {
      const n = ++genCount;
      timeline.push(`gen-start:${n}`);
      const tokens = scripts[n - 1] ?? [];
      for (const t of tokens) {
        await sleep();
        onDelta(t);
        timeline.push(`provider-delta:${n}:${t}`);
      }
      await sleep();
      timeline.push(`gen-end:${n}`);
      return {
        text: tokens.join(""),
        modelId: "gpt-x",
        latencyMs: 7 * n,
        tokensIn: 100 * n,
        tokensOut: 10 * n,
        ragContextIds: [],
      };
    },
  );
}

/**
 * Read the streaming response the way a browser does - one reader, chunk by
 * chunk - recording every complete NDJSON line into the shared timeline at the
 * moment it became readable.
 */
async function drain(res: Response): Promise<{
  lines: string[];
  events: ChatStreamEvent[];
}> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const lines: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      lines.push(part);
      timeline.push(`wire:${part}`);
    }
  }
  return { lines, events: lines.map((l) => JSON.parse(l) as ChatStreamEvent) };
}

const firstWireIndex = (type: string) =>
  timeline.findIndex(
    (e) =>
      e.startsWith("wire:") &&
      (JSON.parse(e.slice(5)) as { type: string }).type === type,
  );

beforeEach(() => {
  vi.clearAllMocks();
  timeline = [];
  genCount = 0;
  turnBudgetMs.value = 92_000;
  forceReask.value = false;
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
  mockBuildRetrievalV2.mockResolvedValue(V2);
  mockBuildRetrievalV4.mockResolvedValue(V4);
  mockSearchRag.mockResolvedValue([]);
  scriptGenerations([["hello ", "world"]]);
});

// ─── (b) the bug: v4.1 streams, repair comes after ──────────────────────────

describe("rag-v4-1 reaches the wire before the repair round runs", () => {
  const v41 = candidate({
    slug: "v41",
    name: "v4.1",
    versionLabel: "rag-v4-1",
  });

  it("flushes its first token BEFORE the first generation has even finished", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    // A dirty first answer ("sooro" carries an s, which the Igala allowlist
    // rejects) so the repair round definitely runs a second generation.
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);

    const res = await POST(request(["v41"]));
    const { events } = await drain(res);

    const firstDelta = firstWireIndex("delta");
    // Under HEAD this column emitted no delta at all - the assertion below is
    // the bug's headstone.
    expect(firstDelta).toBeGreaterThanOrEqual(0);
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(0);

    // The strong ordering claim: a byte was readable by the client while
    // attempt one was still generating, so no repair work of any kind - not the
    // checker, not the re-ask - can have preceded it.
    expect(firstDelta).toBeLessThan(timeline.indexOf("gen-end:1"));
    expect(firstDelta).toBeLessThan(timeline.indexOf("gen-start:2"));
    expect(firstDelta).toBeLessThan(firstWireIndex("revision"));

    // And the repair round really did run: two generations, one revision.
    expect(genCount).toBe(2);
  });

  it("ends on the REPAIRED text, with the first attempt marked superseded", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);

    const res = await POST(request(["v41"]));
    const { events } = await drain(res);

    const kinds = events.map((e) => e.type);
    // Both attempts stream, with the revision seam between them.
    expect(kinds.filter((k) => k === "delta")).toHaveLength(4);
    expect(kinds.indexOf("revision")).toBeGreaterThan(kinds.indexOf("delta"));
    expect(kinds.lastIndexOf("delta")).toBeGreaterThan(
      kinds.indexOf("revision"),
    );
    expect(kinds.at(-1)).toBe("reply");

    const revision = events.find((e) => e.type === "revision")!;
    expect(revision).toMatchObject({
      type: "revision",
      slug: "v41",
      reasons: ["letters that are not in the Igala alphabet"],
    });

    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("ojo daa");
    // Serve what you measure: the served answer cost BOTH calls.
    expect(reply.type === "reply" && reply.reply.latencyMs).toBe(7 + 14);
    expect(reply.type === "reply" && reply.reply.tokensIn).toBe(100 + 200);
    expect(reply.type === "reply" && reply.reply.tokensOut).toBe(10 + 20);

    // Folding the wire the way the client does lands on the repaired text with
    // nothing of the first attempt left over.
    const folded = applyChatEvents(
      initStreamingReplies([{ slug: "v41", name: "v4.1" }]),
      events,
    );
    expect(folded[0].text).toBe("ojo daa");
    expect(folded[0].revisedFor).toEqual([
      "letters that are not in the Igala alphabet",
    ]);
  });

  it("runs ONE generation and emits no revision when the first answer is clean", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    scriptGenerations([["ojo ", "daa"]]);

    const res = await POST(request(["v41"]));
    const { events } = await drain(res);

    expect(genCount).toBe(1);
    expect(events.some((e) => e.type === "revision")).toBe(false);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("ojo daa");
    expect(reply.type === "reply" && reply.reply.latencyMs).toBe(7);
  });

  it("assembles both attempts through the shared v4-family builder", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);
    await drain(await POST(request(["v41"])));

    // Attempt one is EXACTLY the assembly the exam and the eval route build,
    // recomputed here from the unchanged prompt modules rather than copied out
    // of the route.
    expect(mockStreamForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV4(QUESTION, V4, null),
      conversationHistory: HISTORY,
      goldExamples: V4.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V4_1,
    });
    // Attempt two is the re-ask: the first answer as the model's own prior
    // turn, the violations named, nothing else changed.
    const second = mockStreamForCandidate.mock.calls[1][1];
    expect(second.systemPromptOverride).toBe(IGALA_SYSTEM_V4_1);
    expect(second.goldExamples).toEqual(V4.exampleTurns);
    expect(second.conversationHistory).toEqual([
      ...HISTORY,
      { role: "user", content: buildUserTurnV4(QUESTION, V4, null) },
      { role: "assistant", content: "sooro" },
    ]);
    expect(second.userMessage).toContain("sooro");
  });

  it("carries the per-column stage markers that replace the global spinner", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);
    const { events } = await drain(await POST(request(["v41"])));

    const stages = events
      .filter((e): e is Extract<ChatStreamEvent, { type: "stage" }> =>
        Boolean(e.type === "stage"),
      )
      .map((e) => e.stage);
    expect(stages).toEqual(["writing", "checking", "writing"]);
    // The first stage marker precedes the first token: the pre-token gap is
    // exactly the window the reviewer used to read as "the page is broken".
    expect(firstWireIndex("stage")).toBeLessThan(firstWireIndex("delta"));
  });
});

// ─── (c) no regression on the arms that did not change ──────────────────────

describe("the other arms serve exactly what they served before", () => {
  /**
   * "Byte-identical" is stated precisely here: an OLD client's parseLine
   * dropped every type except delta and reply (verified against HEAD), so the
   * stream an old client SEES is the delta/reply subsequence. That subsequence,
   * and the request each arm assembles, must be unchanged. The `stage` lines
   * are the only addition, and they are additive by construction.
   */
  const oldClientVisible = (events: ChatStreamEvent[]) =>
    events.filter((e) => e.type === "delta" || e.type === "reply");

  it("rag-v4: one generation, the v4 system prompt, delta+reply only", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
    ]);
    const { events } = await drain(await POST(request(["v4"])));

    expect(genCount).toBe(1);
    expect(mockStreamForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV4(QUESTION, V4, null),
      conversationHistory: HISTORY,
      goldExamples: V4.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V4,
    });
    expect(oldClientVisible(events).map((e) => e.type)).toEqual([
      "delta",
      "delta",
      "reply",
    ]);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply).toMatchObject({
      slug: "v4",
      name: "v4",
      text: "hello world",
      latencyMs: 7,
      tokensIn: 100,
      tokensOut: 10,
      // contextIds minus the gold: entries.
      retrievedChunks: 3,
      retrievedExemplars: 1,
      error: null,
    });
    // No repair round on this arm, ever.
    expect(events.some((e) => e.type === "revision")).toBe(false);
  });

  it("rag-v3: the v2 composition under the v3 system prompt", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v3", name: "v3", versionLabel: "rag-v3" }),
    ]);
    const { events } = await drain(await POST(request(["v3"])));

    expect(genCount).toBe(1);
    expect(mockStreamForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV2(QUESTION, V2, null),
      conversationHistory: HISTORY,
      goldExamples: V2.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V3,
    });
    expect(mockBuildRetrievalV4).not.toHaveBeenCalled();
    expect(oldClientVisible(events).map((e) => e.type)).toEqual([
      "delta",
      "delta",
      "reply",
    ]);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply).toMatchObject({
      text: "hello world",
      retrievedChunks: 1,
      retrievedExemplars: 1,
    });
  });

  it("rag-v2: same composition, the v2 system prompt", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v2", name: "v2", versionLabel: "rag-v2" }),
    ]);
    await drain(await POST(request(["v2"])));
    expect(mockStreamForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV2(QUESTION, V2, null),
      conversationHistory: HISTORY,
      goldExamples: V2.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V2,
    });
  });

  it("baseline (no RAG): the bare question, no retrieval of any kind", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "base", name: "base", ragEnabled: false }),
    ]);
    const { events } = await drain(await POST(request(["base"])));

    expect(mockBuildRetrievalV2).not.toHaveBeenCalled();
    expect(mockBuildRetrievalV4).not.toHaveBeenCalled();
    expect(mockSearchRag).not.toHaveBeenCalled();
    expect(mockStreamForCandidate.mock.calls[0][1]).toEqual({
      userMessage: QUESTION,
      conversationHistory: HISTORY,
      ragContext: [],
      goldExamples: [],
    });
    expect(oldClientVisible(events).map((e) => e.type)).toEqual([
      "delta",
      "delta",
      "reply",
    ]);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply).toMatchObject({
      retrievedChunks: 0,
      retrievedExemplars: 0,
    });
  });

  it("a v4.1 revision on ONE column leaves its neighbour's text alone", async () => {
    // The new event types ride a MULTIPLEXED stream. A `revision` clears a
    // column wholesale, so a mis-keyed one would silently wipe the answer the
    // reviewer is actually reading in the next panel over.
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
      candidate({
        id: "c2",
        slug: "v41",
        name: "v4.1",
        versionLabel: "rag-v4-1",
      }),
    ]);
    mockStreamForCandidate.mockImplementation(
      async (
        c: { slug: string },
        _args: unknown,
        onDelta: (d: string) => void,
      ) => {
        const n = ++genCount;
        const tokens =
          c.slug === "v4"
            ? ["neigh", "bour"]
            : n <= 2
              ? ["so", "oro"]
              : ["ojo ", "daa"];
        for (const t of tokens) {
          await sleep();
          onDelta(t);
        }
        return {
          text: tokens.join(""),
          modelId: "gpt-x",
          latencyMs: 5,
          tokensIn: 1,
          tokensOut: 1,
          ragContextIds: [],
        };
      },
    );

    const { events } = await drain(await POST(request(["v4", "v41"])));
    const revision = events.find((e) => e.type === "revision")!;
    expect(revision.type === "revision" && revision.slug).toBe("v41");

    const folded = applyChatEvents(
      initStreamingReplies([
        { slug: "v4", name: "v4" },
        { slug: "v41", name: "v4.1" },
      ]),
      events,
    );
    expect(folded.map((r) => r.text)).toEqual(["neighbour", "ojo daa"]);
    expect(folded[0].revisedFor).toBeNull();
    // Every stage marker is addressed to a column that exists.
    for (const ev of events) {
      if (ev.type === "stage") expect(["v4", "v41"]).toContain(ev.slug);
    }
  });

  it("a dead provider still fails only its own column", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
      candidate({
        id: "c2",
        slug: "v41",
        name: "v4.1",
        versionLabel: "rag-v4-1",
      }),
    ]);
    mockStreamForCandidate.mockImplementation(
      async (
        c: { slug: string },
        _args: unknown,
        onDelta: (d: string) => void,
      ) => {
        if (c.slug === "v41") throw new Error("provider key revoked");
        await sleep();
        onDelta("ok");
        return {
          text: "ok",
          modelId: "gpt-x",
          latencyMs: 3,
          tokensIn: 1,
          tokensOut: 1,
          ragContextIds: [],
        };
      },
    );

    const { events } = await drain(await POST(request(["v4", "v41"])));
    const replies = events.filter((e) => e.type === "reply");
    expect(replies).toHaveLength(2);
    const bySlug = Object.fromEntries(
      replies.map((e) => [
        e.type === "reply" ? e.reply.slug : "",
        e.type === "reply" ? e.reply : null,
      ]),
    );
    expect(bySlug["v4"]!.text).toBe("ok");
    expect(bySlug["v4"]!.error).toBeNull();
    expect(bySlug["v41"]!.text).toBe("");
    expect(bySlug["v41"]!.error).toContain("provider key revoked");
  });
});

// ─── (e) backward compatibility ─────────────────────────────────────────────

describe("a client that has never heard of the new events", () => {
  /**
   * HEAD's parseLine returned [] for anything that was not a delta or a reply,
   * so a client one deploy behind never even hands `stage` or `revision` to its
   * fold. It therefore appends BOTH attempts and is corrected by the closing
   * reply, which has always been authoritative. This reproduces that client
   * exactly - HEAD's fold, HEAD's parser - against today's wire.
   */
  function headEraFold(lines: string[]): StreamingReply[] {
    const parsed = lines
      .map((l) => JSON.parse(l) as ChatStreamEvent)
      .filter((e) => e.type === "delta" || e.type === "reply");
    const replies = initStreamingReplies([{ slug: "v41", name: "v4.1" }]);
    const bySlug = new Map(replies.map((r) => [r.slug, { ...r }]));
    for (const ev of parsed) {
      if (ev.type === "delta") {
        const r = bySlug.get(ev.slug);
        if (r && !r.done) r.text += ev.text;
      } else if (ev.type === "reply") {
        const r = bySlug.get(ev.reply.slug);
        if (r)
          bySlug.set(ev.reply.slug, {
            ...ev.reply,
            done: true,
            revisedFor: null,
            revisionApplied: true,
          });
      }
    }
    return replies.map((r) => bySlug.get(r.slug)!);
  }

  it("lands on the repaired text anyway, after a flicker of doubled text", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v41", name: "v4.1", versionLabel: "rag-v4-1" }),
    ]);
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);
    const { lines } = await drain(await POST(request(["v41"])));

    // Mid-stream the old client really does hold the doubled text - the
    // flicker is real, and it is bounded.
    const beforeReply = lines.filter(
      (l) => (JSON.parse(l) as ChatStreamEvent).type !== "reply",
    );
    expect(headEraFold(beforeReply)[0].text).toBe("sooroojo daa");
    // The closing reply corrects it. No old client ends on a wrong transcript.
    expect(headEraFold(lines)[0].text).toBe("ojo daa");
    expect(headEraFold(lines)[0].done).toBe(true);
  });
});

// ─── (f) the Server-Timing header cannot carry content ──────────────────────

describe("Server-Timing", () => {
  const LEAKY_QUESTION = "Translate the secret phrase ọ̀jọ́ àgbá for me";

  it("names only allowlisted stages, with durations and no desc", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({
        slug: "gpt-4o-igala-rag-v4-1",
        name: "GPT-4o + Igala RAG v4.1",
        versionLabel: "rag-v4-1",
      }),
    ]);
    scriptGenerations([["ojo ", "daa"]]);

    const res = await POST(request(["gpt-4o-igala-rag-v4-1"], LEAKY_QUESTION));
    const header = res.headers.get("Server-Timing")!;
    await drain(res);

    const entries = header.split(", ");
    expect(entries.map((e) => e.split(";")[0])).toEqual([
      ...SERVER_TIMING_STAGE_NAMES,
    ]);
    for (const entry of entries) {
      expect(entry).toMatch(/^[a-z][a-z0-9-]*;dur=\d+$/);
    }
    expect(header).not.toContain("desc");
  });

  it("carries no fragment of the question, the answer, or the candidate", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({
        slug: "gpt-4o-igala-rag-v4-1",
        name: "GPT-4o + Igala RAG v4.1",
        versionLabel: "rag-v4-1",
      }),
    ]);
    scriptGenerations([["ojo ", "daa"]]);

    const res = await POST(request(["gpt-4o-igala-rag-v4-1"], LEAKY_QUESTION));
    const header = res.headers.get("Server-Timing")!;
    await drain(res);

    for (const secret of [
      "secret",
      "phrase",
      "ọ̀jọ́",
      "àgbá",
      "Translate",
      "ojo",
      "daa",
      "gpt-4o",
      "igala",
      "rag-v4-1",
      "GPT-4o + Igala RAG v4.1",
      V4.dictionaryBlock,
      V4.parallelBlock,
      V4.correctionsBlock,
    ]) {
      expect(header.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    // The header's SHAPE does not vary with the request either: a header that
    // grew an entry only when v4 retrieval ran would itself be a disclosure.
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "base", name: "base", ragEnabled: false }),
    ]);
    const bare = await POST(request(["base"]));
    const bareHeader = bare.headers.get("Server-Timing")!;
    await drain(bare);
    expect(bareHeader.split(", ").map((e) => e.split(";")[0])).toEqual(
      header.split(", ").map((e) => e.split(";")[0]),
    );
  });
});

// ─── (g) the deadline: degrade, never vanish ────────────────────────────────

/**
 * THE INCIDENT, AT THE WIRE LEVEL.
 *
 * A long turn used to end as a bare "HTTP 504" card: 0.0s, no text, no reason.
 * The platform killed the function, and a killed function cannot say anything -
 * the client gets a gateway error with no body. The only defence is to stop
 * FIRST and spend the remaining margin explaining, which is what these tests
 * read off the wire: every unfinished column closes through the ordinary
 * `reply` event, carrying the text it had already streamed plus a
 * plain-language note, and the stream closes without waiting for the provider
 * that is about to be killed.
 */
describe("a turn that runs past its deadline", () => {
  const v4 = candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" });

  /** One column that streams a prefix immediately, then stalls past any test. */
  function stallAfterPrefix(prefix: string) {
    mockStreamForCandidate.mockImplementation(
      async (
        _candidate: unknown,
        _args: unknown,
        onDelta: (d: string) => void,
      ) => {
        onDelta(prefix);
        await sleep(4000);
        onDelta(" never arrives");
        return {
          text: `${prefix} never arrives`,
          modelId: "gpt-x",
          latencyMs: 4000,
          tokensIn: 100,
          tokensOut: 10,
          ragContextIds: [],
        };
      },
    );
  }

  it("keeps the partial text and explains the cutoff, instead of an empty card", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v4]);
    stallAfterPrefix("Wọla ọdudu, this much arrived");
    turnBudgetMs.value = 30;

    const startedAt = Date.now();
    const { events } = await drain(await POST(request(["v4"])));
    const elapsed = Date.now() - startedAt;

    // The response closed on OUR deadline, not on the provider's 4s stall and
    // not on the platform's axe.
    expect(elapsed).toBeLessThan(2000);

    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe(
      "Wọla ọdudu, this much arrived",
    );
    expect(reply.type === "reply" && reply.reply.error).toBe(
      TURN_CUTOFF_NOTICE,
    );
    // Every column is closed: nothing is left spinning for a client to guess
    // about.
    expect(events.filter((e) => e.type === "reply")).toHaveLength(1);
  });

  it("folds to partial text PLUS the explanation, never a blank column", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v4]);
    stallAfterPrefix("half an answer");
    turnBudgetMs.value = 30;

    const { events } = await drain(await POST(request(["v4"])));
    const folded = applyChatEvents(
      initStreamingReplies([{ slug: "v4", name: "v4" }]),
      events,
    );
    // Both halves of what the reviewer must see. The old failure had neither.
    expect(folded[0].text).toBe("half an answer");
    expect(folded[0].error).toBe(TURN_CUTOFF_NOTICE);
    expect(folded[0].done).toBe(true);
    expect(folded[0].error).toMatch(/time limit/i);
  });

  it("cuts every unfinished column and leaves the finished one alone", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      v4,
      candidate({ id: "c2", slug: "fast", name: "fast", ragEnabled: false }),
      candidate({ id: "c3", slug: "slow", name: "slow", ragEnabled: false }),
    ]);
    mockStreamForCandidate.mockImplementation(
      async (
        c: { slug: string },
        _args: unknown,
        onDelta: (d: string) => void,
      ) => {
        if (c.slug === "fast") {
          onDelta("finished in time");
          return {
            text: "finished in time",
            modelId: "gpt-x",
            latencyMs: 2,
            tokensIn: 1,
            tokensOut: 1,
            ragContextIds: [],
          };
        }
        onDelta(`${c.slug} got this far`);
        await sleep(4000);
        return {
          text: "unreachable",
          modelId: "gpt-x",
          latencyMs: 4000,
          tokensIn: 1,
          tokensOut: 1,
          ragContextIds: [],
        };
      },
    );
    turnBudgetMs.value = 40;

    const { events } = await drain(await POST(request(["v4", "fast", "slow"])));
    const replies = Object.fromEntries(
      events
        .filter((e) => e.type === "reply")
        .map((e) => [
          e.type === "reply" ? e.reply.slug : "",
          e.type === "reply" ? e.reply : null,
        ]),
    );
    expect(Object.keys(replies).sort()).toEqual(["fast", "slow", "v4"]);
    // The column that finished keeps its real reply, untouched by the cutoff.
    expect(replies["fast"]!.text).toBe("finished in time");
    expect(replies["fast"]!.error).toBeNull();
    expect(replies["fast"]!.latencyMs).toBe(2);
    // The two that did not each keep their own partial text.
    expect(replies["v4"]!.text).toBe("v4 got this far");
    expect(replies["slow"]!.text).toBe("slow got this far");
    for (const slug of ["v4", "slow"]) {
      expect(replies[slug]!.error).toBe(TURN_CUTOFF_NOTICE);
      // No invented accounting for a generation that never finished.
      expect(replies[slug]!.tokensIn).toBeNull();
      expect(replies[slug]!.tokensOut).toBeNull();
    }
  });

  it("closes a column that had produced NOTHING with the same explanation", async () => {
    // The worst case, and the literal shape of the incident: not one token
    // arrived. It still closes with a reason rather than a bodiless 504.
    mockPrisma.candidateModel.findMany.mockResolvedValue([v4]);
    mockStreamForCandidate.mockImplementation(async () => {
      await sleep(4000);
      return {
        text: "never",
        modelId: "gpt-x",
        latencyMs: 4000,
        tokensIn: 1,
        tokensOut: 1,
        ragContextIds: [],
      };
    });
    turnBudgetMs.value = 30;

    const { events } = await drain(await POST(request(["v4"])));
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("");
    expect(reply.type === "reply" && reply.reply.error).toBe(
      TURN_CUTOFF_NOTICE,
    );
  });

  it("shows the REWRITE's prefix when the deadline lands mid-repair", async () => {
    // A v4.1 column that was rewriting when the cutoff arrived must not fall
    // back to the discarded first attempt: the revision event already told the
    // client to throw that away.
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v41", name: "v4.1", versionLabel: "rag-v4-1" }),
    ]);
    forceReask.value = true;
    mockStreamForCandidate.mockImplementation(
      async (_c: unknown, _args: unknown, onDelta: (d: string) => void) => {
        const n = ++genCount;
        if (n === 1) {
          onDelta("sooro");
          return {
            text: "sooro",
            modelId: "gpt-x",
            latencyMs: 5,
            tokensIn: 1,
            tokensOut: 1,
            ragContextIds: [],
          };
        }
        onDelta("ojo ");
        await sleep(4000);
        return {
          text: "ojo daa",
          modelId: "gpt-x",
          latencyMs: 4000,
          tokensIn: 1,
          tokensOut: 1,
          ragContextIds: [],
        };
      },
    );
    turnBudgetMs.value = 60;

    const { events } = await drain(await POST(request(["v41"])));
    expect(genCount).toBe(2);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("ojo ");
    expect(reply.type === "reply" && reply.reply.error).toBe(
      TURN_CUTOFF_NOTICE,
    );

    const folded = applyChatEvents(
      initStreamingReplies([{ slug: "v41", name: "v4.1" }]),
      events,
    );
    expect(folded[0].text).toBe("ojo ");
  });

  it("does nothing at all to a turn that finishes inside its budget", async () => {
    // The ordinary case, stated: with a real budget no cutoff reply exists and
    // no wire event mentions the time limit.
    mockPrisma.candidateModel.findMany.mockResolvedValue([v4]);
    const { events, lines } = await drain(await POST(request(["v4"])));
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("hello world");
    expect(reply.type === "reply" && reply.reply.error).toBeNull();
    expect(lines.join("\n")).not.toContain("time limit");
  });
});

// ─── (h) the re-ask the budget could not afford ─────────────────────────────

describe("a v4.1 column whose turn has no time left to rewrite", () => {
  const v41 = candidate({
    slug: "v41",
    name: "v4.1",
    versionLabel: "rag-v4-1",
  });

  it("keeps the first answer and says the check found something", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    // A dirty first answer that WOULD be rewritten with budget to spare.
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);
    // Enough budget for the first attempt to land, nowhere near enough for a
    // second generation - the real gate decides, on the real threshold.
    turnBudgetMs.value = 2_000;

    const { events } = await drain(await POST(request(["v41"])));

    // ONE generation. The second would have been killed by the platform, and
    // the finished first answer would have died with it.
    expect(genCount).toBe(1);
    const revision = events.find((e) => e.type === "revision")!;
    expect(revision).toMatchObject({
      type: "revision",
      slug: "v41",
      reasons: ["letters that are not in the Igala alphabet"],
      applied: false,
    });

    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("sooro");
    expect(reply.type === "reply" && reply.reply.error).toBeNull();

    // The client keeps the text AND learns it was flagged - never a silent
    // pass, never a blank column.
    const folded = applyChatEvents(
      initStreamingReplies([{ slug: "v41", name: "v4.1" }]),
      events,
    );
    expect(folded[0].text).toBe("sooro");
    expect(folded[0].revisedFor).toEqual([
      "letters that are not in the Igala alphabet",
    ]);
    expect(folded[0].revisionApplied).toBe(false);
    expect(folded[0].error).toBeNull();
  });

  it("still rewrites when the budget allows it", async () => {
    // Same column, same dirty answer, a real turn budget: unchanged behaviour.
    mockPrisma.candidateModel.findMany.mockResolvedValue([v41]);
    scriptGenerations([
      ["so", "oro"],
      ["ojo ", "daa"],
    ]);
    const { events } = await drain(await POST(request(["v41"])));

    expect(genCount).toBe(2);
    const revision = events.find((e) => e.type === "revision")!;
    expect(revision.type === "revision" && revision.applied).toBeUndefined();
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("ojo daa");
  });
});

// ─── (i) the two remaining ways a column could still go blank ───────────────

/**
 * THE SAME INVARIANT, ON THE TWO PATHS THE DEADLINE DOES NOT OWN.
 *
 * The rule the incident bought is not "the cutoff explains itself" but "a
 * column never closes as a bare code with nothing in it". Two paths could
 * still break that:
 *
 *   1. A PROVIDER that dies mid-stream. Its tokens were already on the
 *      reviewer's screen; the closing reply used to replace them with the
 *      error string alone, which is the empty card again with a different
 *      cause.
 *   2. RETRIEVAL that outlives the budget. It runs BEFORE the response head is
 *      flushed, so there is no open stream to explain down - exactly the
 *      bodiless gateway error, one stage earlier.
 */
describe("a column never closes as a bare error with nothing in it", () => {
  it("keeps what a provider streamed before it died", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
    ]);
    mockStreamForCandidate.mockImplementation(
      async (
        _c: unknown,
        _args: unknown,
        onDelta: (d: string) => void,
      ): Promise<never> => {
        onDelta("Wọla ọdudu, this much arrived");
        await sleep();
        // The shape the incident wore: a terse upstream code, no body.
        throw new Error("HTTP 504");
      },
    );

    const { events } = await drain(await POST(request(["v4"])));
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe(
      "Wọla ọdudu, this much arrived",
    );
    expect(reply.type === "reply" && reply.reply.error).toBe("HTTP 504");

    // What the reviewer ends up looking at: the partial answer AND the
    // failure, never the failure alone.
    const folded = applyChatEvents(
      initStreamingReplies([{ slug: "v4", name: "v4" }]),
      events,
    );
    expect(folded[0].text).toBe("Wọla ọdudu, this much arrived");
    expect(folded[0].error).toBe("HTTP 504");
  });

  it("explains itself when the deadline lands during RETRIEVAL, before any model is called", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
      candidate({
        id: "c2",
        slug: "v41",
        name: "v4.1",
        versionLabel: "rag-v4-1",
      }),
    ]);
    // Retrieval that never returns inside the budget.
    mockBuildRetrievalV4.mockImplementation(async () => {
      await sleep(4000);
      return V4;
    });
    turnBudgetMs.value = 30;

    const startedAt = Date.now();
    const res = await POST(request(["v4", "v41"]));
    const { events } = await drain(res);
    expect(Date.now() - startedAt).toBeLessThan(2000);

    // Still the ordinary NDJSON contract, so no client needs new code.
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
    expect(res.status).toBe(200);

    // No provider was ever called, and every selected column is closed with a
    // sentence instead of a bodiless gateway error.
    expect(genCount).toBe(0);
    const replies = events.filter((e) => e.type === "reply");
    expect(replies).toHaveLength(2);
    for (const ev of replies) {
      const reply = ev.type === "reply" ? ev.reply : null;
      expect(reply!.error).toBe(TURN_CUTOFF_NOTICE);
      expect(reply!.error).not.toMatch(/504|HTTP/);
      expect(reply!.tokensIn).toBeNull();
      expect(reply!.tokensOut).toBeNull();
    }

    const folded = applyChatEvents(
      initStreamingReplies([
        { slug: "v4", name: "v4" },
        { slug: "v41", name: "v4.1" },
      ]),
      events,
    );
    for (const column of folded) {
      expect(column.done).toBe(true);
      expect(column.error).toBe(TURN_CUTOFF_NOTICE);
    }
  });

  it("leaves an ordinary turn's retrieval completely alone", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([
      candidate({ slug: "v4", name: "v4", versionLabel: "rag-v4" }),
    ]);
    const { events } = await drain(await POST(request(["v4"])));
    expect(mockBuildRetrievalV4).toHaveBeenCalledTimes(1);
    const reply = events.find((e) => e.type === "reply")!;
    expect(reply.type === "reply" && reply.reply.text).toBe("hello world");
    expect(reply.type === "reply" && reply.reply.error).toBeNull();
  });
});

describe("route segment config must survive a real Next build", () => {
  // This suite exists because production broke on exactly this: the route had
  // `export const maxDuration = CHAT_MAX_DURATION_S`, and Next validates
  // segment config STATICALLY, before resolving imports. The build died with
  // "Invalid segment configuration export detected" while tsc and vitest were
  // both green, so nothing local caught it.
  const routeSource = readFileSync(
    new URL("./route.ts", import.meta.url),
    "utf8",
  );

  it("declares maxDuration as a bare numeric literal", () => {
    const m = routeSource.match(/export const maxDuration = ([^;]+);/);
    expect(m).not.toBeNull();
    const rhs = (m?.[1] ?? "").trim();
    expect(rhs).toMatch(/^\d+$/);
  });

  it("keeps that literal equal to the turn budget's declared ceiling", () => {
    // The literal cannot import, so this is the join that stops the two
    // drifting apart. Change one and this fails, naming both numbers.
    const m = routeSource.match(/export const maxDuration = (\d+);/);
    expect(Number(m?.[1])).toBe(CHAT_MAX_DURATION_S);
  });

  it("has no non-literal segment config export of any kind", () => {
    const SEGMENT_KEYS = [
      "dynamic",
      "revalidate",
      "runtime",
      "maxDuration",
      "fetchCache",
      "preferredRegion",
      "dynamicParams",
    ];
    for (const key of SEGMENT_KEYS) {
      const m = routeSource.match(new RegExp(`export const ${key} = ([^;]+);`));
      if (!m) continue;
      const rhs = m[1].trim();
      // literal number, literal string, or literal boolean - nothing else
      expect(
        /^(\d+|"[^"]*"|'[^']*'|true|false)$/.test(rhs),
        `segment config "${key}" must be a literal, got: ${rhs}`,
      ).toBe(true);
    }
  });
});

describe('provider "derived" is never chattable', () => {
  it("refuses with a clear 400 when a derived candidate is requested", async () => {
    const derived = candidate({
      slug: "gemini-3-1-pro-rag-v4-tonestrip",
      name: "Gemini 3.1 Pro + Igala RAG v4 (tone-stripped)",
      provider: "derived",
    });
    mockPrisma.candidateModel.findMany.mockResolvedValue([derived]);

    const res = await POST(request(["gemini-3-1-pro-rag-v4-tonestrip"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/derived/i);
    expect(body.error).toContain("gemini-3-1-pro-rag-v4-tonestrip");
    expect(mockStreamForCandidate).not.toHaveBeenCalled();
  });

  it("refuses the whole request even when only one of several selected candidates is derived", async () => {
    const live = candidate({ slug: "live", name: "Live" });
    const derived = candidate({
      slug: "derived-arm",
      name: "Derived",
      provider: "derived",
    });
    mockPrisma.candidateModel.findMany.mockResolvedValue([live, derived]);

    const res = await POST(request(["live", "derived-arm"]));
    expect(res.status).toBe(400);
    expect(mockStreamForCandidate).not.toHaveBeenCalled();
  });
});
