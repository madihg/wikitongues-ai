import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signBody } from "@/lib/speech/job-signing";

const { tx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    speechTrainJob: { updateMany: vi.fn() },
    speechEvalResult: { create: vi.fn() },
    speechTranscript: { createMany: vi.fn() },
    speechRecording: { createMany: vi.fn() },
    prompt: { findMany: vi.fn() },
    speechCandidate: { createMany: vi.fn() },
    costEntry: { create: vi.fn() },
  };
  const mockPrisma = {
    speechTrainJob: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, mockPrisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST } from "./route";

const SECRET = "test-secret-not-real";
const saved = process.env.SPEECH_WORKER_SECRET;

function request(
  payload: unknown,
  over: { secret?: string; sig?: string; ts?: string; raw?: string } = {},
) {
  const raw = over.raw ?? JSON.stringify(payload);
  const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
  return new Request("http://test/api/speech/jobs/callback", {
    method: "POST",
    body: raw,
    headers: {
      "x-shared-secret": over.secret ?? SECRET,
      "x-timestamp": ts,
      "x-signature": over.sig ?? signBody(SECRET, ts, raw),
    },
  });
}

const base = {
  jobId: "job1",
  kind: "train_asr",
  status: "succeeded",
  gpuSeconds: 100,
  costUsd: 0.0694,
  modelRef: "/checkpoints/asr/job1",
  metrics: null,
  transcripts: null,
  outputs: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_WORKER_SECRET = SECRET;
  mockPrisma.speechTrainJob.findUnique.mockResolvedValue({ id: "job1", status: "running" });
  tx.speechTrainJob.updateMany.mockResolvedValue({ count: 1 });
  tx.prompt.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
});
afterEach(() => {
  if (saved === undefined) delete process.env.SPEECH_WORKER_SECRET;
  else process.env.SPEECH_WORKER_SECRET = saved;
});

describe("POST /api/speech/jobs/callback: who may call", () => {
  it("is dark (404, no database touched) when the worker secret is not configured", async () => {
    delete process.env.SPEECH_WORKER_SECRET;
    const res = await POST(request(base));
    expect(res.status).toBe(404);
    expect(mockPrisma.speechTrainJob.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("401 with no detail on a wrong secret, a bad signature and a stale timestamp", async () => {
    const stale = String(Math.floor(Date.now() / 1000) - 400);
    const bad = [
      request(base, { secret: "nope" }),
      request(base, { sig: "0".repeat(64) }),
      request(base, { sig: "" }),
      request(base, { ts: stale }),
      request(base, { ts: "abc" }),
    ];
    for (const req of bad) {
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(mockPrisma.speechTrainJob.findUnique).not.toHaveBeenCalled();
  });

  it("401 when the body was changed after signing", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signBody(SECRET, ts, JSON.stringify(base));
    const res = await POST(
      request(null, { raw: JSON.stringify({ ...base, costUsd: 0 }), ts, sig }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/speech/jobs/callback: what it writes", () => {
  it("a finished training job: status, cost, gpu seconds, output ref, one finetune cost entry", async () => {
    const res = await POST(request(base));
    expect(res.status).toBe(200);
    const arg = tx.speechTrainJob.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "job1", status: { in: ["queued", "running"] } });
    expect(arg.data).toMatchObject({
      status: "succeeded",
      costUsd: 0.0694,
      gpuSeconds: 100,
      outputRef: "/checkpoints/asr/job1",
      error: null,
    });
    expect(arg.data.completedAt).toBeInstanceOf(Date);
    expect(tx.costEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.costEntry.create.mock.calls[0][0].data).toMatchObject({
      category: "finetune",
      provider: "modal",
      amountUsd: 0.0694,
      estimated: false,
      refType: "speech_train_job",
      refId: "job1",
    });
    expect(tx.speechEvalResult.create).not.toHaveBeenCalled();
  });

  it("a finished tts training job registers its voice as a tts candidate, once", async () => {
    const res = await POST(
      request({ ...base, kind: "train_tts", modelRef: "/checkpoints/tts/job1" }),
    );
    expect(res.status).toBe(200);
    expect(tx.speechCandidate.createMany).toHaveBeenCalledWith({
      data: [{ system: "tts", modelRef: "/checkpoints/tts/job1", jobId: "job1" }],
      skipDuplicates: true,
    });
  });

  it("an asr training job, a failed tts job and a duplicate callback register nothing", async () => {
    await POST(request(base));
    await POST(request({ ...base, kind: "train_tts", status: "failed", error: "oom", modelRef: null }));
    mockPrisma.speechTrainJob.findUnique.mockResolvedValue({ id: "job1", status: "succeeded" });
    await POST(request({ ...base, kind: "train_tts", modelRef: "/checkpoints/tts/job1" }));
    expect(tx.speechCandidate.createMany).not.toHaveBeenCalled();
  });

  it("evaluate writes a SpeechEvalResult and an eval_generation cost entry", async () => {
    const metrics = {
      manifestVersion: "mv1",
      nClips: 3,
      aggregate: { cer: 0.07, werStripped: 0.33, werRetained: 0.4, ter: 0.1 },
      perSpeaker: { "spk-a": { cer: 0.1, nClips: 2 } },
      perDialect: { north: { cer: 0.1, nClips: 2 } },
    };
    const res = await POST(
      request({ ...base, kind: "evaluate", modelRef: "base", metrics }),
    );
    expect(res.status).toBe(200);
    expect(tx.speechEvalResult.create.mock.calls[0][0].data).toEqual({
      jobId: "job1",
      modelRef: "base",
      manifestVersion: "mv1",
      cer: 0.07,
      werStripped: 0.33,
      werRetained: 0.4,
      ter: 0.1,
      perSpeaker: metrics.perSpeaker,
      perDialect: metrics.perDialect,
      nClips: 3,
    });
    expect(tx.costEntry.create.mock.calls[0][0].data.category).toBe("eval_generation");
    expect(tx.speechTrainJob.updateMany.mock.calls[0][0].data.outputRef).toBeUndefined();
  });

  it("transcribe stores one transcript per clip, skipping duplicates", async () => {
    const res = await POST(
      request({
        ...base,
        kind: "transcribe",
        modelRef: "base",
        transcripts: [
          { id: "r1", text: "one" },
          { id: "r2", text: "two" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(tx.speechTranscript.createMany.mock.calls[0][0]).toEqual({
      data: [
        { recordingId: "r1", modelRef: "base", text: "one" },
        { recordingId: "r2", modelRef: "base", text: "two" },
      ],
      skipDuplicates: true,
    });
    expect(tx.costEntry.create.mock.calls[0][0].data.category).toBe("eval_generation");
  });

  it("synthesize creates derived, community_only recordings, no bytes, no review status", async () => {
    const res = await POST(
      request({
        ...base,
        kind: "synthesize",
        modelRef: "/checkpoints/tts/t1",
        outputs: [
          { sentenceId: "p1", key: "tts/job1/p1.wav", durationMs: 500, sampleRate: 22050 },
          { sentenceId: "gone", key: "tts/job1/gone.wav", durationMs: 500, sampleRate: 22050 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const arg = tx.speechRecording.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      promptId: "p1",
      storagePath: "tts/job1/p1.wav",
      storageKey: "tts/job1/p1.wav",
      mimeType: "audio/wav",
      durationMs: 500,
      sampleRate: 22050,
      sourceType: "derived",
      sourceRef: "/checkpoints/tts/t1",
      tier: "community_only",
      isDemo: false,
      reviewStatus: null,
    });
    expect(arg.data[0].bytes).toBeUndefined();
    expect(arg.data[0].uploadedAt).toBeInstanceOf(Date);
    expect(tx.speechTrainJob.updateMany.mock.calls[0][0].data.error).toMatch(/1 output/);
  });

  it("a failed job records the error and its cost, and writes no results", async () => {
    const res = await POST(
      request({ ...base, kind: "evaluate", status: "failed", error: "OutOfMemory", modelRef: null }),
    );
    expect(res.status).toBe(200);
    expect(tx.speechTrainJob.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      error: "OutOfMemory",
    });
    expect(tx.speechEvalResult.create).not.toHaveBeenCalled();
    expect(tx.costEntry.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a finished job answers 200 and changes nothing", async () => {
    mockPrisma.speechTrainJob.findUnique.mockResolvedValue({ id: "job1", status: "succeeded" });
    const res = await POST(request(base));
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.costEntry.create).not.toHaveBeenCalled();
  });

  it("a lost race (the claim updates no row) writes nothing else", async () => {
    tx.speechTrainJob.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(request({ ...base, kind: "transcribe", transcripts: [{ id: "r1", text: "x" }] }));
    expect(res.status).toBe(200);
    expect(tx.costEntry.create).not.toHaveBeenCalled();
    expect(tx.speechTranscript.createMany).not.toHaveBeenCalled();
  });

  it("404 for an unknown job, 400 for a payload that does not fit its kind", async () => {
    mockPrisma.speechTrainJob.findUnique.mockResolvedValue(null);
    expect((await POST(request(base))).status).toBe(404);
    mockPrisma.speechTrainJob.findUnique.mockResolvedValue({ id: "job1", status: "running" });
    expect((await POST(request({ ...base, kind: "evaluate", metrics: null }))).status).toBe(400);
    expect((await POST(request({ ...base, status: "weird" }))).status).toBe(400);
    expect((await POST(request({ ...base, kind: "transcribe", transcripts: null }))).status).toBe(400);
    expect((await POST(request(null, { raw: "not json" }))).status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
