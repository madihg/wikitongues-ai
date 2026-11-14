import { describe, it, expect } from "vitest";
import { decide, DECIDE_CONFIG, type DecideState } from "./decide";

const NOW = new Date("2026-11-07T02:00:00Z");
const base: DecideState = {
  newAsrMinutes: 0,
  newStudioMinutes: 0,
  studioTotalHours: 0,
  lastAsrRunAt: null,
  lastTtsRunAt: null,
  paused: false,
  monthSpendUsd: 0,
  monthlyCapUsd: 200,
  now: NOW,
};
const d = (over: Partial<DecideState>) => decide({ ...base, ...over });

describe("decide thresholds", () => {
  it("keeps the thresholds in one config object", () => {
    expect(DECIDE_CONFIG).toEqual({
      asrMinNewMinutes: 30,
      ttsMinNewStudioMinutes: 30,
      ttsMinStudioHours: 5,
    });
  });
});

describe("decide: ASR", () => {
  it("skips just below 30 new minutes, with the reason", () => {
    const r = d({ newAsrMinutes: 29.9 });
    expect(r.asr).toBe("skip");
    expect(r.reasons).toContain("asr: 29.9 new minutes, below 30");
  });

  it("trains at exactly 30 new minutes", () => {
    const r = d({ newAsrMinutes: 30 });
    expect(r.asr).toBe("train");
    expect(r.reasons).toContain("asr: 30.0 new minutes, at or above 30");
  });

  it("skips when it already ran today, trains when the last run was yesterday", () => {
    const today = d({
      newAsrMinutes: 90,
      lastAsrRunAt: new Date("2026-11-07T00:10:00Z"),
    });
    expect(today.asr).toBe("skip");
    expect(today.reasons).toContain("asr: already ran today");
    const yesterday = d({
      newAsrMinutes: 90,
      lastAsrRunAt: new Date("2026-11-06T23:59:00Z"),
    });
    expect(yesterday.asr).toBe("train");
  });
});

describe("decide: TTS", () => {
  const ok = { newStudioMinutes: 30, studioTotalHours: 5 };

  it("trains at exactly 30 new studio minutes and 5 hours in total", () => {
    const r = d(ok);
    expect(r.tts).toBe("train");
    expect(r.reasons).toContain(
      "tts: 30.0 new studio minutes and 5.0 studio hours in total",
    );
  });

  it("skips just below 30 new studio minutes", () => {
    const r = d({ ...ok, newStudioMinutes: 29.9 });
    expect(r.tts).toBe("skip");
    expect(r.reasons).toContain("tts: 29.9 new studio minutes, below 30");
  });

  it("skips just below 5 studio hours even with plenty of new minutes", () => {
    const r = d({ ...ok, newStudioMinutes: 120, studioTotalHours: 4.9 });
    expect(r.tts).toBe("skip");
    expect(r.reasons).toContain("tts: 4.9 studio hours in total, below 5");
  });

  it("skips when it already ran today", () => {
    const r = d({ ...ok, lastTtsRunAt: new Date("2026-11-07T01:00:00Z") });
    expect(r.tts).toBe("skip");
    expect(r.reasons).toContain("tts: already ran today");
  });

  it("decides ASR and TTS independently", () => {
    const r = d({ ...ok, newAsrMinutes: 5 });
    expect([r.asr, r.tts]).toEqual(["skip", "train"]);
  });
});

describe("decide: pause and cap beat the minutes", () => {
  const rich = {
    newAsrMinutes: 600,
    newStudioMinutes: 600,
    studioTotalHours: 50,
  };

  it("launches nothing when paused", () => {
    const r = d({ ...rich, paused: true });
    expect([r.asr, r.tts]).toEqual(["skip", "skip"]);
    expect(r.reasons).toEqual(["paused: the loop is paused"]);
  });

  it("launches nothing once the month's spend reaches the cap", () => {
    const r = d({ ...rich, monthSpendUsd: 200, monthlyCapUsd: 200 });
    expect([r.asr, r.tts]).toEqual(["skip", "skip"]);
    expect(r.reasons).toEqual([
      "cap: month spend 200.00 has reached the cap 200.00",
    ]);
  });

  it("still launches one cent under the cap", () => {
    const r = d({ ...rich, monthSpendUsd: 199.99, monthlyCapUsd: 200 });
    expect([r.asr, r.tts]).toEqual(["train", "train"]);
  });

  it("reports the pause, not the cap, when both hold", () => {
    const r = d({ ...rich, paused: true, monthSpendUsd: 500 });
    expect(r.reasons).toEqual(["paused: the loop is paused"]);
  });
});
