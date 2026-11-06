import { describe, it, expect } from "vitest";
import {
  MIN_JUDGMENTS,
  MIN_LISTENERS,
  STRONG_JUDGMENTS,
  decisionCards,
  systemOf,
  thresholdMessage,
  type JudgmentRow,
} from "./decision";

describe("systemOf", () => {
  it("names a synthesised clip by its model ref and every human clip 'human'", () => {
    expect(systemOf({ sourceType: "derived", sourceRef: "tts/job-1", modelOutputId: null })).toBe("tts/job-1");
    expect(systemOf({ sourceType: "derived", sourceRef: null, modelOutputId: "mo-1" })).toBe("synth:mo-1");
    expect(systemOf({ sourceType: "derived", sourceRef: null, modelOutputId: null })).toBe("synth");
    expect(systemOf({ sourceType: "contributor", sourceRef: null, modelOutputId: null })).toBe("human");
  });
});

// A synthetic win table: system "voice" beats "human" in `wins` of `n` judgments.
function table(n: number, listeners: number, voiceWins: number, over: Partial<JudgmentRow> = {}): JudgmentRow[] {
  return Array.from({ length: n }, (_, i): JudgmentRow => {
    const voiceIsA = i % 2 === 0;
    const voiceWon = i < voiceWins;
    const winner = voiceWon ? (voiceIsA ? "a" : "b") : voiceIsA ? "b" : "a";
    return {
      a: voiceIsA ? "voice" : "human",
      b: voiceIsA ? "human" : "voice",
      winner,
      annotatorId: `listener-${i % listeners}`,
      isDemo: false,
      ...over,
    };
  });
}

describe("thresholdMessage", () => {
  it("says 'not enough judgments' below 300 or below 5 listeners, and names 600", () => {
    expect(thresholdMessage(299, 9)).toMatch(/^Not enough judgments/);
    expect(thresholdMessage(300, 4)).toMatch(/^Not enough judgments/);
    expect(thresholdMessage(299, 9)).toContain(String(STRONG_JUDGMENTS));
    expect(thresholdMessage(120, 3)).toContain("120 of 300");
    expect(thresholdMessage(120, 3)).toContain("3 of 5");
  });
  it("is enough at 300 from 5, still pointing at 600, and strong from 600", () => {
    const enough = thresholdMessage(300, 5);
    expect(enough).not.toMatch(/Not enough/);
    expect(enough).toContain("600");
    expect(thresholdMessage(600, 5)).toMatch(/past the stronger target/i);
  });
  it("uses the documented constants", () => {
    expect([MIN_JUDGMENTS, MIN_LISTENERS, STRONG_JUDGMENTS]).toEqual([300, 5, 600]);
  });
});

describe("decisionCards", () => {
  it("shows no ranking and no intervals below the threshold", () => {
    const [card] = decisionCards(table(299, 8, 250));
    expect(card.status).toBe("not_enough");
    expect(card.judgments).toBe(299);
    expect(card.strengths).toBeNull();
    expect(card.message).toMatch(/^Not enough judgments/);
  });

  it("is not enough when 300 judgments come from fewer than 5 listeners", () => {
    const [card] = decisionCards(table(300, 4, 250));
    expect(card.status).toBe("not_enough");
    expect(card.listeners).toBe(4);
  });

  it("fits Bradley-Terry with 95% bootstrap intervals at 300 from 5 and ranks the stronger system first", () => {
    const [card] = decisionCards(table(300, 5, 240));
    expect(card.status).toBe("enough");
    const s = card.strengths!;
    expect(s.map((x) => x.id)).toEqual(["voice", "human"]);
    for (const x of s) {
      expect(x.ciLow).toBeLessThanOrEqual(x.strength);
      expect(x.ciHigh).toBeGreaterThanOrEqual(x.strength);
    }
    expect(s[0].strength).toBeGreaterThan(s[1].strength);
    // 80% wins over 300 judgments: the intervals do not overlap
    expect(card.distinguishable).toBe(true);
    expect(card.leader).toBe("voice");
  });

  it("reports an even table as not distinguishable", () => {
    const [card] = decisionCards(table(300, 6, 150));
    expect(card.status).toBe("enough");
    expect(card.distinguishable).toBe(false);
    expect(card.leader).toBeNull();
  });

  it("calls 600 judgments the stronger target reached", () => {
    const [card] = decisionCards(table(600, 6, 420));
    expect(card.status).toBe("strong");
  });

  it("does not count demo judgments, both_unusable, or a clip paired with its own system", () => {
    const rows = [
      ...table(10, 5, 8),
      ...table(50, 5, 8, { isDemo: true }),
      ...table(50, 5, 8, { winner: "both_unusable" }),
      { a: "voice", b: "voice", winner: "a", annotatorId: "x", isDemo: false },
    ];
    const cards = decisionCards(rows);
    expect(cards).toHaveLength(1);
    expect(cards[0].judgments).toBe(10);
  });

  it("makes one card per pair of systems, in a fixed order", () => {
    const rows = [
      ...table(5, 5, 3),
      ...table(4, 4, 1, { a: "voice2", b: "human" }),
    ];
    const cards = decisionCards(rows);
    expect(cards.map((c) => c.pair)).toEqual([["human", "voice"], ["human", "voice2"]]);
  });

  it("counts ties as judgments", () => {
    const rows = table(300, 5, 0, { winner: "tie" });
    expect(decisionCards(rows)[0].judgments).toBe(300);
  });
});
