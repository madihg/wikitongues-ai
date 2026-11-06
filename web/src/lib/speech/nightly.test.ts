import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, mockNotify, rowsHolder } = vi.hoisted(() => {
  const db = {
    speechNightlyRun: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    speechLoopState: { findUnique: vi.fn(), upsert: vi.fn() },
    speechTrainJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    speechCandidate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    speechTranscript: { findMany: vi.fn() },
    consentGrant: { findMany: vi.fn() },
    costEntry: { aggregate: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    db,
    mockNotify: vi.fn(),
    rowsHolder: { train: [] as unknown[], exam: [] as unknown[] },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("./loop-rows", () => ({
  loadTrainableRows: async () => rowsHolder.train,
  loadTestSetRows: async () => rowsHolder.exam,
}));

import { runNightly } from "./nightly";
import type { SpeechTrainProvider } from "./train-providers";

const NOW = new Date("2026-11-07T02:00:00Z");
const RUN = { id: "run1", runDate: new Date("2026-11-07"), outcome: "running", stepLog: [], costUsd: 0, startedAt: NOW, finishedAt: null };

function row(id: string, minutes: number, over: Record<string, unknown> = {}) {
  return {
    id,
    storagePath: `clips/${id}.webm`,
    storageKey: `clips/${id}.webm`,
    language: "igala",
    mimeType: "audio/webm",
    durationMs: minutes * 60_000,
    sampleRate: 16000,
    annotatorId: "u1",
    dialect: "d1",
    tier: "open",
    consentId: "c1",
    consentVersion: "v1",
    fundingSource: "grant",
    isTestSet: false,
    isDemo: false,
    rightsStatus: "cleared",
    sourceType: "contributor",
    sourceRef: null,
    publishedOpenAt: null,
    uploadedAt: new Date("2026-11-06T10:00:00Z"),
    reviewStatus: "keep",
    voiceCloningOptIn: false,
    prompt: { isHoldout: false, split: "train", text: "question" },
    coldAuthorAnswer: { answerText: "hello there", englishGloss: "hello" },
    ...over,
  };
}
const exam = () => row("exam1", 2, { isTestSet: true });

const provider: SpeechTrainProvider & { launch: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } = {
  name: "mock",
  launch: vi.fn(),
  status: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  rowsHolder.train = [row("a", 40)];
  rowsHolder.exam = [exam()];
  db.speechNightlyRun.findUnique.mockResolvedValue(null);
  db.speechNightlyRun.findFirst.mockResolvedValue(null);
  db.speechNightlyRun.create.mockResolvedValue(RUN);
  db.speechNightlyRun.update.mockImplementation(async ({ data }: { data: object }) => ({ ...RUN, ...data }));
  db.speechLoopState.findUnique.mockResolvedValue({ paused: false, monthlyCapUsd: 200, lastAsrRunAt: null, lastTtsRunAt: null });
  db.speechTrainJob.findMany.mockResolvedValue([]);
  db.speechTrainJob.findFirst.mockResolvedValue(null);
  db.speechTrainJob.create.mockResolvedValue({ id: "job1" });
  db.speechTrainJob.update.mockResolvedValue({});
  db.speechCandidate.findMany.mockResolvedValue([]);
  db.speechCandidate.findFirst.mockResolvedValue(null);
  db.speechTranscript.findMany.mockResolvedValue([]);
  db.consentGrant.findMany.mockResolvedValue([]);
  db.costEntry.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 } });
  provider.launch.mockResolvedValue({ externalId: "call1" });
  provider.status.mockResolvedValue("running");
});

const steps = (res: Awaited<ReturnType<typeof runNightly>>) =>
  (db.speechNightlyRun.update.mock.calls.at(-1)?.[0].data.stepLog ?? res.run.stepLog) as Array<Record<string, unknown>>;
const step = (res: Awaited<ReturnType<typeof runNightly>>, name: string) =>
  steps(res).find((s) => s.step === name);
const launchedKinds = () => provider.launch.mock.calls.map((c) => c[0].kind);

describe("runNightly: idempotency", () => {
  it("returns the existing run for the same date and does nothing else", async () => {
    db.speechNightlyRun.findUnique.mockResolvedValue({ ...RUN, outcome: "trained" });
    const res = await runNightly(NOW, provider);
    expect(res.created).toBe(false);
    expect(res.run.outcome).toBe("trained");
    expect(db.speechNightlyRun.create).not.toHaveBeenCalled();
    expect(provider.launch).not.toHaveBeenCalled();
    expect(db.speechTrainJob.create).not.toHaveBeenCalled();
  });

  it("returns the winner when two calls race on the unique date", async () => {
    db.speechNightlyRun.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...RUN, outcome: "running" });
    db.speechNightlyRun.create.mockRejectedValue({ code: "P2002" });
    const res = await runNightly(NOW, provider);
    expect(res.created).toBe(false);
    expect(provider.launch).not.toHaveBeenCalled();
  });

  it("keys the run on the UTC date", async () => {
    await runNightly(NOW, provider);
    expect(db.speechNightlyRun.create.mock.calls[0][0].data.runDate).toEqual(new Date("2026-11-07T00:00:00Z"));
  });
});

describe("runNightly: a night that trains", () => {
  it("trains ASR with 40 new minutes, logs the steps and records the clip ids", async () => {
    const res = await runNightly(NOW, provider);
    expect(res.created).toBe(true);
    expect(res.run.outcome).toBe("trained");
    expect(launchedKinds()).toContain("train_asr");
    expect(db.speechTrainJob.create.mock.calls[0][0].data).toMatchObject({
      system: "asr",
      kind: "train_asr",
      provider: "mock",
      manifestLines: [{ id: "a", speakerPseudonym: expect.any(String) }],
    });
    expect(db.speechTrainJob.update.mock.calls[0][0].data).toMatchObject({
      status: "running",
      externalId: "call1",
    });
    expect(db.speechLoopState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastAsrRunAt: NOW } }),
    );
    const names = steps(res).map((s) => s.step);
    for (const n of ["poll", "withdrawal", "ingest", "decide", "launch_asr", "score", "finish"]) {
      expect(names).toContain(n);
    }
    expect(step(res, "ingest")).toMatchObject({ newClips: 1, newAsrMinutes: 40 });
    expect(step(res, "decide")).toMatchObject({ asr: "train", tts: "skip" });
  });

  it("never puts a test-set clip in the training manifest", async () => {
    rowsHolder.train = [row("a", 40), row("t", 40, { isTestSet: true })];
    await runNightly(NOW, provider);
    const lines = provider.launch.mock.calls.find((c) => c[0].kind === "train_asr")?.[1].lines;
    expect(lines.map((l: { id: string }) => l.id)).toEqual(["a"]);
  });

  it("asks the worker to transcribe the new clips", async () => {
    await runNightly(NOW, provider);
    const t = provider.launch.mock.calls.find((c) => c[0].kind === "transcribe");
    expect(t?.[0].modelRef).toBe("base");
    expect(t?.[1].lines.map((l: { id: string }) => l.id)).toEqual(["a"]);
  });

  it("scores a trained model that has no evaluate yet", async () => {
    db.speechTrainJob.findMany.mockImplementation(async ({ where }: { where: { kind?: string } }) =>
      where.kind === "train_asr" ? [{ outputRef: "/checkpoints/asr/old" }] : [],
    );
    rowsHolder.train = [row("a", 5)]; // below the threshold: no new training
    await runNightly(NOW, provider);
    const ev = provider.launch.mock.calls.find((c) => c[0].kind === "evaluate");
    expect(ev?.[0].modelRef).toBe("/checkpoints/asr/old");
  });
});

describe("runNightly: skipped nights", () => {
  it("skips below 30 new minutes with the reason in the log", async () => {
    rowsHolder.train = [row("a", 29)];
    const res = await runNightly(NOW, provider);
    expect(res.run.outcome).toBe("skipped");
    expect(launchedKinds()).not.toContain("train_asr");
    expect(step(res, "decide")).toMatchObject({ asr: "skip", reasons: expect.arrayContaining(["asr: 29.0 new minutes, below 30"]) });
  });

  it("raises two_skipped_nights when yesterday was skipped too", async () => {
    rowsHolder.train = [];
    db.speechNightlyRun.findFirst.mockResolvedValue({ outcome: "skipped", startedAt: new Date("2026-11-06T02:00:00Z") });
    await runNightly(NOW, provider);
    expect(mockNotify.mock.calls.map((c) => c[0])).toContain("two_skipped_nights");
  });

  it("does not raise it after a trained night", async () => {
    rowsHolder.train = [];
    db.speechNightlyRun.findFirst.mockResolvedValue({ outcome: "trained", startedAt: new Date("2026-11-06T02:00:00Z") });
    await runNightly(NOW, provider);
    expect(mockNotify.mock.calls.map((c) => c[0])).not.toContain("two_skipped_nights");
  });

  it("raises frozen_set_missing and launches nothing when the exam set is empty", async () => {
    rowsHolder.exam = [];
    const res = await runNightly(NOW, provider);
    expect(launchedKinds()).not.toContain("train_asr");
    expect(mockNotify.mock.calls.map((c) => c[0])).toContain("frozen_set_missing");
    expect(res.run.outcome).toBe("skipped");
  });
});

describe("runNightly: pause and cap block every launch", () => {
  it("a paused loop launches nothing, however many new minutes", async () => {
    db.speechLoopState.findUnique.mockResolvedValue({ paused: true, monthlyCapUsd: 200, lastAsrRunAt: null, lastTtsRunAt: null });
    rowsHolder.train = [row("a", 600)];
    const res = await runNightly(NOW, provider);
    expect(provider.launch).not.toHaveBeenCalled();
    expect(db.speechTrainJob.create).not.toHaveBeenCalled();
    expect(step(res, "decide")).toMatchObject({ reasons: ["paused: the loop is paused"] });
  });

  it("a month at the cap launches nothing and raises cap_reached", async () => {
    db.costEntry.aggregate.mockResolvedValue({ _sum: { amountUsd: 200 } });
    rowsHolder.train = [row("a", 600)];
    const res = await runNightly(NOW, provider);
    expect(provider.launch).not.toHaveBeenCalled();
    expect(mockNotify.mock.calls.map((c) => c[0])).toContain("cap_reached");
    expect(step(res, "decide")?.reasons).toEqual(["cap: month spend 200.00 has reached the cap 200.00"]);
  });

  it("the cap sums this month's finetune estimates and actuals of speech jobs", async () => {
    await runNightly(NOW, provider);
    expect(db.costEntry.aggregate).toHaveBeenCalledWith({
      _sum: { amountUsd: true },
      where: {
        category: "finetune",
        refType: "speech_train_job",
        createdAt: { gte: new Date("2026-11-01T00:00:00Z") },
      },
    });
  });
});

describe("runNightly: errors are captured, never thrown", () => {
  it("a worker that refuses the launch gives outcome failed, a job_failed alert and no throw", async () => {
    provider.launch.mockRejectedValue(new Error("Speech worker refused train_asr: HTTP 502"));
    const res = await runNightly(NOW, provider);
    expect(res.run.outcome).toBe("failed");
    expect(step(res, "launch_train_asr")).toMatchObject({ ok: false });
    expect(mockNotify.mock.calls.map((c) => c[0])).toContain("job_failed");
    expect(db.speechTrainJob.update.mock.calls.at(-1)?.[0].data.status).toBe("failed");
  });

  it("a database error inside a step is logged and the run still finishes", async () => {
    db.speechTrainJob.findMany.mockRejectedValue(new Error("db down"));
    const res = await runNightly(NOW, provider);
    expect(step(res, "poll")).toMatchObject({ ok: false, error: "db down" });
    expect(db.speechNightlyRun.update).toHaveBeenCalled();
  });
});

describe("runNightly: polling and withdrawals", () => {
  it("fails a job the worker reports failed, and one that finished without a callback", async () => {
    db.speechTrainJob.findMany.mockImplementation(async ({ where }: { where: { externalId?: unknown } }) =>
      where.externalId
        ? [
            { id: "j1", kind: "train_asr", externalId: "c1", startedAt: new Date("2026-11-07T00:00:00Z") },
            { id: "j2", kind: "evaluate", externalId: "c2", startedAt: new Date("2026-11-06T22:00:00Z") },
            { id: "j3", kind: "evaluate", externalId: "c3", startedAt: new Date("2026-11-07T01:30:00Z") },
          ]
        : [],
    );
    provider.status.mockImplementation(async (id: string) =>
      id === "c1" ? "failed" : id === "c2" ? "done" : "done",
    );
    db.speechTrainJob.updateMany.mockResolvedValue({ count: 1 });
    const res = await runNightly(NOW, provider);
    // j1 failed; j2 done for 4 h with no callback is lost; j3 done 30 min ago may still be calling back.
    expect(step(res, "poll")).toMatchObject({ pending: 3, failed: ["j1", "j2"] });
    expect(mockNotify.mock.calls.map((c) => c[0])).toContain("job_failed");
  });

  it("marks the promoted model retrain required and lists the clip ids", async () => {
    const { speakerPseudonym } = await import("./manifest");
    db.speechCandidate.findMany.mockResolvedValue([
      {
        id: "cand1",
        retrainRequired: false,
        job: { manifestLines: [{ id: "x1", speakerPseudonym: speakerPseudonym("u9") }, { id: "x2", speakerPseudonym: speakerPseudonym("u1") }] },
      },
    ]);
    db.consentGrant.findMany.mockResolvedValue([{ userId: "u9", grantedAt: new Date("2026-11-05"), withdrawn: true }]);
    const res = await runNightly(NOW, provider);
    expect(db.speechCandidate.update).toHaveBeenCalledWith({ where: { id: "cand1" }, data: { retrainRequired: true } });
    expect(step(res, "withdrawal")).toMatchObject({ retrainRequired: [{ candidateId: "cand1", clipIds: ["x1"] }] });
  });

  it("leaves a model alone when no withdrawn speaker trained it", async () => {
    const { speakerPseudonym } = await import("./manifest");
    db.speechCandidate.findMany.mockResolvedValue([
      { id: "cand1", retrainRequired: false, job: { manifestLines: [{ id: "x2", speakerPseudonym: speakerPseudonym("u1") }] } },
    ]);
    db.consentGrant.findMany.mockResolvedValue([{ userId: "u9", grantedAt: new Date("2026-11-05"), withdrawn: true }]);
    await runNightly(NOW, provider);
    expect(db.speechCandidate.update).not.toHaveBeenCalled();
  });
});
