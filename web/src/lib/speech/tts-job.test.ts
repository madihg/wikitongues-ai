import { describe, it, expect, vi } from "vitest";
import {
  MAX_SYNTH_SENTENCES,
  TtsJobError,
  launchSynthesis,
  launchTtsJob,
  parseTtsHyperparameters,
} from "./tts-job";
import { openRow } from "./fixtures";
import type { SpeechTrainProvider } from "./train-providers";

const studioRow = (id: string, over: Record<string, unknown> = {}) => ({
  ...openRow({ id, storagePath: `clips/${id}.webm`, tier: "community_only", coldAuthorAnswer: null }),
  studioText: "kwa gbo chi",
  ...over,
});

function fakes(rows: unknown[] = []) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const db = {
    speechRecording: { findMany: vi.fn().mockResolvedValue(rows) },
    speechTrainJob: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "job-1" };
      }),
      update: vi.fn(async (a: Record<string, unknown>) => {
        updated.push(a);
        return {};
      }),
    },
    speechCandidate: { findUnique: vi.fn() },
    prompt: { findMany: vi.fn() },
  };
  const provider: SpeechTrainProvider = {
    name: "modal",
    launch: vi.fn(async () => ({ externalId: "call-1" })),
    status: vi.fn(),
  };
  const sign = vi.fn(async (k: string) => `https://signed.example/${k}`);
  return { db, provider, sign, created, updated };
}

describe("parseTtsHyperparameters", () => {
  it("accepts numSteps and lr, nothing else", () => {
    expect(parseTtsHyperparameters(undefined)).toBeUndefined();
    expect(parseTtsHyperparameters({ numSteps: 50000, lr: 0.0001 })).toEqual({ numSteps: 50000, lr: 0.0001 });
    expect(parseTtsHyperparameters({ numSteps: 0 })).toBe("invalid");
    expect(parseTtsHyperparameters({ lr: 5 })).toBe("invalid");
    expect(parseTtsHyperparameters({ seed: 1 })).toBe("invalid");
    expect(parseTtsHyperparameters("x")).toBe("invalid");
  });
});

describe("launchTtsJob", () => {
  it("builds the manifest from kept studio clips only, with purpose tts, and launches train_tts", async () => {
    const f = fakes([
      studioRow("kept"),
      studioRow("unreviewed", { reviewStatus: null }),
      studioRow("frozen", { prompt: { isHoldout: true, split: "train" } }),
      studioRow("exam", { isTestSet: true }),
      studioRow("demo", { isDemo: true }),
    ]);
    const out = await launchTtsJob(
      { db: f.db as never, sign: f.sign, provider: f.provider },
      { studioSessionIds: ["studio-2026-11-06-ab"], hyperparameters: { numSteps: 1000 }, userId: "r1" },
    );
    expect(out).toMatchObject({ jobId: "job-1", clips: 1 });
    // the query is narrowed to the named sittings
    expect(f.db.speechRecording.findMany.mock.calls[0][0].where.studioSessionId).toEqual({ in: ["studio-2026-11-06-ab"] });
    const [job, manifest] = (f.provider.launch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(job).toMatchObject({ id: "job-1", kind: "train_tts", hyperparameters: { numSteps: 1000 } });
    expect(manifest.lines.map((l: { id: string }) => l.id)).toEqual(["kept"]);
    expect(manifest.lines[0].url).toBe("https://signed.example/clips/kept.webm");
    expect(manifest.lines[0].transcript).toBe("kwa gbo chi");
    expect(f.created[0]).toMatchObject({
      system: "tts",
      provider: "modal",
      manifestVersion: out.manifestVersion,
      createdById: "r1",
      status: "queued",
    });
    expect(f.updated[0]).toMatchObject({ data: { status: "running" } });
  });

  it("refuses with 422 and creates no job when no kept clip is left", async () => {
    const f = fakes([studioRow("unreviewed", { reviewStatus: null })]);
    await expect(
      launchTtsJob({ db: f.db as never, sign: f.sign, provider: f.provider }, { studioSessionIds: ["studio-2026-11-06-ab"], userId: "r1" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.db.speechTrainJob.create).not.toHaveBeenCalled();
    expect(f.provider.launch).not.toHaveBeenCalled();
  });

  it("marks the job failed with a status-only error when the provider refuses", async () => {
    const f = fakes([studioRow("kept")]);
    (f.provider.launch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Speech worker refused train_tts: HTTP 500"));
    await expect(
      launchTtsJob({ db: f.db as never, sign: f.sign, provider: f.provider }, { studioSessionIds: ["studio-2026-11-06-ab"], userId: "r1" }),
    ).rejects.toBeInstanceOf(TtsJobError);
    expect(f.updated[0]).toMatchObject({ where: { id: "job-1" }, data: { status: "failed" } });
  });
});

describe("launchSynthesis", () => {
  const prompt = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    language: "igala",
    text: "english question",
    isHoldout: false,
    split: "train",
    coldAuthorAnswers: [{ answerText: `answer ${id}` }],
    ...over,
  });

  it("sends Prompt ids as sentence ids, the cold answer as text, and refuses frozen prompts", async () => {
    const f = fakes();
    f.db.speechCandidate.findUnique.mockResolvedValue({ modelRef: "tts/job-1", system: "tts" });
    f.db.prompt.findMany.mockResolvedValue([prompt("p1"), prompt("p2")]);
    const out = await launchSynthesis(
      { db: f.db as never, sign: f.sign, provider: f.provider },
      { candidateId: "cand-1", promptIds: ["p1", "p2"], userId: "r1" },
    );
    expect(out.sentences).toBe(2);
    const [job, manifest] = (f.provider.launch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(job).toMatchObject({ kind: "synthesize", modelRef: "tts/job-1" });
    expect(manifest.sentences).toEqual([
      { id: "p1", text: "answer p1" },
      { id: "p2", text: "answer p2" },
    ]);
    expect(f.db.prompt.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["p1", "p2"] } });
  });

  it("answers 403 when a named prompt is frozen, even if the query returned it", async () => {
    const f = fakes();
    f.db.speechCandidate.findUnique.mockResolvedValue({ modelRef: "tts/job-1", system: "tts" });
    f.db.prompt.findMany.mockResolvedValue([prompt("p1"), prompt("p2", { isHoldout: true })]);
    await expect(
      launchSynthesis({ db: f.db as never, sign: f.sign, provider: f.provider }, { candidateId: "cand-1", promptIds: ["p1", "p2"], userId: "r1" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.provider.launch).not.toHaveBeenCalled();
    expect(f.db.speechTrainJob.create).not.toHaveBeenCalled();
  });

  it("caps the list at 50, and needs a tts candidate", async () => {
    const f = fakes();
    f.db.speechCandidate.findUnique.mockResolvedValue({ modelRef: "tts/job-1", system: "tts" });
    const many = Array.from({ length: MAX_SYNTH_SENTENCES + 1 }, (_, i) => `p${i}`);
    await expect(
      launchSynthesis({ db: f.db as never, sign: f.sign, provider: f.provider }, { candidateId: "cand-1", promptIds: many, userId: "r1" }),
    ).rejects.toMatchObject({ status: 400 });
    f.db.speechCandidate.findUnique.mockResolvedValue({ modelRef: "asr/x", system: "asr" });
    await expect(
      launchSynthesis({ db: f.db as never, sign: f.sign, provider: f.provider }, { candidateId: "cand-1", promptIds: ["p1"], userId: "r1" }),
    ).rejects.toMatchObject({ status: 404 });
    f.db.speechCandidate.findUnique.mockResolvedValue(null);
    await expect(
      launchSynthesis({ db: f.db as never, sign: f.sign, provider: f.provider }, { candidateId: "nope", promptIds: ["p1"], userId: "r1" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("with no ids named, picks up to 50 train-side prompts that have a usable answer", async () => {
    const f = fakes();
    f.db.speechCandidate.findUnique.mockResolvedValue({ modelRef: "tts/job-1", system: "tts" });
    f.db.prompt.findMany.mockResolvedValue([prompt("p1"), prompt("p2", { coldAuthorAnswers: [], language: "english" })]);
    const out = await launchSynthesis(
      { db: f.db as never, sign: f.sign, provider: f.provider },
      { candidateId: "cand-1", userId: "r1" },
    );
    expect(out.sentences).toBe(1);
    const arg = f.db.prompt.findMany.mock.calls[0][0];
    expect(arg.take).toBe(MAX_SYNTH_SENTENCES);
    expect(arg.where).toMatchObject({ language: "igala", isHoldout: false, split: { not: "test" } });
  });
});
