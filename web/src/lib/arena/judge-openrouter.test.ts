import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat, mockGenerate, mockResolve, cfg } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockGenerate: vi.fn(),
  mockResolve: vi.fn(() => "model"),
  cfg: { judge: null as string | null },
}));
vi.mock("@/lib/llm/openrouter", () => ({ chat: mockChat }));
vi.mock("@/lib/speech/llm-config", () => ({
  LLM_CONFIG: cfg,
}));
vi.mock("ai", () => ({ generateText: mockGenerate }));
vi.mock("./providers", () => ({ resolveModel: mockResolve }));

import { judgeWithSwap } from "./judge";

const verdict = (w: string) => JSON.stringify({ winner: w, rationale: "r" });

beforeEach(() => {
  vi.clearAllMocks();
  cfg.judge = null;
});

describe("judgeWithSwap routing", () => {
  it("leaves the existing path alone for an ordinary model id", async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: verdict("a"), usage: { inputTokens: 10, outputTokens: 4 } })
      .mockResolvedValueOnce({ text: verdict("b"), usage: { inputTokens: 10, outputTokens: 4 } });
    const r = await judgeWithSwap("gpt-4.1", { promptText: "p", x: "x", y: "y" });
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(r.winner).toBe("x");
    expect(r.swapAgreement).toBe(true);
    expect(r.tokensIn).toBe(20);
    expect(r.tokensOut).toBe(8);
  });

  it("routes an openrouter/ model id through the client, prefix stripped", async () => {
    mockChat
      .mockResolvedValueOnce({ text: verdict("a"), tokensIn: 30, tokensOut: 6 })
      .mockResolvedValueOnce({ text: verdict("b"), tokensIn: 30, tokensOut: 6 });
    const r = await judgeWithSwap("openrouter/google/gemini-3.1-pro-preview", {
      promptText: "p",
      x: "x",
      y: "y",
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockChat.mock.calls[0][1].model).toBe("google/gemini-3.1-pro-preview");
    expect(mockChat.mock.calls[0][1].temperature).toBe(0);
    expect(r).toMatchObject({ winner: "x", swapAgreement: true, tokensIn: 60, tokensOut: 12 });
  });

  it("routes every judge call through the client when llm-config.judge is set", async () => {
    cfg.judge = "anthropic/claude-sonnet-4.5";
    mockChat
      .mockResolvedValueOnce({ text: verdict("a"), tokensIn: 1, tokensOut: 1 })
      .mockResolvedValueOnce({ text: verdict("a"), tokensIn: 1, tokensOut: 1 });
    const r = await judgeWithSwap("gpt-4.1", { promptText: "p", x: "x", y: "y" });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockChat.mock.calls[0][1].model).toBe("anthropic/claude-sonnet-4.5");
    expect(r.swapAgreement).toBe(false);
    expect(r.winner).toBe("tie");
  });
});
