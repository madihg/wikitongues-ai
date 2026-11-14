import { describe, it, expect } from "vitest";
import {
  EXAM_TIER_MEANING,
  HUMAN_TIER_MEANING,
  examTier,
  humanTier,
  nextExamTier,
  nextHumanTier,
  showsPercent,
} from "./tiers";

describe("humanTier: the word next to a listener number", () => {
  it("is Too few under 30 rounds, however many listeners", () => {
    expect(humanTier(0, 0, 0)).toBe("Too few");
    expect(humanTier(29, 29, 9)).toBe("Too few");
    expect(showsPercent("Too few")).toBe(false);
  });

  it("is Early from 30 rounds", () => {
    expect(humanTier(30, 30, 1)).toBe("Early");
    expect(humanTier(99, 99, 1)).toBe("Early");
    expect(showsPercent("Early")).toBe(true);
  });

  it("is Readable from 100 rounds, but only on 50 sentences or more", () => {
    expect(humanTier(100, 50, 1)).toBe("Readable");
    expect(humanTier(100, 49, 1)).toBe("Early");
    expect(humanTier(299, 60, 2)).toBe("Readable");
  });

  it("is Ranking from 300 rounds, but only with 5 listeners (the decision card's rule)", () => {
    expect(humanTier(300, 60, 5)).toBe("Ranking");
    expect(humanTier(300, 60, 4)).toBe("Readable");
    expect(humanTier(599, 60, 5)).toBe("Ranking");
  });

  it("is Strong from 600 rounds with 5 listeners", () => {
    expect(humanTier(600, 60, 5)).toBe("Strong");
    expect(humanTier(600, 60, 4)).toBe("Readable");
  });

  it("explains every word in one sentence", () => {
    for (const s of Object.values(HUMAN_TIER_MEANING)) {
      expect(s.endsWith(".")).toBe(true);
      expect(s).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe("nextHumanTier: the distance to the next word", () => {
  it("counts the rounds still missing", () => {
    expect(nextHumanTier(0, 0, 0)).toBe("30 more rounds to reach Early.");
    expect(nextHumanTier(29, 20, 1)).toBe("1 more round to reach Early.");
  });

  it("names both things missing for Readable", () => {
    expect(nextHumanTier(40, 40, 1)).toBe(
      "60 more rounds and 10 more sentences to reach Readable.",
    );
    expect(nextHumanTier(120, 49, 1)).toBe(
      "1 more sentence to reach Readable.",
    );
  });

  it("names the listeners missing for Ranking", () => {
    expect(nextHumanTier(100, 50, 1)).toBe(
      "200 more rounds and 4 more listeners to reach Ranking.",
    );
    expect(nextHumanTier(400, 50, 4)).toBe("1 more listener to reach Ranking.");
  });

  it("then Strong, then nothing", () => {
    expect(nextHumanTier(300, 60, 5)).toBe("300 more rounds to reach Strong.");
    expect(nextHumanTier(600, 60, 5)).toBeNull();
  });
});

describe("examTier: the word next to an automatic number", () => {
  it("is Smoke test under 50 exam clips", () => {
    expect(examTier(0, 0)).toBe("Smoke test");
    expect(examTier(49, 5)).toBe("Smoke test");
  });

  it("is Early from 50 clips", () => {
    expect(examTier(50, 1)).toBe("Early");
    expect(examTier(299, 9)).toBe("Early");
  });

  it("is Trustworthy from 300 clips, but only with 3 speakers", () => {
    expect(examTier(300, 3)).toBe("Trustworthy");
    expect(examTier(300, 2)).toBe("Early");
  });

  it("is a smoke test whatever its size when the clips are not a locked exam", () => {
    expect(examTier(72, 2, false)).toBe("Smoke test");
    expect(examTier(900, 9, false)).toBe("Smoke test");
    expect(nextExamTier(72, 2, false)).toBe(
      "Lock 50 exam clips and score the model on them to reach Early.",
    );
  });

  it("says how far the next word is", () => {
    expect(nextExamTier(0, 0)).toBe("50 more exam clips to reach Early.");
    expect(nextExamTier(49, 1)).toBe("1 more exam clip to reach Early.");
    expect(nextExamTier(62, 2)).toBe(
      "238 more exam clips and 1 more speaker to reach Trustworthy.",
    );
    expect(nextExamTier(300, 3)).toBeNull();
  });

  it("explains every word in one sentence or two", () => {
    for (const s of Object.values(EXAM_TIER_MEANING)) {
      expect(s.endsWith(".")).toBe(true);
    }
  });
});
