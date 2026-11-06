import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GPU_RATES_PER_SECOND,
  estimateCostUsd,
  isStudioRow,
} from "./loop-config";

describe("GPU rates", () => {
  it("match the worker's rate table", () => {
    const py = readFileSync(
      join(__dirname, "../../../../worker/igala_speech/rates.py"),
      "utf8",
    );
    for (const [gpu, rate] of Object.entries(GPU_RATES_PER_SECOND)) {
      expect(py).toContain(`"${gpu}": ${rate}`);
    }
  });
});

describe("estimateCostUsd", () => {
  it("is planned GPU seconds times the rate, to four places", () => {
    expect(estimateCostUsd("train_asr")).toBe(5.6214); // 8100 s * 0.000694
    expect(estimateCostUsd("train_tts")).toBe(6.6096); // 21600 s * 0.000306
    expect(estimateCostUsd("evaluate")).toBe(0.2754);
    expect(estimateCostUsd("transcribe")).toBe(0.5508);
  });
});

describe("isStudioRow", () => {
  it("matches the studio sourceRef prefix only", () => {
    expect(isStudioRow({ sourceRef: "studio:session-1" })).toBe(true);
    expect(isStudioRow({ sourceRef: "grn" })).toBe(false);
    expect(isStudioRow({ sourceRef: null })).toBe(false);
  });
});
