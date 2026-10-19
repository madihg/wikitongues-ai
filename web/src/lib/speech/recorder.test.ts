import { describe, it, expect } from "vitest";
import {
  RECORDER_MIME_CANDIDATES,
  countdownSeconds,
  formatClock,
  pickRecorderMime,
  sha256Hex,
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

describe("sha256Hex", () => {
  it("matches the sha256 test vector for abc", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
