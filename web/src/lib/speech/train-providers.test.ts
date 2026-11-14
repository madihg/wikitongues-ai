import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSpeechTrainProvider,
  mockProvider,
  modalProvider,
  type LaunchJob,
  type LaunchManifest,
} from "./train-providers";

const line = {
  id: "r1",
  url: "https://signed.invalid/r1",
  durationMs: 1000,
  language: "igala" as const,
  transcript: "t",
  transcriptStripped: "t",
  speakerPseudonym: "spk-a",
  dialect: null,
  tier: "community_only" as const,
};
const manifest: LaunchManifest = { lines: [line] };
const job = (kind: LaunchJob["kind"]): LaunchJob => ({
  id: "job1",
  kind,
  baseModel: "omniASR_CTC_300M_v2",
  manifestVersion: "mv1",
  hyperparameters: { numSteps: 100 },
  modelRef: "base",
});

const saved = {
  url: process.env.SPEECH_WORKER_URL,
  secret: process.env.SPEECH_WORKER_SECRET,
};
beforeEach(() => {
  delete process.env.SPEECH_WORKER_URL;
  delete process.env.SPEECH_WORKER_SECRET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of [
    ["SPEECH_WORKER_URL", saved.url],
    ["SPEECH_WORKER_SECRET", saved.secret],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("speech train providers", () => {
  it("falls back to the mock for no name, an unknown name and 'mock'", () => {
    expect(getSpeechTrainProvider().name).toBe("mock");
    expect(getSpeechTrainProvider("nope").name).toBe("mock");
    expect(getSpeechTrainProvider("modal").name).toBe("modal");
  });

  it("mock round trip: launch, then done, with no network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { externalId } = await mockProvider.launch(job("train_asr"), manifest);
    expect(externalId).toBe("mock-job1");
    expect(await mockProvider.status(externalId)).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("modal launch throws a clear error when the URL or the secret is unset", async () => {
    await expect(modalProvider.launch(job("transcribe"), manifest)).rejects.toThrow(
      /SPEECH_WORKER_URL/,
    );
    process.env.SPEECH_WORKER_URL = "https://worker.invalid";
    await expect(modalProvider.launch(job("transcribe"), manifest)).rejects.toThrow(
      /SPEECH_WORKER_SECRET/,
    );
    await expect(modalProvider.status("c1")).rejects.toThrow(/SPEECH_WORKER_SECRET/);
  });

  it("modal launch posts the secret and the right body to the right path", async () => {
    process.env.SPEECH_WORKER_URL = "https://worker.invalid/";
    process.env.SPEECH_WORKER_SECRET = "s3cret";
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ callId: "fc-1", jobId: "job1" }), {
          status: 200,
        });
      }),
    );
    const out = await modalProvider.launch(job("evaluate"), manifest);
    expect(out).toEqual({ externalId: "fc-1" });
    expect(calls[0].url).toBe("https://worker.invalid/evaluate");
    expect((calls[0].init.headers as Record<string, string>)["x-shared-secret"]).toBe(
      "s3cret",
    );
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      jobId: "job1",
      manifest: [line],
      modelRef: "base",
      manifestVersion: "mv1",
    });

    await modalProvider.launch(job("train_asr"), { lines: [line], devLines: [line] });
    expect(calls[1].url).toBe("https://worker.invalid/train-asr");
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({
      jobId: "job1",
      devManifest: [line],
      baseModel: "omniASR_CTC_300M_v2",
      config: { numSteps: 100 },
    });

    await modalProvider.launch(job("synthesize"), {
      lines: [],
      sentences: [{ id: "p1", text: "hello" }],
    });
    expect(calls[2].url).toBe("https://worker.invalid/synthesize");
    expect(JSON.parse(calls[2].init.body as string)).toEqual({
      jobId: "job1",
      modelRef: "base",
      sentences: [{ id: "p1", text: "hello" }],
    });
  });

  it("modal launch throws on a non-2xx answer without echoing the body", async () => {
    process.env.SPEECH_WORKER_URL = "https://worker.invalid";
    process.env.SPEECH_WORKER_SECRET = "s3cret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret detail", { status: 401 })));
    const err = await modalProvider.launch(job("transcribe"), manifest).catch((e) => e);
    expect(String(err.message)).toContain("401");
    expect(String(err.message)).not.toContain("secret detail");
  });

  it("modal status maps the worker's answer, and unknown words to failed", async () => {
    process.env.SPEECH_WORKER_URL = "https://worker.invalid";
    process.env.SPEECH_WORKER_SECRET = "s3cret";
    const answers = ["running", "done", "queued", "weird"];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: answers[i++] }), { status: 200 })),
    );
    expect(await modalProvider.status("c1")).toBe("running");
    expect(await modalProvider.status("c1")).toBe("done");
    expect(await modalProvider.status("c1")).toBe("queued");
    expect(await modalProvider.status("c1")).toBe("failed");
  });
});
