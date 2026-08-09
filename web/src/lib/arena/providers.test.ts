import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  GOLD_EXAMPLE_INSTRUCTION,
  type CandidateLike,
  type RagChunk,
} from "./providers";
import { IGALA_FORCING_INSTRUCTION } from "@/lib/generation-prompt";

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
