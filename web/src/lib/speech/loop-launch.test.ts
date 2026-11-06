import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, mockNotify, rows } = vi.hoisted(() => ({
  db: {
    speechTrainJob: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    speechLoopState: { findUnique: vi.fn() },
    costEntry: { create: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn() },
  },
  mockNotify: vi.fn(),
  rows: { exam: [] as unknown[] },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("./loop-rows", () => ({ loadTestSetRows: async () => rows.exam }));
vi.mock("./storage-supabase", () => ({
  storageEnabled: vi.fn(() => false),
  signedUrl: vi.fn(async (k: string) => `https://signed/${k}`),
}));

import { launchSpeechJob, scoreModel, buildSigned, loopProvider } from "./loop-launch";
import { buildTrainingManifest } from "./training-manifest";
import type { SpeechTrainProvider } from "./train-providers";

const modal = (launch = vi.fn().mockResolvedValue({ externalId: "call1" })): SpeechTrainProvider & { launch: typeof launch } => ({
  name: "modal",
  launch,
  status: vi.fn(),
});
const mock: SpeechTrainProvider = { name: "mock", launch: vi.fn().mockResolvedValue({ externalId: "mock-1" }), status: vi.fn() };

const examRow = {
  id: "e1", storagePath: "clips/e1.webm", storageKey: "clips/e1.webm", language: "igala",
  mimeType: "audio/webm", durationMs: 60_000, sampleRate: 16000, annotatorId: "u1", dialect: "d1",
  tier: "open", consentId: "c1", consentVersion: "v1", fundingSource: "grant", isTestSet: true,
  isDemo: false, rightsStatus: "cleared", sourceType: "contributor", sourceRef: null,
  publishedOpenAt: null, uploadedAt: new Date(), reviewStatus: "keep", voiceCloningOptIn: false,
  prompt: { isHoldout: false, split: "test", text: "q" },
  coldAuthorAnswer: { answerText: "hello there", englishGloss: "hello" },
};

const plan = {
  kind: "train_asr" as const,
  system: "asr" as const,
  baseModel: "omniASR_CTC_300M_v2",
  manifestVersion: "v1",
  manifest: { lines: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.speechTrainJob.create.mockResolvedValue({ id: "job1" });
  db.speechTrainJob.update.mockResolvedValue({});
  db.speechTrainJob.findFirst.mockResolvedValue(null);
  db.speechLoopState.findUnique.mockResolvedValue({ paused: false, monthlyCapUsd: 200 });
  db.costEntry.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 } });
  rows.exam = [examRow];
  delete process.env.SPEECH_WORKER_URL;
});

describe("launchSpeechJob: cost", () => {
  it("writes an estimated finetune CostEntry up front for a real worker", async () => {
    await launchSpeechJob(plan, modal());
    expect(db.costEntry.create).toHaveBeenCalledTimes(1);
    expect(db.costEntry.create.mock.calls[0][0].data).toMatchObject({
      category: "finetune",
      provider: "modal",
      amountUsd: 5.6214,
      estimated: true,
      refType: "speech_train_job",
      refId: "job1",
    });
  });

  it("estimates an evaluate job under eval_generation", async () => {
    await launchSpeechJob({ ...plan, kind: "evaluate" }, modal());
    expect(db.costEntry.create.mock.calls[0][0].data.category).toBe("eval_generation");
  });

  it("writes no estimate for the mock provider, which spends nothing", async () => {
    await launchSpeechJob(plan, mock);
    expect(db.costEntry.create).not.toHaveBeenCalled();
  });

  it("removes the estimate and fails the job when the worker refuses", async () => {
    const p = modal(vi.fn().mockRejectedValue(new Error("Speech worker refused train_asr: HTTP 502")));
    await expect(launchSpeechJob(plan, p)).rejects.toThrow("HTTP 502");
    expect(db.speechTrainJob.update.mock.calls[0][0].data.status).toBe("failed");
    expect(db.costEntry.deleteMany).toHaveBeenCalledWith({
      where: { refType: "speech_train_job", refId: "job1", estimated: true },
    });
  });

  it("marks the job running with the worker's call id", async () => {
    await launchSpeechJob(plan, modal());
    expect(db.speechTrainJob.update.mock.calls[0][0].data).toMatchObject({
      status: "running",
      externalId: "call1",
    });
  });
});

describe("scoreModel", () => {
  it("launches one evaluate on the exam set for the model", async () => {
    const r = await scoreModel("/checkpoints/asr/j", mock);
    expect(r).toEqual({ launched: true, jobId: "job1" });
    const [job, manifest] = (mock.launch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(job).toMatchObject({ kind: "evaluate", modelRef: "/checkpoints/asr/j" });
    expect(manifest.lines.map((l: { id: string }) => l.id)).toEqual(["e1"]);
  });

  it("does nothing when the model already has an evaluate", async () => {
    db.speechTrainJob.findFirst.mockResolvedValue({ id: "ev" });
    expect(await scoreModel("m", mock)).toEqual({ launched: false, reason: "already_scored" });
    expect(db.speechTrainJob.create).not.toHaveBeenCalled();
  });

  it("is blocked by the pause", async () => {
    db.speechLoopState.findUnique.mockResolvedValue({ paused: true, monthlyCapUsd: 200 });
    expect(await scoreModel("m", mock)).toEqual({ launched: false, reason: "paused" });
    expect(db.speechTrainJob.create).not.toHaveBeenCalled();
  });

  it("is blocked at the cap and raises cap_reached", async () => {
    db.costEntry.aggregate.mockResolvedValue({ _sum: { amountUsd: 200 } });
    expect(await scoreModel("m", mock)).toEqual({ launched: false, reason: "cap_reached" });
    expect(mockNotify.mock.calls[0][0]).toBe("cap_reached");
    expect(db.speechTrainJob.create).not.toHaveBeenCalled();
  });

  it("raises frozen_set_missing with no exam clips", async () => {
    rows.exam = [];
    expect(await scoreModel("m", mock)).toEqual({ launched: false, reason: "frozen_set_missing" });
    expect(mockNotify.mock.calls[0][0]).toBe("frozen_set_missing");
  });
});

describe("buildSigned and loopProvider", () => {
  it("gives the mock provider inert URLs and never touches storage", async () => {
    const m = await buildSigned(buildTrainingManifest, [{ ...examRow, isTestSet: false, prompt: { isHoldout: false, split: "train", text: "q" } }] as never, "asr", mock);
    expect(m.lines[0].url).toBe("mock://clips/e1.webm");
  });

  it("refuses to sign for a real worker when storage is off, with a clear message", async () => {
    await expect(
      buildSigned(buildTrainingManifest, [{ ...examRow, isTestSet: false, prompt: { isHoldout: false, split: "train", text: "q" } }] as never, "asr", modal()),
    ).rejects.toThrow("SPEECH_STORAGE is not on");
  });

  it("signs only clips the guard lets through", async () => {
    const { storageEnabled, signedUrl } = await import("./storage-supabase");
    vi.mocked(storageEnabled).mockReturnValue(true);
    const ok = { ...examRow, id: "k", storageKey: "clips/k.webm", isTestSet: false, prompt: { isHoldout: false, split: "train", text: "q" } };
    const exam = { ...examRow, id: "t", storageKey: "clips/t.webm" };
    const m = await buildSigned(buildTrainingManifest, [ok, exam] as never, "asr", modal());
    expect(m.lines.map((l) => l.url)).toEqual(["https://signed/clips/k.webm"]);
    expect(vi.mocked(signedUrl).mock.calls.map((c) => c[0])).toEqual(["clips/k.webm"]);
    vi.mocked(storageEnabled).mockReturnValue(false);
  });

  it("picks the real worker only when SPEECH_WORKER_URL is set", () => {
    expect(loopProvider().name).toBe("mock");
    process.env.SPEECH_WORKER_URL = "https://worker.example";
    expect(loopProvider().name).toBe("modal");
  });
});
