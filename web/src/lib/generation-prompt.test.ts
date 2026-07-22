import { describe, it, expect } from "vitest";
import {
  IGALA_FORCING_INSTRUCTION,
  IGALA_FEW_SHOT_EXAMPLES,
  buildFewShotTurns,
} from "./generation-prompt";

describe("IGALA_FORCING_INSTRUCTION", () => {
  it("is the exact agreed-upon text (guards against accidental drift)", () => {
    expect(IGALA_FORCING_INSTRUCTION).toBe(
      "You are answering as a fluent native speaker of Igala, the Yoruboid language of Kogi State, Nigeria. " +
        "Igala is NOT Yoruba, NOT Igbo, and NOT Nigerian Pidgin - answer in Igala specifically. " +
        "Write your entire answer in Igala, using standard Igala orthography with tone marks and dotted vowels (ẹ, ọ) where they belong. " +
        "Always give your best attempt in Igala even if you are unsure - do not switch to English to explain uncertainty, and do not wrap the answer in English framing such as 'The Igala word is...'. " +
        "Include English ONLY if the prompt explicitly asks for an English explanation or translation - and then give the Igala first, followed by the minimal English requested. " +
        "Output only the answer itself - no preamble, no meta-commentary, no unrequested translations.",
    );
  });

  it("explicitly rules out the languages annotators caught being mixed in", () => {
    expect(IGALA_FORCING_INSTRUCTION).toContain("NOT Yoruba");
    expect(IGALA_FORCING_INSTRUCTION).toContain("NOT Igbo");
    expect(IGALA_FORCING_INSTRUCTION).toContain("NOT Nigerian Pidgin");
  });
});

describe("IGALA_FEW_SHOT_EXAMPLES", () => {
  it("starts empty until community-vetted examples are added", () => {
    expect(IGALA_FEW_SHOT_EXAMPLES).toEqual([]);
  });
});

describe("buildFewShotTurns", () => {
  it("returns no turns while the example list is empty", () => {
    expect(buildFewShotTurns("Kpa kpai la ye la?")).toEqual([]);
  });

  it("turns each example into a user/assistant pair, in order", () => {
    IGALA_FEW_SHOT_EXAMPLES.push(
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    );
    try {
      const turns = buildFewShotTurns("the real prompt");
      expect(turns).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
        { role: "assistant", content: "A2" },
      ]);
    } finally {
      IGALA_FEW_SHOT_EXAMPLES.length = 0;
    }
  });

  it("drops an example whose question matches the prompt being generated for", () => {
    IGALA_FEW_SHOT_EXAMPLES.push(
      { question: "leaked prompt", answer: "leaked answer" },
      { question: "safe example", answer: "safe answer" },
    );
    try {
      const turns = buildFewShotTurns("leaked prompt");
      expect(turns).toEqual([
        { role: "user", content: "safe example" },
        { role: "assistant", content: "safe answer" },
      ]);
    } finally {
      IGALA_FEW_SHOT_EXAMPLES.length = 0;
    }
  });
});
