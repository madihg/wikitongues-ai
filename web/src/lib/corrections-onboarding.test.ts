import { describe, it, expect } from "vitest";
import {
  ONBOARDING_EXAMPLE,
  PRACTICE_EXAMPLE,
  WORD_SLOT,
} from "./corrections-onboarding";
import { diffToSegments, nfc } from "./edit-segments";

/**
 * The Corrections lane's first-run examples (2026-10-15). This repository is
 * public and both examples are shown to every new annotator, so neither may
 * carry a frozen-benchmark gold answer. The one word that was a gold is a
 * bracketed English stand-in now. The proof against the real protected set is
 * scripts/leak-check-files.ts on corrections-onboarding.ts; this holds the
 * shape, so the real word cannot be typed back in unnoticed and the worked
 * example still teaches what it did.
 */
describe("the Corrections onboarding examples keep the gold word out", () => {
  it("the stand-in is an English description in square brackets", () => {
    expect(WORD_SLOT).toBe("[the word for God]");
    expect(WORD_SLOT).toMatch(/^\[[A-Za-z ]+\]$/);
  });

  it("the worked example shows the real first word and the stand-in", () => {
    expect(ONBOARDING_EXAMPLE.aiAnswer).toBe("Àgbá [the word for God]");
    expect(ONBOARDING_EXAMPLE.correction).toBe("Agba [the word for God]");
  });

  it("the worked example still diffs to one change, so the one reason card is filled", () => {
    const segments = diffToSegments(
      ONBOARDING_EXAMPLE.aiAnswer,
      ONBOARDING_EXAMPLE.correction,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].original).toBe(nfc("Àgbá"));
    expect(segments[0].replacement).toBe("Agba");
  });

  it("the practice round opens with the stand-in and keeps the word to fix", () => {
    expect(PRACTICE_EXAMPLE.aiAnswer).toBe(`${WORD_SLOT} ki chẹnyọ ñwu wẹ`);
  });
});
