import { describe, it, expect } from "vitest";
import {
  assembleGenerationRequest,
  buildSystemPrompt,
  GOLD_EXAMPLE_INSTRUCTION,
  type CandidateLike,
  type RagChunk,
} from "./providers";
import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";
import { IGALA_SYSTEM_V4_4 } from "@/lib/generation-prompt-v4-4";
import {
  REFERENCE_FORM_SYSTEM,
  buildReferenceFormTurn,
} from "./reference-form";

const baseCandidate: CandidateLike = {
  provider: "openai",
  baseModelId: "gpt-4o",
};

describe("buildSystemPrompt", () => {
  it("leads with the Igala-forcing instruction for a plain candidate", () => {
    const system = buildSystemPrompt(baseCandidate);
    expect(system.startsWith(IGALA_FORCING_INSTRUCTION)).toBe(true);
  });

  it("still leads with the forcing instruction when a candidate has its own system prompt", () => {
    const candidate: CandidateLike = {
      ...baseCandidate,
      useSystemPrompt: true,
      systemPrompt: "Some older, weaker custom Igala instruction.",
    };
    const system = buildSystemPrompt(candidate);
    expect(system.startsWith(IGALA_FORCING_INSTRUCTION)).toBe(true);
    // The custom text is preserved too, just not as the sole instruction.
    expect(system).toContain("Some older, weaker custom Igala instruction.");
  });

  it("still leads with the forcing instruction when a systemPromptOverride is passed", () => {
    const system = buildSystemPrompt(
      baseCandidate,
      undefined,
      "Caller-supplied override text",
    );
    expect(system.startsWith(IGALA_FORCING_INSTRUCTION)).toBe(true);
    expect(system).toContain("Caller-supplied override text");
  });

  it("appends RAG grounding after the forcing instruction when RAG is enabled", () => {
    const candidate: CandidateLike = { ...baseCandidate, ragEnabled: true };
    const ragContext: RagChunk[] = [
      {
        id: "1",
        content: "a retrieved chunk body",
        topic: "greetings",
        chunkType: "note",
      },
    ];
    const system = buildSystemPrompt(candidate, ragContext);
    expect(system.startsWith(IGALA_FORCING_INSTRUCTION)).toBe(true);
    expect(system).toContain("a retrieved chunk body");
    // The chunk is introduced by some framing, whatever its wording.
    expect(system).toMatch(/reference material/i);
  });

  it("never tells the model the retrieved material is verified", () => {
    // None of the live Igala entries are community-verified - they come from
    // Wikipedia, Wiktionary, an 1854 wordlist and a machine-derived lexicon,
    // and several carry warnings in their own body text. Claiming otherwise
    // invites the model to state a machine-derived gloss as fact to a native
    // speaker, and the same string is shown on the annotator reference panel.
    // Asserted as a property, not a fixed sentence, so rewording the framing
    // cannot quietly reintroduce the claim.
    const candidate: CandidateLike = { ...baseCandidate, ragEnabled: true };
    const system = buildSystemPrompt(candidate, [
      { id: "1", content: "chunk", topic: "t", chunkType: "note" },
    ]);
    expect(system).not.toMatch(/verified (igala )?(knowledge|material|fact)/i);
    expect(system).not.toMatch(/authoritative(?!,? and do not| source)/i);
    // and it must actively warn the model instead
    expect(system).toMatch(/not community-verified|may be wrong/i);
  });

  it("does not include RAG grounding when ragEnabled is false, even with context passed", () => {
    const ragContext: RagChunk[] = [
      {
        id: "1",
        content: "verified fact",
        topic: "greetings",
        chunkType: "note",
      },
    ];
    const system = buildSystemPrompt(baseCandidate, ragContext);
    expect(system).not.toContain("verified fact");
  });

  it("adds the exemplar instruction when gold examples accompany a RAG candidate", () => {
    const candidate: CandidateLike = { ...baseCandidate, ragEnabled: true };
    const system = buildSystemPrompt(candidate, [], undefined, 6);
    expect(system.startsWith(IGALA_FORCING_INSTRUCTION)).toBe(true);
    expect(system).toContain(GOLD_EXAMPLE_INSTRUCTION);
  });

  it("omits the exemplar instruction when there are no gold examples", () => {
    const candidate: CandidateLike = { ...baseCandidate, ragEnabled: true };
    expect(buildSystemPrompt(candidate, [], undefined, 0)).not.toContain(
      GOLD_EXAMPLE_INSTRUCTION,
    );
  });

  it("omits the exemplar instruction for a plain baseline, so a baseline stays plain", () => {
    expect(buildSystemPrompt(baseCandidate, [], undefined, 6)).not.toContain(
      GOLD_EXAMPLE_INSTRUCTION,
    );
  });
});

/**
 * systemPromptExact: the reference-form pass sends its instruction verbatim,
 * because the forcing instruction ("best attempt even if unsure") contradicts
 * "never guess a tone". The flag is opt-in, and every arm that exists must
 * assemble exactly what it assembled before; the first test is that pin.
 */
describe("systemPromptExact", () => {
  const v44: CandidateLike = {
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    ragEnabled: true,
  };
  const args = {
    userMessage: "question",
    systemPromptOverride: IGALA_SYSTEM_V4_4,
    goldExamples: [
      { question: "q1", answer: "a1" },
      { question: "q2", answer: "a2" },
    ],
  };

  it("leaves an existing arm's assembled prompt exactly as it was", () => {
    const before = assembleGenerationRequest(v44, args);
    expect(before.system).toBe(
      `${IGALA_FORCING_INSTRUCTION}\n\n${IGALA_SYSTEM_V4_4}\n\n${GOLD_EXAMPLE_INSTRUCTION}`,
    );
    expect(assembleGenerationRequest(v44, { ...args, systemPromptExact: false })).toEqual(
      before,
    );
  });

  it("sends the override alone when set: no forcing text, no exemplar instruction, no reference material", () => {
    const ragContext: RagChunk[] = [
      { id: "r1", content: "chunk", topic: "t", chunkType: "note" },
    ];
    const { system } = assembleGenerationRequest(v44, {
      ...args,
      ragContext,
      systemPromptOverride: "RENDER ONLY",
      systemPromptExact: true,
    });
    expect(system).toBe("RENDER ONLY");
  });

  it("assembles the reference turn to its instruction and exactly one user message", () => {
    const { system, messages } = assembleGenerationRequest(
      { ...v44, ragEnabled: false },
      buildReferenceFormTurn("Ma k'ọla wa"),
    );
    expect(system).toBe(REFERENCE_FORM_SYSTEM);
    expect(messages).toEqual([
      {
        role: "user",
        content: buildReferenceFormTurn("Ma k'ọla wa").userMessage,
      },
    ]);
  });

  it("does nothing without an override to send", () => {
    expect(buildSystemPrompt(baseCandidate, [], undefined, 0, true)).toBe(
      buildSystemPrompt(baseCandidate),
    );
  });
});
