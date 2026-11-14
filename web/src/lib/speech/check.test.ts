import { describe, it, expect } from "vitest";
import {
  differingWords,
  answerWords,
  VERDICT_STATUS,
  CHECK_LEVELS,
  MAX_CHECK_NOTE_CHARS,
  isCheckLevel,
  levelLabel,
} from "./check";

describe("differingWords", () => {
  it("marks nothing when the words agree, ignoring case and punctuation", () => {
    expect(differingWords("Ada ba, ode.", "ada ba ode")).toEqual({
      answer: [],
      transcript: [],
    });
  });
  it("marks the replaced word on each side by position", () => {
    expect(differingWords("ada ba ode", "ada ku ode")).toEqual({
      answer: [1],
      transcript: [1],
    });
  });
  it("marks an inserted and a dropped word", () => {
    expect(differingWords("one two three", "one three four")).toEqual({
      answer: [1],
      transcript: [2],
    });
  });
  it("marks everything against an empty transcript", () => {
    expect(differingWords("a b", "")).toEqual({ answer: [0, 1], transcript: [] });
  });
});

describe("check basics", () => {
  it("splits an answer into words", () => {
    expect(answerWords("  a  b\tc ")).toEqual(["a", "b", "c"]);
  });
  it("maps each verdict to its review status", () => {
    expect(VERDICT_STATUS).toEqual({
      matches: "keep",
      does_not_match: "wrong_text",
      cannot_hear: "bad_audio",
    });
  });
});

describe("check levels", () => {
  it("are the five levels a reviewer picks from, in order", () => {
    expect(CHECK_LEVELS.map((l) => l.key)).toEqual([
      "word",
      "sound",
      "tone",
      "missing_extra",
      "other",
    ]);
    expect(MAX_CHECK_NOTE_CHARS).toBe(280);
  });
  it("label each key in words an annotator understands", () => {
    expect(levelLabel("word")).toBe("A different word was said");
    expect(levelLabel("sound")).toBe("Right word, a sound is off");
    expect(levelLabel("tone")).toBe("Right word, the tone is off");
    expect(levelLabel("missing_extra")).toBe("Words missing or added");
    expect(levelLabel("other")).toBe("Something else, say what in the note");
  });
  it("know their own keys and nothing else", () => {
    expect(isCheckLevel("tone")).toBe(true);
    for (const v of ["dialect", "", "Word", 3, null, undefined]) {
      expect(isCheckLevel(v)).toBe(false);
    }
  });
});
