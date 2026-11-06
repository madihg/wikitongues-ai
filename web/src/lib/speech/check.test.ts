import { describe, it, expect } from "vitest";
import { differingWords, answerWords, VERDICT_STATUS } from "./check";

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
