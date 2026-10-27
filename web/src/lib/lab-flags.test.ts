import { describe, it, expect, afterEach } from "vitest";
import { canUseLab, speechLabEnabled } from "./lab-flags";

const original = process.env.SPEECH_LAB_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("speechLabEnabled", () => {
  it("is off when the variable is unset", () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect(speechLabEnabled()).toBe(false);
  });

  it("is on only for the exact string 1", () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    expect(speechLabEnabled()).toBe(true);
    for (const v of ["0", "", "true", "yes", " 1", "1 "]) {
      process.env.SPEECH_LAB_ENABLED = v;
      expect(speechLabEnabled(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it("is read per call, not captured at import", () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    expect(speechLabEnabled()).toBe(true);
    process.env.SPEECH_LAB_ENABLED = "0";
    expect(speechLabEnabled()).toBe(false);
  });
});

describe("canUseLab", () => {
  it("admits researchers only", () => {
    expect(canUseLab("RESEARCHER")).toBe(true);
    expect(canUseLab("ANNOTATOR")).toBe(false);
    expect(canUseLab("LEARNER")).toBe(false);
    expect(canUseLab(null)).toBe(false);
    expect(canUseLab(undefined)).toBe(false);
    expect(canUseLab("researcher")).toBe(false);
  });
});
