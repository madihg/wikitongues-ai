import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { CallbackPayload } from "./job-callback";
import { isRegressed, registerCandidate } from "./candidates";

describe("isRegressed", () => {
  const promoted = { cer: 0.2, ter: 0.3 };

  it("is false with nothing promoted", () => {
    expect(isRegressed({ cer: 0.9, ter: 0.9 }, null)).toBe(false);
  });

  it("flags CER more than 1.0 point worse, not exactly 1.0", () => {
    expect(isRegressed({ cer: 0.2101, ter: 0.3 }, promoted)).toBe(true);
    expect(isRegressed({ cer: 0.21, ter: 0.3 }, promoted)).toBe(false);
  });

  it("flags TER more than 2.0 points worse, not exactly 2.0", () => {
    expect(isRegressed({ cer: 0.2, ter: 0.3201 }, promoted)).toBe(true);
    expect(isRegressed({ cer: 0.2, ter: 0.32 }, promoted)).toBe(false);
  });

  it("does not flag a better or equal model", () => {
    expect(isRegressed({ cer: 0.1, ter: 0.1 }, promoted)).toBe(false);
    expect(isRegressed(promoted, promoted)).toBe(false);
  });
});

const evaluated: CallbackPayload = {
  jobId: "eval1",
  kind: "evaluate",
  status: "succeeded",
  gpuSeconds: 10,
  costUsd: 0.01,
  modelRef: "/checkpoints/asr/job1",
  metrics: null,
  transcripts: null,
  outputs: null,
  error: null,
};

function txWith(over: {
  train?: unknown;
  existing?: unknown;
  result?: unknown;
  promoted?: unknown;
}) {
  const tx = {
    speechTrainJob: {
      findFirst: vi.fn().mockResolvedValue("train" in over ? over.train : { id: "job1" }),
    },
    speechCandidate: {
      findUnique: vi.fn().mockResolvedValue(over.existing ?? null),
      findFirst: vi.fn().mockResolvedValue(over.promoted ?? null),
      create: vi.fn().mockResolvedValue({ id: "c1" }),
    },
    speechEvalResult: {
      findFirst: vi
        .fn()
        .mockResolvedValue("result" in over ? over.result : { id: "e1", cer: 0.2, ter: 0.3 }),
    },
  };
  return tx;
}
const run = (tx: ReturnType<typeof txWith>, p = evaluated) =>
  registerCandidate(tx as unknown as Prisma.TransactionClient, p);

describe("registerCandidate", () => {
  it("creates an unregressed candidate when nothing is promoted", async () => {
    const tx = txWith({});
    expect(await run(tx)).toEqual({ candidateId: "c1", regressed: false, delta: null });
    expect(tx.speechCandidate.create).toHaveBeenCalledWith({
      data: {
        system: "asr",
        modelRef: "/checkpoints/asr/job1",
        jobId: "job1",
        evalResultId: "e1",
        regressed: false,
      },
      select: { id: true },
    });
  });

  it("sets regressed against the promoted candidate's eval result", async () => {
    const tx = txWith({ promoted: { evalResult: { cer: 0.1, ter: 0.3 } } });
    const r = await run(tx);
    expect(r?.regressed).toBe(true);
    expect(r?.delta?.cer).toBeCloseTo(10);
    expect(tx.speechCandidate.create.mock.calls[0][0].data.regressed).toBe(true);
  });

  it("makes no candidate for a baseline (no train job made the model)", async () => {
    const tx = txWith({ train: null });
    expect(await run(tx, { ...evaluated, modelRef: "base" })).toBeNull();
    expect(tx.speechCandidate.create).not.toHaveBeenCalled();
  });

  it("ignores other kinds, failed evaluates, and models that already have a candidate", async () => {
    const tx = txWith({});
    expect(await run(tx, { ...evaluated, kind: "train_asr" })).toBeNull();
    expect(await run(tx, { ...evaluated, status: "failed" })).toBeNull();
    const dup = txWith({ existing: { id: "c0" } });
    expect(await run(dup)).toBeNull();
    expect(dup.speechCandidate.create).not.toHaveBeenCalled();
  });
});
