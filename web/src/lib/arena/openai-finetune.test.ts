import { describe, it, expect } from "vitest";
import {
  buildOpenAiChatRow,
  OPENAI_FINE_TUNE_BASE_MODELS,
} from "./openai-finetune";
import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";
import { buildSftExamples, toJsonl } from "./training-export";
import type { SftSourceRow } from "./training-export";

/**
 * The JSONL row builder is the last gate before community gold leaves the
 * platform and becomes model weights. Two things must be true of every line:
 * the system turn is present (train/serve match), and the assistant turn is
 * Igala gold with no English gloss, rationale, or framing attached.
 */

const GOLD = "Ọ̀má lẹ aj'ẹñwu";

describe("buildOpenAiChatRow", () => {
  it("emits exactly system, user, assistant in OpenAI chat order", () => {
    const row = buildOpenAiChatRow({
      systemPrompt: IGALA_FORCING_INSTRUCTION,
      prompt: "Translate 'The child eats food' into Igala.",
      completion: GOLD,
    });
    expect(row.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
  });

  it("always carries a system prompt, defaulting to the shared Igala-forcing instruction", () => {
    for (const systemPrompt of [undefined, null, "", "   "]) {
      const row = buildOpenAiChatRow({
        systemPrompt,
        prompt: "Write the Igala word for 'water'.",
        completion: "ọ̀mì",
      });
      expect(row.messages[0].role).toBe("system");
      expect(row.messages[0].content).toBe(IGALA_FORCING_INSTRUCTION);
      expect(row.messages[0].content.length).toBeGreaterThan(0);
    }
  });

  it("keeps an explicit system prompt verbatim", () => {
    const row = buildOpenAiChatRow({
      systemPrompt: IGALA_FORCING_INSTRUCTION,
      prompt: "p",
      completion: "a",
    });
    expect(row.messages[0].content).toBe(IGALA_FORCING_INSTRUCTION);
  });

  it("assistant turn is the Igala gold ONLY - no gloss, rationale or framing", () => {
    const row = buildOpenAiChatRow({
      systemPrompt: IGALA_FORCING_INSTRUCTION,
      prompt: "Translate 'The child eats food' into Igala.",
      completion: GOLD,
    });
    const assistant = row.messages[2];
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe(GOLD);
    // No English gloss / meta framing may ride along with the target.
    expect(assistant.content).not.toMatch(
      /means|in english|the igala word is|gloss|rationale|translation:/i,
    );
    // And the target must never echo the English source sentence.
    expect(assistant.content).not.toMatch(/child eats food/i);
  });

  it("preserves Igala diacritics and dotted vowels byte-for-byte", () => {
    const tricky = "ẹ́jẹ̀ñwú ọ̀kọ́ Ògìjò";
    const row = buildOpenAiChatRow({
      systemPrompt: null,
      prompt: "x",
      completion: tricky,
    });
    expect(row.messages[2].content).toBe(tricky);
  });

  it("trims surrounding whitespace but not internal text", () => {
    const row = buildOpenAiChatRow({
      systemPrompt: null,
      prompt: "  ask  ",
      completion: "\n ọ̀mì ọ̀kọ́ \n",
    });
    expect(row.messages[1].content).toBe("ask");
    expect(row.messages[2].content).toBe("ọ̀mì ọ̀kọ́");
  });

  it("refuses an empty user or assistant turn rather than uploading a junk row", () => {
    expect(() => buildOpenAiChatRow({ prompt: "", completion: GOLD })).toThrow(
      /user turn/,
    );
    expect(() =>
      buildOpenAiChatRow({ prompt: "p", completion: "   " }),
    ).toThrow(/assistant turn/);
  });

  it("serializes to one JSON object per line that round-trips", () => {
    const rows = [
      buildOpenAiChatRow({ prompt: "p1", completion: "ọ̀mì" }),
      buildOpenAiChatRow({ prompt: "p2", completion: "ọ̀kọ́" }),
    ];
    const jsonl = toJsonl(rows);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { messages: { role: string }[] };
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe("system");
    }
  });
});

describe("held-out prompts never reach a training row", () => {
  const base: SftSourceRow = {
    promptId: "p-train",
    promptText: "Write the Igala word for 'water'.",
    correctedText: "ọ̀mì",
    bucket: "orthography",
    isHoldout: false,
    verificationStatus: "single_annotator",
  };

  it("drops the benchmark row and keeps the training row", () => {
    const examples = buildSftExamples([
      base,
      { ...base, promptId: "p-frozen", isHoldout: true, correctedText: "leak" },
    ]);
    const rows = examples.map((e) =>
      buildOpenAiChatRow({
        systemPrompt: IGALA_FORCING_INSTRUCTION,
        prompt: e.messages[0].content,
        completion: e.messages[1].content,
      }),
    );
    expect(rows).toHaveLength(1);
    expect(toJsonl(rows)).not.toContain("leak");
  });
});

describe("OPENAI_FINE_TUNE_BASE_MODELS", () => {
  it("lists only exact dated snapshots, never floating aliases", () => {
    expect(OPENAI_FINE_TUNE_BASE_MODELS.length).toBeGreaterThan(0);
    for (const id of OPENAI_FINE_TUNE_BASE_MODELS) {
      expect(id).toMatch(/-\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("prefers gpt-4.1-mini and keeps gpt-4o-mini as the fallback", () => {
    expect(OPENAI_FINE_TUNE_BASE_MODELS[0]).toBe("gpt-4.1-mini-2025-04-14");
    expect(OPENAI_FINE_TUNE_BASE_MODELS).toContain("gpt-4o-mini-2024-07-18");
  });
});
