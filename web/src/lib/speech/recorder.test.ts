import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CAPTURE_MODE,
  RECORDER_MIME_CANDIDATES,
  appliedCapture,
  captureConstraints,
  captureHonoured,
  captureMode,
  countdownSeconds,
  formatClock,
  pickRecorderMime,
  sanitizeCapture,
} from "./recorder";

describe("pickRecorderMime", () => {
  it("prefers webm with opus when supported", () => {
    expect(pickRecorderMime(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to audio/mp4 on a browser that only records mp4 (iOS Safari)", () => {
    expect(pickRecorderMime((m) => m === "audio/mp4")).toBe("audio/mp4");
  });

  it("falls back through plain webm to ogg", () => {
    expect(pickRecorderMime((m) => m === "audio/webm")).toBe("audio/webm");
    expect(pickRecorderMime((m) => m === "audio/ogg;codecs=opus")).toBe(
      "audio/ogg;codecs=opus",
    );
  });

  it("returns null when nothing is supported", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });

  it("offers only types the server accepts", async () => {
    const { isAllowedAudioMime } = await import("./storage");
    for (const m of RECORDER_MIME_CANDIDATES) {
      expect(isAllowedAudioMime(m), m).toBe(true);
    }
  });
});

describe("countdownSeconds", () => {
  it("is null before 25 seconds", () => {
    expect(countdownSeconds(0)).toBeNull();
    expect(countdownSeconds(24_999)).toBeNull();
  });

  it("counts 5 down to 0 over the last five seconds", () => {
    expect(countdownSeconds(25_000)).toBe(5);
    expect(countdownSeconds(25_500)).toBe(5);
    expect(countdownSeconds(26_000)).toBe(4);
    expect(countdownSeconds(29_001)).toBe(1);
    expect(countdownSeconds(30_000)).toBe(0);
  });

  it("never goes negative past the cap", () => {
    expect(countdownSeconds(31_000)).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats m:ss.t", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(7_400)).toBe("0:07.4");
    expect(formatClock(30_000)).toBe("0:30.0");
  });

  it("clamps to the 30 second cap and below zero", () => {
    expect(formatClock(45_000)).toBe("0:30.0");
    expect(formatClock(-5)).toBe("0:00.0");
  });
});

describe("capture settings (decided 2026-11-13: raw, behind a switch until Halim confirms)", () => {
  it("nothing changes by default: the recorder asks what it always asked", () => {
    expect(DEFAULT_CAPTURE_MODE).toBe("processed");
    expect(captureMode(undefined)).toBe("processed");
    expect(captureMode("")).toBe("processed");
    expect(captureMode("1")).toBe("processed");
    expect(captureMode("Raw")).toBe("processed");
  });

  it("NEXT_PUBLIC_SPEECH_CAPTURE=raw switches every ordinary clip to raw, and processed says so explicitly", () => {
    expect(captureMode("raw")).toBe("raw");
    expect(captureMode("processed")).toBe("processed");
  });

  it("raw asks for all three off, together (the gain setting is ignored otherwise)", () => {
    expect(captureConstraints("raw")).toEqual({
      channelCount: 1,
      sampleRate: { ideal: 48000 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it("processed is exactly what the recorder asked before: two on, gain left to the browser", () => {
    const c = captureConstraints("processed");
    expect(c).toEqual({
      channelCount: 1,
      sampleRate: { ideal: 48000 },
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect("autoGainControl" in c).toBe(false);
  });

  it("reads back what the browser applied, not what was asked", () => {
    const c = appliedCapture(
      "raw",
      {
        echoCancellation: false,
        noiseSuppression: true, // the browser ignored the request
        autoGainControl: false,
        sampleRate: 44100,
        channelCount: 1,
        deviceId: "must-not-be-kept",
      },
      "TestBrowser/1.0",
    );
    expect(c).toEqual({
      requested: "raw",
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
      sampleRate: 44100,
      channelCount: 1,
      userAgent: "TestBrowser/1.0",
    });
    expect(captureHonoured(c)).toBe(false);
  });

  it("a browser that reports nothing is unknown, not a failure", () => {
    const c = appliedCapture("raw", undefined);
    expect(c).toEqual({
      requested: "raw",
      echoCancellation: null,
      noiseSuppression: null,
      autoGainControl: null,
      sampleRate: null,
      channelCount: null,
    });
    expect(captureHonoured(c)).toBe(true);
    expect(
      captureHonoured(
        appliedCapture("processed", { echoCancellation: true, noiseSuppression: true }),
      ),
    ).toBe(true);
  });

  it("the device id and label are never kept; the user agent is capped", () => {
    const c = appliedCapture(
      "raw",
      { deviceId: "abc", groupId: "g", label: "Agnes laptop mic" },
      "x".repeat(500),
    );
    expect(JSON.stringify(c)).not.toContain("abc");
    expect(JSON.stringify(c)).not.toContain("laptop");
    expect(c.userAgent).toHaveLength(200);
  });

  it("sanitizeCapture keeps a well-formed record and refuses anything else", () => {
    const ok = {
      requested: "raw",
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: null,
      sampleRate: 48000,
      channelCount: 1,
    };
    expect(sanitizeCapture(ok)).toEqual(ok);
    expect(
      sanitizeCapture({ ...ok, echoCancellation: "false", sampleRate: 5, extra: 1 }),
    ).toEqual({ ...ok, echoCancellation: null, sampleRate: null });
    for (const bad of [null, "raw", [], {}, { requested: "loud" }]) {
      expect(sanitizeCapture(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("the recorder opens the microphone through these, and keeps what was applied on the take", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components", "lab", "use-recorder.ts"),
      "utf8",
    );
    expect(src).toContain('const mode = opts.raw === true ? "raw" : captureMode();');
    expect(src).toContain("audio: captureConstraints(mode),");
    expect(src).toContain("stream.getAudioTracks()[0]?.getSettings()");
    expect(src).toContain("const capture = appliedCapture(");
    expect(src).toContain("mime: type, capture });");
    // No constraint is written by hand any more.
    expect(src).not.toMatch(/echoCancellation:|noiseSuppression:|autoGainControl:/);
  });

  it("the clip stores the capture settings and the room reading with its take metrics", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components", "lab", "record-clip.tsx"),
      "utf8",
    );
    expect(src).toContain("capture: take.capture,");
    expect(src).toContain("const room = readRoomReading();");
    expect(src).toContain("...(room ? { room } : {}),");
  });
});
