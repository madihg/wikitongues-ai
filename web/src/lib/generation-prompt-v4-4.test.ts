import { describe, it, expect } from "vitest";
import { IGALA_SYSTEM_V4_2 } from "./generation-prompt-v4-2";
import { IGALA_SYSTEM_V4_4, V4_4_EDIT_COUNT } from "./generation-prompt-v4-4";

const linesOf = (s: string) => s.split("\n").filter((l) => l.trim().length > 0);

/**
 * v4.4 is v4.2 with twelve lines amended from the Sep 13-23 annotation mine.
 * What these pin: the amendment is exactly those eleven lines and nothing
 * else moved; each amendment says what the community said; the prompt stays
 * under its raised ceiling; and the house style holds.
 */
describe("IGALA_SYSTEM_V4_4", () => {
  const a = linesOf(IGALA_SYSTEM_V4_2);
  const b = linesOf(IGALA_SYSTEM_V4_4);
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));

  it("amends exactly twelve v4.2 lines, one for one, and adds no new line", () => {
    expect(V4_4_EDIT_COUNT).toBe(12);
    expect(removed).toHaveLength(12);
    expect(added).toHaveLength(12);
    expect(b).toHaveLength(a.length);
    // Same order: every unchanged line sits where v4.2 had it.
    a.forEach((line, i) => {
      if (!removed.includes(line)) expect(b[i]).toBe(line);
    });
  });

  it("M7+: text is written, never narrated (utokown / kwotejugede frames)", () => {
    expect(IGALA_SYSTEM_V4_4).toContain(
      "The same for an article sentence, a heading, a list or a name: write the text itself, never a sentence about the article, the question or what you are doing.",
    );
  });

  it("NE1+: the class word of an institution may lead; the rest is copied", () => {
    expect(IGALA_SYSTEM_V4_4).toContain("Banki Access");
    expect(IGALA_SYSTEM_V4_4).toContain("the rest is copied letter for letter");
    // The core of NE1 survives untouched.
    expect(IGALA_SYSTEM_V4_4).toContain("Names are not translated.");
    expect(IGALA_SYSTEM_V4_4).toContain("never respell one");
  });

  it("ORD+: a destination takes ti after a motion verb", () => {
    expect(IGALA_SYSTEM_V4_4).toContain(
      "A destination follows a motion verb with ti: lo ti Idah, lo t'Ankpa.",
    );
  });

  it("NEG / REG: the negator is spelled ñ, and the grave-accented ǹ is gone", () => {
    expect(IGALA_SYSTEM_V4_4).toContain("clause-final nasal, written ñ");
    expect(IGALA_SYSTEM_V4_4).toContain("negative nasal written ñ");
    expect(IGALA_SYSTEM_V4_4).not.toContain("ǹ");
    expect(IGALA_SYSTEM_V4_4).not.toContain("(-n)");
  });

  it("THE: yí is banned as the article only, and named as 'this'", () => {
    expect(IGALA_SYSTEM_V4_4).toContain("never yí for 'the' (yí = this)");
    expect(IGALA_SYSTEM_V4_4).not.toContain("never yí.");
  });

  it("ELI: efu is clipped only before a vowel, and a town takes efẹwọ", () => {
    expect(IGALA_SYSTEM_V4_4).toContain(
      "'in' is efu, clipped to ef' only before a vowel (ef'ọdọ 2021), never before a consonant; before a town name it is efẹwọ.",
    );
  });

  it("DAT: month first as an ordinal, day as a cardinal, year in digits", () => {
    expect(IGALA_SYSTEM_V4_4).toContain(
      "Dates: the month first, as an ordinal (ọchu + ẹkẹ-numeral), then the day as a cardinal with mẹ- (never an ordinal), then ọdọ + the year in digits",
    );
    expect(IGALA_SYSTEM_V4_4).not.toContain("day and month are ordinals");
    expect(IGALA_SYSTEM_V4_4).toContain("never compose one");
  });

  it("JOI: clauses join by a new sentence; kpai never links number words", () => {
    expect(IGALA_SYSTEM_V4_4).toContain("kpai links nouns, never number words");
    expect(IGALA_SYSTEM_V4_4).toContain(
      "clauses are joined by a new sentence (oñ is Bible register the community rewrites)",
    );
    expect(IGALA_SYSTEM_V4_4).not.toContain(
      "oñ or a new sentence links clauses",
    );
    // The small-word gate still names oñ and the negator, spelled as NEG spells it.
    expect(IGALA_SYSTEM_V4_4).toContain(
      "(lẹ, á, kì, ku, kpai, oñ, the final ñ)",
    );
  });

  it("NW1 / NW2: the annotators' Yoruba imports and the model's pet words are banned", () => {
    for (const w of ["nla", "ode", "ọja", "ọsẹ", "tàbí", "àmàà", "Agó o"]) {
      expect(IGALA_SYSTEM_V4_4).toContain(w);
    }
    for (const w of [
      "utokown",
      "kwotejugede",
      "chokalatu",
      "onka",
      "onobirẹ",
      "onokẹrẹ",
      "awehi",
    ]) {
      expect(IGALA_SYSTEM_V4_4).toContain(w);
    }
    // The v4.2 list is intact underneath.
    expect(IGALA_SYSTEM_V4_4).toContain(
      "ádṣa, kpùkẹ̀, ojoji, teketeke, akeli, gbede, abẹki, mímí, efí, kpegwa",
    );
  });

  it("stays under the raised 1,500-token ceiling and above v4.2", () => {
    // v4.2 sat at 1,287 under 1,300; twelve amended lines cannot fit there.
    // 1,500 is the new ceiling, and it is a real one: the prompt lands at
    // roughly 1,470, so the next version pays for its lines by cutting.
    expect(IGALA_SYSTEM_V4_4.length / 4).toBeLessThanOrEqual(1500);
    expect(IGALA_SYSTEM_V4_4.length).toBeGreaterThan(IGALA_SYSTEM_V4_2.length);
  });

  it("obeys the house style: no em or en dashes", () => {
    expect(IGALA_SYSTEM_V4_4).not.toContain("—");
    expect(IGALA_SYSTEM_V4_4).not.toContain("–");
  });
});
