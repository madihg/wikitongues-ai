import { describe, it, expect, afterEach } from "vitest";
import {
  canProbeSpeech,
  canUseLab,
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "./lab-flags";

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

describe("speechLayerAnnotatorsEnabled", () => {
  const was = process.env.SPEECH_LAYER_ANNOTATORS;
  afterEach(() => {
    if (was === undefined) delete process.env.SPEECH_LAYER_ANNOTATORS;
    else process.env.SPEECH_LAYER_ANNOTATORS = was;
  });

  it("is off when unset and on only for the exact string 1, read per call", () => {
    delete process.env.SPEECH_LAYER_ANNOTATORS;
    expect(speechLayerAnnotatorsEnabled()).toBe(false);
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    expect(speechLayerAnnotatorsEnabled()).toBe(true);
    for (const v of ["0", "", "true", " 1"]) {
      process.env.SPEECH_LAYER_ANNOTATORS = v;
      expect(speechLayerAnnotatorsEnabled(), v).toBe(false);
    }
  });
});

describe("canUseSpeech", () => {
  it("a researcher needs the lab only", () => {
    expect(canUseSpeech("RESEARCHER", { lab: true, layer: false })).toBe(true);
    expect(canUseSpeech("RESEARCHER", { lab: true, layer: true })).toBe(true);
    expect(canUseSpeech("RESEARCHER", { lab: false, layer: true })).toBe(false);
  });

  it("an annotator needs the lab and the layer", () => {
    expect(canUseSpeech("ANNOTATOR", { lab: true, layer: true })).toBe(true);
    expect(canUseSpeech("ANNOTATOR", { lab: true, layer: false })).toBe(false);
    expect(canUseSpeech("ANNOTATOR", { lab: false, layer: true })).toBe(false);
  });

  it("a learner, an unknown role or nobody never", () => {
    for (const role of ["LEARNER", "annotator", "", null, undefined]) {
      expect(canUseSpeech(role, { lab: true, layer: true }), String(role)).toBe(false);
    }
  });
});

describe("canProbeSpeech", () => {
  it("is for researchers and annotators only", () => {
    expect(canProbeSpeech("RESEARCHER")).toBe(true);
    expect(canProbeSpeech("ANNOTATOR")).toBe(true);
    expect(canProbeSpeech("LEARNER")).toBe(false);
    expect(canProbeSpeech(null)).toBe(false);
  });
});
