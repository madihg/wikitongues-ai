import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import {
  assembleGenerationRequest,
  streamForCandidate,
  type CandidateLike,
} from "./providers";
import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";

/**
 * The streaming path exists to cut PERCEIVED latency, and its one hard
 * contract is that it changes nothing else: same request assembly as the
 * buffered path (shared via assembleGenerationRequest), same
 * CandidateGeneration accounting out the other end, deltas surfaced in order
 * in between.
 */

const candidate: CandidateLike = {
  name: "Test model",
  provider: "anthropic",
  baseModelId: "claude-test",
  ragEnabled: true,
};

// The V3 stream-part type, derived from the mock itself: `ai` does not
// re-export it, and depending on @ai-sdk/provider directly would add a dep
// for one type alias.
type StreamPart =
  Awaited<
    ReturnType<MockLanguageModelV3["doStream"]>
  >["stream"] extends ReadableStream<infer P>
    ? P
    : never;

function mockStream(parts: StreamPart[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream<StreamPart>({ chunks: parts }),
    }),
  });
}

describe("streamForCandidate", () => {
  it("surfaces deltas in order and returns the full text plus usage", async () => {
    const model = mockStream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Ómi " },
      { type: "text-delta", id: "t1", delta: "du " },
      { type: "text-delta", id: "t1", delta: "dẹ́ẹ̀." },
      { type: "text-end", id: "t1" },
      {
        type: "finish",
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 42,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 7, text: 7, reasoning: undefined },
        },
      },
    ]);

    const deltas: string[] = [];
    const result = await streamForCandidate(
      candidate,
      { userMessage: "How do you say the water is cold?" },
      (d) => deltas.push(d),
      model,
    );

    expect(deltas).toEqual(["Ómi ", "du ", "dẹ́ẹ̀."]);
    expect(result.text).toBe("Ómi du dẹ́ẹ̀.");
    expect(result.tokensIn).toBe(42);
    expect(result.tokensOut).toBe(7);
    expect(result.modelId).toBe("claude-test");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the assembled system prompt and messages to the provider", async () => {
    const model = mockStream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "x" },
      { type: "text-end", id: "t1" },
      {
        type: "finish",
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 1,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
      },
    ]);

    const args = {
      userMessage: "What is the Igala word for water?",
      goldExamples: [
        {
          id: "g1",
          question: "What is the Igala word for child?",
          answer: "Ọma",
        },
      ],
    };
    await streamForCandidate(candidate, args, () => {}, model);

    expect(model.doStreamCalls).toHaveLength(1);
    const sent = model.doStreamCalls[0].prompt;
    // System turn leads with the forcing instruction, exactly as the
    // buffered path builds it.
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain(IGALA_FORCING_INSTRUCTION.slice(0, 40));
    // Gold exemplar turns precede the real question, which comes last.
    const last = sent[sent.length - 1];
    expect(last.role).toBe("user");
    const texts = sent.map((m) =>
      typeof m.content === "string"
        ? m.content
        : m.content.map((p) => ("text" in p ? p.text : "")).join(""),
    );
    expect(texts.some((t) => t.includes("Ọma"))).toBe(true);
    expect(texts[texts.length - 1]).toContain("water");
  });

  it("carries provenance ids exactly like the buffered path", async () => {
    const model = mockStream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "x" },
      { type: "text-end", id: "t1" },
      {
        type: "finish",
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 1,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
      },
    ]);
    const result = await streamForCandidate(
      candidate,
      {
        userMessage: "q",
        ragContext: [{ id: "chunk1", content: "c" }],
        goldExamples: [{ id: "g1", question: "other q", answer: "a" }],
      },
      () => {},
      model,
    );
    expect(result.ragContextIds).toEqual(["chunk1", "gold:g1"]);
  });

  it("rejects when the provider stream errors, like the buffered path would", async () => {
    const model = mockStream([
      { type: "stream-start", warnings: [] },
      { type: "error", error: new Error("provider fell over") },
    ]);
    await expect(
      streamForCandidate(candidate, { userMessage: "q" }, () => {}, model),
    ).rejects.toThrow();
  });
});

describe("assembleGenerationRequest - shared by both paths", () => {
  it("gates gold examples on ragEnabled so a baseline stays plain", () => {
    const baseline: CandidateLike = { ...candidate, ragEnabled: false };
    const { messages } = assembleGenerationRequest(baseline, {
      userMessage: "q",
      goldExamples: [{ question: "other", answer: "Ọma" }],
    });
    expect(messages).toEqual([{ role: "user", content: "q" }]);
  });

  it("never echoes an exemplar answering the exact question asked", () => {
    const { messages } = assembleGenerationRequest(candidate, {
      userMessage: "What is the Igala word for water?",
      goldExamples: [
        { question: "What is the Igala word for water?", answer: "LEAK" },
        { question: "What is the Igala word for child?", answer: "Ọma" },
      ],
    });
    expect(JSON.stringify(messages)).not.toContain("LEAK");
    expect(JSON.stringify(messages)).toContain("Ọma");
  });
});
