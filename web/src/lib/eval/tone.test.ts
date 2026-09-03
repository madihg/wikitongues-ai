import { describe, it, expect } from "vitest";
import { stripToneMarks } from "./tone";

// Real shapes from production text, written as escapes so the test asserts on
// codepoints, not on whatever the editor renders.
const E_DOT = "ẹ"; // U+1EB9, precomposed dot-below e
const O_DOT = "ọ"; // U+1ECD, precomposed dot-below o
const N_TILDE = "ñ"; // U+00F1, precomposed tilde n
const GRAVE = "̀";
const ACUTE = "́";
const CIRCUMFLEX = "̂";
const MACRON = "̄";
const CARON = "̌";
const DOT_BELOW = "̣";
const TILDE_COMBINING = "̃";

describe("stripToneMarks", () => {
  it("removes tone marks (grave, acute, circumflex, macron, caron)", () => {
    expect(stripToneMarks(`a${GRAVE}`)).toBe("a");
    expect(stripToneMarks(`a${ACUTE}`)).toBe("a");
    expect(stripToneMarks(`a${CIRCUMFLEX}`)).toBe("a");
    expect(stripToneMarks(`a${MACRON}`)).toBe("a");
    expect(stripToneMarks(`c${CARON}`)).toBe("c");
  });

  it("keeps dot-below vowels (ẹ, ọ) intact, precomposed or decomposed", () => {
    expect(stripToneMarks(E_DOT)).toBe(E_DOT);
    expect(stripToneMarks(O_DOT)).toBe(O_DOT);
    expect(stripToneMarks(`e${DOT_BELOW}`).normalize("NFC")).toBe(E_DOT);
  });

  it("keeps every base letter including ẹ, ọ, ñ", () => {
    const word = `${E_DOT}g${O_DOT}${N_TILDE}`;
    expect(stripToneMarks(word)).toBe(word);
  });

  it("keeps tone on a dot-below vowel's dot, stripping only the tone accent", () => {
    // ẹ with an acute tone on top: the dot-below survives, the acute goes.
    const toned = `e${DOT_BELOW}${ACUTE}`;
    expect(stripToneMarks(toned)).toBe(E_DOT);
  });

  it("keeps the tilde that makes ñ a distinct letter (not a tone mark here)", () => {
    expect(stripToneMarks(`n${TILDE_COMBINING}`).normalize("NFC")).toBe(
      N_TILDE,
    );
  });

  it("is a no-op on ASCII passthrough", () => {
    expect(stripToneMarks("hello world 123")).toBe("hello world 123");
  });

  it("is idempotent", () => {
    const input = `${E_DOT}g${ACUTE}${GRAVE} ${O_DOT}m${CIRCUMFLEX}`;
    const once = stripToneMarks(input);
    const twice = stripToneMarks(once);
    expect(twice).toBe(once);
  });

  it("handles empty and null-ish input", () => {
    expect(stripToneMarks("")).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stripToneMarks(undefined as any)).toBe("");
  });

  it("a real Igala line with both tone marks and subdots strips only tone", () => {
    // "Ágbá ọ́jọ́" - tone-marked greeting-style line carrying both dot-below
    // vowels and acute tone. Only the tone accents should disappear.
    const line = `A${GRAVE}gba${ACUTE} ${O_DOT}${ACUTE}j${O_DOT}${ACUTE}`;
    const stripped = stripToneMarks(line);
    expect(stripped).toBe(`Agba ${O_DOT}j${O_DOT}`);
    // No combining tone marks remain (NFD check).
    expect(stripped.normalize("NFD")).not.toMatch(/[̀́̂̄̌]/);
    // Dot-below survives.
    expect(stripped.normalize("NFD")).toContain(DOT_BELOW);
  });

  it("returns NFC output", () => {
    const decomposedOut = stripToneMarks(`e${DOT_BELOW}${ACUTE}`);
    expect(decomposedOut).toBe(decomposedOut.normalize("NFC"));
  });
});
