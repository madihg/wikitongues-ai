import { describe, it, expect } from "vitest";
import {
  MINIMAL_PAIR_CELL,
  minimalPairCoverage,
  optionsFor,
  scoreAnswer,
  toneAccuracy,
  validatePair,
} from "./minimal-pairs";

// Invented spellings: same letters, different tone marks (grave vs acute).
const TARGET = "kwàba";
const FOIL = "kwába";

describe("validatePair (a tone minimal pair)", () => {
  it("accepts two spellings that differ in tone marks only", () => {
    expect(validatePair(TARGET, FOIL)).toEqual({ ok: true, target: TARGET, foil: FOIL });
  });
  it("refuses empty, identical, overlong and letter-differing spellings", () => {
    expect(validatePair("", FOIL).ok).toBe(false);
    expect(validatePair(TARGET, TARGET).ok).toBe(false);
    expect(validatePair(TARGET, "x".repeat(201)).ok).toBe(false);
    expect(validatePair(TARGET, "gbaba")).toMatchObject({ ok: false });
    expect(validatePair(5 as never, FOIL).ok).toBe(false);
  });
  it("treats composed and decomposed spellings as the same", () => {
    expect(validatePair(TARGET.normalize("NFD"), TARGET).ok).toBe(false);
  });
});

describe("scoreAnswer", () => {
  const pair = { targetSpelling: TARGET, foilSpelling: FOIL };
  it("scores the heard spelling against the target", () => {
    expect(scoreAnswer(pair, TARGET)).toEqual({ heard: "target", correct: true });
    expect(scoreAnswer(pair, FOIL.normalize("NFD"))).toEqual({ heard: "foil", correct: false });
    expect(scoreAnswer(pair, null)).toEqual({ heard: "unsure", correct: false });
  });
  it("is invalid for a spelling that is neither", () => {
    expect(scoreAnswer(pair, "gbaba")).toBe("invalid");
    expect(scoreAnswer(pair, 3 as never)).toBe("invalid");
  });
});

describe("optionsFor", () => {
  const pair = { targetSpelling: TARGET, foilSpelling: FOIL };
  it("offers both spellings in a stable order that does not reveal the target", () => {
    const a = optionsFor(pair, "listener-1", "xx_001");
    expect(a.map((o) => o.text).sort()).toEqual([FOIL, TARGET].sort());
    expect(optionsFor(pair, "listener-1", "xx_001")).toEqual(a);
    // across listeners and prompts both orders occur
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) firsts.add(optionsFor(pair, `listener-${i}`, "xx_001")[0].text);
    expect(firsts.size).toBe(2);
  });
});

describe("toneAccuracy per system", () => {
  it("counts unsure as not correct and ignores demo answers", () => {
    const out = toneAccuracy([
      { system: "voice-a", heard: "target", isDemo: false },
      { system: "voice-a", heard: "target", isDemo: false },
      { system: "voice-a", heard: "foil", isDemo: false },
      { system: "voice-a", heard: "unsure", isDemo: false },
      { system: "voice-a", heard: "foil", isDemo: true },
      { system: "human", heard: "target", isDemo: false },
    ]);
    expect(out["voice-a"]).toEqual({ answered: 4, correct: 2, unsure: 1, accuracy: 0.5 });
    expect(out.human).toEqual({ answered: 1, correct: 1, unsure: 0, accuracy: 1 });
  });
  it("has no accuracy before any answer", () => {
    expect(toneAccuracy([])).toEqual({});
  });
});

describe("coverage cell", () => {
  it("exports one stable cell key and counts marked prompts", () => {
    expect(MINIMAL_PAIR_CELL).toBe("tone_minimal_pair");
    expect(minimalPairCoverage([{ promptId: "p1" }, { promptId: "p2" }, { promptId: "p1" }])).toEqual({
      cell: "tone_minimal_pair",
      items: 2,
    });
  });
});
