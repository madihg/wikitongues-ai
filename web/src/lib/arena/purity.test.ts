import { describe, it, expect } from "vitest";
import { hasEnglishFunctionWord, hasToneMark, purityMetrics } from "./purity";

describe("hasEnglishFunctionWord", () => {
  it("catches English framing at the start of an answer", () => {
    expect(hasEnglishFunctionWord("The Igala word for water is omi")).toBe(
      true,
    );
    expect(hasEnglishFunctionWord("To say welcome, you would use...")).toBe(
      true,
    );
  });

  it("ignores punctuation attached to the word", () => {
    expect(hasEnglishFunctionWord("The, quick answer")).toBe(true);
    expect(hasEnglishFunctionWord("Here it is.")).toBe(true);
  });

  it("does not fire on clean Igala", () => {
    expect(hasEnglishFunctionWord("Ọ̀má lẹ aj'ẹñwu")).toBe(false);
    expect(hasEnglishFunctionWord("ọdudu")).toBe(false);
  });

  it("only looks at the first 8 words", () => {
    const late = "ọ̀mì ọ̀kọ́ ájì ògìjò ẹ́jẹ̀ñwú wọla ule ọdudu the";
    expect(late.split(/\s+/)[8]).toBe("the");
    expect(hasEnglishFunctionWord(late)).toBe(false);
  });

  it("does not match an English word merely containing a function word", () => {
    expect(hasEnglishFunctionWord("theory island fortune")).toBe(false);
  });
});

describe("hasToneMark", () => {
  it("detects precomposed accented vowels", () => {
    expect(hasToneMark("Ájì")).toBe(true);
    expect(hasToneMark("Ògìjò")).toBe(true);
  });

  it("detects dotted vowels", () => {
    expect(hasToneMark("ọdudu")).toBe(true);
    expect(hasToneMark("ẹjẹnwu")).toBe(true);
  });

  it("detects decomposed (NFD) input identically to precomposed", () => {
    const nfc = "ọ̀mì";
    expect(hasToneMark(nfc)).toBe(true);
    expect(hasToneMark(nfc.normalize("NFD"))).toBe(true);
    expect(hasToneMark(nfc.normalize("NFC"))).toBe(true);
  });

  it("is false for plain ASCII", () => {
    expect(hasToneMark("omi oko aji")).toBe(false);
    expect(hasToneMark("The Igala word is water")).toBe(false);
  });
});

describe("purityMetrics", () => {
  it("reports shares over the set, not per output", () => {
    const m = purityMetrics([
      "ọ̀mì", // clean Igala, tone-marked
      "The Igala word is omi", // English framing, no tone
      "ọ̀kọ́", // clean Igala, tone-marked
      "ajinwu", // Igala-ish but no diacritics
    ]);
    expect(m.n).toBe(4);
    expect(m.englishFnWordShare).toBe(0.25);
    expect(m.toneShare).toBe(0.5);
  });

  it("is all-zero on an empty set rather than NaN", () => {
    const m = purityMetrics([]);
    expect(m).toEqual({
      n: 0,
      englishFnWordShare: 0,
      toneShare: 0,
      meanChars: 0,
      meanWords: 0,
    });
  });

  it("reproduces the frozen Rung A shape: clean frontier output saturates both", () => {
    // Rung A measured 0.000 English share / 1.000 tone share for gpt-4.1 under
    // the Igala-forcing prompt. Any change to the metric that breaks this
    // reproduction also breaks comparability with the stored baselines.
    const clean = ["ọdudu", "Ọ̀má lẹ aj'ẹñwu", "Imọtọ", "Ájì", "Ògìjò"];
    const m = purityMetrics(clean);
    expect(m.englishFnWordShare).toBe(0);
    expect(m.toneShare).toBe(1);
  });

  it("counts length in characters and whitespace words", () => {
    const m = purityMetrics(["ab cd", "ef"]);
    expect(m.meanChars).toBe(3.5);
    expect(m.meanWords).toBe(1.5);
  });
});
