import { describe, it, expect } from "vitest";
import {
  stripAnswer,
  verbosityRatio,
  verbosityStats,
  wordCount,
} from "./answer-strip";

describe("stripAnswer", () => {
  it("removes the common English framings", () => {
    expect(stripAnswer("In Igala, Ọwa").stripped).toBe("Ọwa");
    expect(stripAnswer("The Igala word for child is Ọwa").stripped).toBe("Ọwa");
    expect(stripAnswer("Igala: Ọwa").stripped).toBe("Ọwa");
    expect(stripAnswer("Answer: Ọwa").stripped).toBe("Ọwa");
    expect(stripAnswer("Here is the Igala translation: Ọwa").stripped).toBe(
      "Ọwa",
    );
  });

  it("removes a trailing English gloss but keeps the Igala", () => {
    expect(stripAnswer("Ọwa (child)").stripped).toBe("Ọwa");
    expect(stripAnswer("Ọwa [child]").stripped).toBe("Ọwa");
    expect(stripAnswer("Ọwa - this means child").stripped).toBe("Ọwa");
  });

  it("removes surrounding quotes", () => {
    expect(stripAnswer('"Ọwa"').stripped).toBe("Ọwa");
  });

  it("leaves a bare Igala answer completely untouched", () => {
    const bare = "Fọta ọkuku";
    const r = stripAnswer(bare);
    expect(r.stripped).toBe(bare);
    expect(r.changed).toBe(false);
    expect(r.applied).toEqual([]);
  });

  it("never eats Igala text that merely contains a colon-like structure", () => {
    // The leading-clause rule is ASCII-only precisely so it cannot consume
    // Igala, which uses ẹ ọ ñ and tone marks.
    const igala = "Ọwa ẹñwu: ọwa kẹlẹ";
    expect(stripAnswer(igala).stripped).toBe(igala);
  });

  it("refuses to strip a string down to nothing", () => {
    // An output that is pure English framing should score badly, not become an
    // empty string that compares suspiciously well.
    const r = stripAnswer("In Igala,");
    expect(r.stripped.length).toBeGreaterThan(0);
  });

  it("handles a realistic verbose model answer", () => {
    const verbose =
      "The Igala word for water is Ówi (pronounced OH-mee, and note that this differs from Yoruba)";
    const out = stripAnswer(verbose).stripped;
    expect(out).toBe("Ówi");
  });

  it("is idempotent", () => {
    const once = stripAnswer("In Igala, Ọwa (child)").stripped;
    expect(stripAnswer(once).stripped).toBe(once);
  });
});

describe("verbosityRatio", () => {
  it("is 1 when the hypothesis matches the shortest reference in length", () => {
    expect(verbosityRatio("Ọwa", ["Ọwa"])).toBe(1);
  });

  it("scores against the SHORTEST reference", () => {
    // A model matching the most concise valid answer has met the contract.
    expect(verbosityRatio("Ọwa", ["Ọwa kẹlẹ nwu", "Ọwa"])).toBe(1);
  });

  it("reports how many times too long an answer is", () => {
    expect(verbosityRatio("one two three four", ["one two"])).toBe(2);
  });

  it("is NaN with no usable reference rather than silently 0", () => {
    expect(Number.isNaN(verbosityRatio("x", []))).toBe(true);
    expect(Number.isNaN(verbosityRatio("x", ["   "]))).toBe(true);
  });
});

describe("verbosityStats", () => {
  it("flags an arm whose median output is far longer than gold", () => {
    // This is the real measured situation: models write 64.4 words where
    // speakers write 7.07. Such an arm's chrF is measuring output shape.
    const rows = Array.from({ length: 10 }, () => ({
      hypothesis: "a b c d e f g h i j k l",
      references: ["x y"],
    }));
    const s = verbosityStats(rows);
    expect(s.median).toBe(6);
    expect(s.formatNonCompliant).toBe(true);
  });

  it("does not flag a terse arm", () => {
    const rows = Array.from({ length: 10 }, () => ({
      hypothesis: "Ọwa",
      references: ["Ọwa"],
    }));
    const s = verbosityStats(rows);
    expect(s.median).toBe(1);
    expect(s.formatNonCompliant).toBe(false);
  });

  it("reports the share of outputs carrying English packaging", () => {
    const s = verbosityStats([
      { hypothesis: "In Igala, Ọwa", references: ["Ọwa"] },
      { hypothesis: "Ọwa", references: ["Ọwa"] },
    ]);
    expect(s.strippedShare).toBe(0.5);
  });

  it("counts words the way the length budgets are stated", () => {
    expect(wordCount("  Fọta   ọkuku ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});
