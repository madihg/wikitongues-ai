import { describe, it, expect, afterEach } from "vitest";
import { speechLoopEnabled } from "./loop-flags";

const original = process.env.SPEECH_LOOP_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LOOP_ENABLED;
  else process.env.SPEECH_LOOP_ENABLED = original;
});

describe("speechLoopEnabled", () => {
  it("is off when unset", () => {
    delete process.env.SPEECH_LOOP_ENABLED;
    expect(speechLoopEnabled()).toBe(false);
  });

  it("is on only for exactly 1, and is read per call", () => {
    process.env.SPEECH_LOOP_ENABLED = "1";
    expect(speechLoopEnabled()).toBe(true);
    process.env.SPEECH_LOOP_ENABLED = "true";
    expect(speechLoopEnabled()).toBe(false);
    process.env.SPEECH_LOOP_ENABLED = "0";
    expect(speechLoopEnabled()).toBe(false);
    process.env.SPEECH_LOOP_ENABLED = "1";
    expect(speechLoopEnabled()).toBe(true);
  });
});
