import { describe, it, expect } from "vitest";
import {
  assertNumbersOnly,
  newEvalRows,
  type EvalResultRow,
} from "../../../scripts/speech/record-speech-measures";

const row = (over: Partial<EvalResultRow> = {}): EvalResultRow => ({
  modelRef: "asr-x",
  manifestVersion: "v1",
  cer: 0.4,
  werStripped: 0.8,
  werRetained: 0.9,
  ter: 0.2,
  perSpeaker: {},
  perDialect: {},
  nClips: 72,
  ...over,
});

describe("scripts/speech/record-speech-measures.ts", () => {
  it("skips an eval row already stored for the same model and clip set", () => {
    const rows = [row(), row({ modelRef: "asr-y" }), row({ manifestVersion: "v2" })];
    const fresh = newEvalRows(rows, [{ modelRef: "asr-x", manifestVersion: "v1" }]);
    expect(fresh.map((r) => `${r.modelRef}/${r.manifestVersion}`)).toEqual(["asr-y/v1", "asr-x/v2"]);
  });

  it("writes a repeated row in one file once", () => {
    expect(newEvalRows([row(), row()], []).length).toBe(1);
  });

  it("refuses a score that is not a number, and an empty set", () => {
    expect(() => newEvalRows([row({ cer: Number.NaN })], [])).toThrow(/cer/);
    expect(() => newEvalRows([row({ ter: -1 })], [])).toThrow(/ter/);
    expect(() => newEvalRows([row({ nClips: 0 })], [])).toThrow(/nClips/);
  });

  it("refuses a file that carries clip text", () => {
    expect(() =>
      assertNumbersOnly({
        clipMeasures: [
          {
            clipKey: "c1",
            recordingId: "c1",
            promptId: "p1",
            language: "igala",
            systemRef: "human",
            stage: "raw",
            rulerRef: "asr-x",
            values: { cer: 0.3, hypothesis: "tava lime" },
          },
        ],
      }),
    ).toThrow(/clip text/);
    expect(() =>
      assertNumbersOnly({
        autoMeasures: [
          { kind: "k", modelRef: "m", rulerRef: "r", manifestVersion: "v", nClips: 1, values: { note: "tava lime sura" } },
        ],
      }),
    ).toThrow(/numbers and codes only/);
  });

  it("accepts numbers, codes and nested logs", () => {
    expect(() =>
      assertNumbersOnly({
        evalResults: [row({ perSpeaker: { spk_1: { cer: 0.4, nClips: 3 } } })],
        clipMeasures: [
          {
            clipKey: "c1",
            recordingId: "c1",
            promptId: "p1",
            language: "igala",
            systemRef: "human",
            stage: "raw",
            rulerRef: "quality-v1",
            values: { peakDbfs: -5.1, lufs: null, gate: "accept", reasons: ["peak_hot"] },
          },
        ],
        derivatives: [
          {
            recordingId: "c1",
            kind: "clean",
            version: "clean-v1",
            rawKey: "clips/c1.webm",
            key24k: null,
            key16k: null,
            usedDenoised: true,
            keptRawReason: null,
            log: { denoiser: { tool: "DeepFilterNet3", version: "0.5.6" } },
          },
        ],
      }),
    ).not.toThrow();
  });
});
