import { describe, it, expect } from "vitest";
import { licensedRow, openRow } from "./fixtures";
import { firstModelPlanFile } from "../../../scripts/speech/first-model-plan";
import type { LoopRow } from "./training-manifest";

const cleared = (id: string, over: Partial<LoopRow> = {}): LoopRow =>
  licensedRow({
    id,
    voiceCloningOptIn: true,
    annotatorId: "speaker-a",
    coldAuthorAnswer: { answerText: `sentence ${id}` },
    ...over,
  });

const opts = {
  signedUrl: (k: string) => `https://signed.example/${k}`,
  promptIdOf: (id: string) => `prompt-of-${id}`,
  runId: "proto-test",
  epochs: 200,
  batchSize: 8,
};

describe("scripts/speech/first-model-plan.ts (firstModelPlanFile)", () => {
  it("writes the shape the worker's fine-tune stage reads, with the guard named", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((id) => cleared(id));
    const { file, heldOut } = firstModelPlanFile(rows, opts);
    expect(file.guard).toBe("canTrain:internal:cloning");
    expect(file.system).toBe("mms-tts-yor-igala-ft");
    expect(file.train.length + heldOut).toBe(6);
    expect(Object.keys(file.train[0]).sort()).toEqual(["id", "text", "url"]);
    expect(file.sentences.length).toBe(heldOut);
    expect(file.sentences[0].promptId).toMatch(/^prompt-of-/);
    // The batch never exceeds the clips there are.
    expect(file.batchSize).toBe(Math.min(8, file.train.length));
  });

  it("gives an empty plan when no clip has been kept by Check", () => {
    const rows = [cleared("a", { reviewStatus: null }), cleared("b", { reviewStatus: null })];
    const { file, counts } = firstModelPlanFile(rows, opts);
    expect(file.train).toEqual([]);
    expect(counts.refused).toEqual({ not_kept: 2 });
  });

  it("holds Open clips back unless the hold is lifted on purpose", () => {
    const rows = [
      openRow({ id: "o1", voiceCloningOptIn: true, annotatorId: "speaker-a" }),
      openRow({ id: "o2", voiceCloningOptIn: true, annotatorId: "speaker-a" }),
    ];
    expect(firstModelPlanFile(rows, opts).file.train).toEqual([]);
    expect(firstModelPlanFile(rows, opts).counts.heldTier).toBe(2);
    expect(firstModelPlanFile(rows, { ...opts, heldTiers: [] }).file.train.length).toBe(2);
  });
});
