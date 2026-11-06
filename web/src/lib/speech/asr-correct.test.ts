import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat } = vi.hoisted(() => ({ mockChat: vi.fn() }));
vi.mock("@/lib/llm/openrouter", () => ({ chat: mockChat }));

import { correctTranscript } from "./asr-correct";
import { LLM_CONFIG } from "./llm-config";

beforeEach(() => vi.clearAllMocks());

describe("correctTranscript", () => {
  it("returns the corrected text and flags a change", async () => {
    mockChat.mockResolvedValue({ text: "kapo mado\n" });
    const r = await correctTranscript({ candidates: ["kapo madu", "kapo mado"] });
    expect(r).toEqual({ corrected: "kapo mado", changed: true });
    expect(mockChat.mock.calls[0][1].model).toBe(LLM_CONFIG.asrCorrect);
  });

  it("flags no change when the model returns the top candidate", async () => {
    mockChat.mockResolvedValue({ text: "kapo mado" });
    const r = await correctTranscript({ candidates: ["kapo mado", "kapo madu"] });
    expect(r).toEqual({ corrected: "kapo mado", changed: false });
  });

  it("sends the candidates and the English gloss, with no forcing instruction", async () => {
    mockChat.mockResolvedValue({ text: "kapo mado" });
    await correctTranscript({
      candidates: ["kapo madu"],
      glossEnglish: "a made-up gloss",
    });
    const messages = mockChat.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain("kapo madu");
    expect(messages[1].content).toContain("a made-up gloss");
    expect(JSON.stringify(messages)).not.toMatch(/Respond only in Igala/i);
  });

  it("rejects an empty candidate list without a call", async () => {
    await expect(correctTranscript({ candidates: [] })).rejects.toThrow();
    expect(mockChat).not.toHaveBeenCalled();
  });
});
