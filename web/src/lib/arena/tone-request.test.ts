import { describe, it, expect } from "vitest";
import { asksForTone, stripToneAccents } from "./tone-request";

describe("asksForTone", () => {
  it("is the word-bounded /\\btone/i test on the raw question", () => {
    expect(asksForTone("Mark the tones on this sentence")).toBe(true);
    expect(asksForTone("TONE marks please")).toBe(true);
    expect(asksForTone("a monotone voice")).toBe(false);
    expect(asksForTone("Ask the question and mark it")).toBe(false);
  });
});

describe("stripToneAccents", () => {
  it("removes grave, acute, circumflex and caron, and keeps ñ and the dotted vowels", () => {
    expect(stripToneAccents("kì kí Ẹ́ñwû ùkọ́lọ̀ ẹ̀ jọ̀ ǎ")).toBe("ki ki Ẹñwu ukọlọ ẹ jọ a");
    expect(stripToneAccents("ñwu ẹñwu ọdọ")).toBe("ñwu ẹñwu ọdọ");
  });

  it("leaves untoned text byte-identical", () => {
    const s = "DICTIONARY\nabc = thing\nñw' ẹ ọ";
    expect(stripToneAccents(s)).toBe(s);
  });
});
