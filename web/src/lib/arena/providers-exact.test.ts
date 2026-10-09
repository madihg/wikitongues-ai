import { describe, it, expect, vi } from "vitest";

/**
 * systemPromptExact skips the few-shot turns. IGALA_FEW_SHOT_EXAMPLES is
 * empty today, so the skip is invisible through the real builder; this file
 * stands in a builder that returns one demonstration pair, so the test
 * proves the exact call skips it while an ordinary arm still receives it.
 * Its own file because the stand-in would otherwise change every assembly
 * the other provider tests pin.
 */
vi.mock("@/lib/generation-prompt", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/generation-prompt")>();
  return {
    ...actual,
    buildFewShotTurns: () => [
      { role: "user" as const, content: "few-shot question" },
      { role: "assistant" as const, content: "few-shot answer" },
    ],
  };
});

const { assembleGenerationRequest } = await import("./providers");
const { buildReferenceFormTurn } = await import("./reference-form");

const candidate = { provider: "google", baseModelId: "gemini-3.1-pro-preview" };

describe("few-shot turns and systemPromptExact", () => {
  it("an ordinary arm still receives the few-shot turns ahead of its question", () => {
    const { messages } = assembleGenerationRequest(candidate, {
      userMessage: "question",
      systemPromptOverride: "SYSTEM",
    });
    expect(messages.map((m) => m.content)).toEqual([
      "few-shot question",
      "few-shot answer",
      "question",
    ]);
  });

  it("the reference turn receives none: exactly one user message", () => {
    const turn = buildReferenceFormTurn("Ma k'ọla wa");
    const { messages } = assembleGenerationRequest(candidate, turn);
    expect(messages).toEqual([{ role: "user", content: turn.userMessage }]);
  });
});
