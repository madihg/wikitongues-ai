import { describe, it, expect } from "vitest";
import {
  STUDIO_CHECKLIST,
  isStudioSessionId,
  levelOf,
  parseScript,
  studioClipKept,
  summarizeStudio,
} from "./studio";

describe("studio session id", () => {
  it("accepts short opaque ids and refuses anything else", () => {
    expect(isStudioSessionId("s-2026-11-06-a1b2c3")).toBe(true);
    expect(isStudioSessionId("short")).toBe(false);
    expect(isStudioSessionId("has space in it")).toBe(false);
    expect(isStudioSessionId("x".repeat(65))).toBe(false);
    expect(isStudioSessionId(7)).toBe(false);
  });
});

describe("parseScript", () => {
  it("reads JSON lines, counts the lines it cannot read, and ignores blanks", () => {
    const text = [
      JSON.stringify({ n: 1, promptCode: "xx_001", text: "kwa gbo chi" }),
      "",
      "not json",
      JSON.stringify({ n: 3, promptCode: "", text: "no code" }),
      JSON.stringify({ n: 4, promptCode: "xx_004", text: "  " }),
      JSON.stringify({ promptCode: "xx_005", text: "gwa kpe nwa" }),
    ].join("\n");
    const out = parseScript(text);
    expect(out.lines.map((l) => [l.promptCode, l.text])).toEqual([
      ["xx_001", "kwa gbo chi"],
      ["xx_005", "gwa kpe nwa"],
    ]);
    expect(out.unreadable).toBe(3);
  });
});

describe("summarizeStudio", () => {
  const rows = [
    { studioSessionId: "s1", durationMs: 60_000, reviewStatus: "keep" },
    { studioSessionId: "s1", durationMs: 30_000, reviewStatus: null },
    { studioSessionId: "s1", durationMs: 10_000, reviewStatus: "bad_audio" },
    { studioSessionId: "s2", durationMs: 120_000, reviewStatus: "keep" },
  ];
  it("counts minutes recorded and kept for the session and the total toward the target", () => {
    const s = summarizeStudio(rows, "s1", 5);
    expect(s.session).toMatchObject({ clips: 3, recordedMinutes: 100 / 60, keptMinutes: 1, keptClips: 1 });
    expect(s.total.keptMinutes).toBe(3);
    expect(s.total.recordedMinutes).toBeCloseTo(220 / 60, 10);
    expect(s.targetMinutes).toBe(300);
    expect(s.percentOfTarget).toBeCloseTo(1, 10);
  });
  it("caps the percentage at 100 and handles no rows", () => {
    expect(summarizeStudio(rows, "s1", 0.01).percentOfTarget).toBe(100);
    expect(summarizeStudio([], "s1", 5).total.keptMinutes).toBe(0);
  });
});

describe("take check", () => {
  const clean = {
    durationMs: 4000,
    leadingSilenceMs: 300,
    trailingSilenceMs: 400,
    speechShare: 0.7,
    rmsDbfs: -22,
    peakDbfs: -6,
    clippingShare: 0,
    syllables: 16,
    syllablesPerSecond: 4,
  };
  it("keeps a clip only when its metrics exist and carry no warning", () => {
    expect(studioClipKept(null)).toBe(false);
    expect(studioClipKept(clean)).toBe(true);
    expect(studioClipKept({ ...clean, clippingShare: 0.05, peakDbfs: -0.1 })).toBe(false);
    expect(studioClipKept({ ...clean, rmsDbfs: -50 })).toBe(false);
  });
});

describe("levelOf (the live meter)", () => {
  it("reads silence, a half-scale tone and a clipped signal", () => {
    expect(levelOf(new Float32Array(480)).peakDbfs).toBe(-Infinity);
    const half = Float32Array.from({ length: 480 }, (_, i) => 0.5 * Math.sin(i));
    const l = levelOf(half);
    expect(l.peakDbfs).toBeGreaterThan(-6.1);
    expect(l.peakDbfs).toBeLessThanOrEqual(-6);
    expect(l.clipping).toBe(false);
    const hot = Float32Array.from({ length: 480 }, (_, i) => (i % 2 ? 1 : -1));
    expect(levelOf(hot).clipping).toBe(true);
    expect(levelOf(hot).peakDbfs).toBeCloseTo(0, 5);
  });
});

describe("checklist", () => {
  it("names the four things the studio asks for", () => {
    expect(STUDIO_CHECKLIST.map((c) => c.key)).toEqual(["quiet_room", "same_mic", "water", "no_clothing_noise"]);
  });
});
