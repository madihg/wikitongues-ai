import { describe, it, expect } from "vitest";
import { share, describeArenaSignal, type ArenaSignal } from "./signal-copy";

// The real production shape on 2026-08-09: 781 non-demo comparisons, of which
// only 5 produced a decided winner.
const PRODUCTION: ArenaSignal = {
  comparisons: 781,
  decided: 5,
  ties: 1,
  bothInadequate: 775,
  heldOutPrompts: 43,
};

describe("share", () => {
  it("keeps one decimal under ten percent", () => {
    expect(share(5, 781)).toBe("0.6%");
  });

  it("rounds to whole percent at ten and above", () => {
    expect(share(775, 781)).toBe("99%");
    expect(share(1, 2)).toBe("50%");
  });

  it("is safe on an empty arena", () => {
    expect(share(0, 0)).toBe("0%");
    expect(share(3, 0)).toBe("0%");
    expect(share(0, 781)).toBe("0%");
  });
});

describe("describeArenaSignal", () => {
  it("reports the production numbers as an absence of signal", () => {
    const copy = describeArenaSignal(PRODUCTION, false);
    expect(copy.comparisons).toBe("781");
    expect(copy.decided).toBe("5");
    expect(copy.decidedShare).toBe("0.6%");
    expect(copy.bothInadequate).toBe("775");
    expect(copy.bothInadequateShare).toBe("99%");
    expect(copy.ties).toBe("1");
    expect(copy.heldOutPrompts).toBe("43");
    expect(copy.verdict).toBe("absence");
  });

  it("flips to a ranking only when the fit says candidates are separable", () => {
    expect(describeArenaSignal(PRODUCTION, true).verdict).toBe("ranking");
  });

  it("never invents its own significance threshold", () => {
    // Plenty of decided winners, but the fit still cannot separate anyone:
    // the copy must follow the fit, not the raw count.
    const lots: ArenaSignal = {
      comparisons: 5000,
      decided: 4000,
      ties: 500,
      bothInadequate: 500,
      heldOutPrompts: 43,
    };
    expect(describeArenaSignal(lots, false).verdict).toBe("absence");
  });

  it("clamps negatives and survives a cold start", () => {
    const empty: ArenaSignal = {
      comparisons: 0,
      decided: 0,
      ties: 0,
      bothInadequate: 0,
      heldOutPrompts: 0,
    };
    const copy = describeArenaSignal(empty, false);
    expect(copy.comparisons).toBe("0");
    expect(copy.decidedShare).toBe("0%");
    expect(describeArenaSignal({ ...empty, decided: -3 }, false).decided).toBe(
      "0",
    );
  });
});
