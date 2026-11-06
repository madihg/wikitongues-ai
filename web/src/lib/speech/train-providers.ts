import type { TrainingLine } from "./training-manifest";

/**
 * Where speech jobs run. Same shape as the fine-tune scaffold in
 * src/lib/arena/fine-tune-providers.ts: a deterministic mock is the default
 * (no network, no GPU), the Modal worker (worker/speech.py) is the real one.
 * The worker answers with a signed callback to /api/speech/jobs/callback; the
 * provider only starts jobs and reads their coarse status.
 */

export type SpeechJobKind =
  | "transcribe"
  | "train_asr"
  | "evaluate"
  | "train_tts"
  | "synthesize";

export type SpeechJobStatusWord = "queued" | "running" | "done" | "failed";

/** The slice of a SpeechTrainJob row a launch needs, plus what kind of job it is. */
export interface LaunchJob {
  id: string;
  kind: SpeechJobKind;
  baseModel?: string | null;
  manifestVersion?: string | null;
  hyperparameters?: unknown;
  /** "base" or a checkpoint path; transcribe, evaluate and synthesize use it. */
  modelRef?: string | null;
}

export interface LaunchManifest {
  lines: TrainingLine[];
  /** Held-out dev lines for train_asr. Never test-set lines. */
  devLines?: TrainingLine[];
  /** Sentences for synthesize; each id is a Prompt id. */
  sentences?: Array<{ id: string; text: string }>;
}

export interface SpeechTrainProvider {
  name: string;
  launch(job: LaunchJob, manifest: LaunchManifest): Promise<{ externalId: string }>;
  status(externalId: string): Promise<SpeechJobStatusWord>;
}

export const mockProvider: SpeechTrainProvider = {
  name: "mock",
  async launch(job) {
    return { externalId: `mock-${job.id}` };
  },
  async status() {
    return "done";
  },
};

const PATHS: Record<SpeechJobKind, string> = {
  transcribe: "transcribe",
  train_asr: "train-asr",
  evaluate: "evaluate",
  train_tts: "train-tts",
  synthesize: "synthesize",
};

function workerConfig(): { url: string; secret: string } {
  const url = process.env.SPEECH_WORKER_URL;
  const secret = process.env.SPEECH_WORKER_SECRET;
  if (!url) {
    throw new Error(
      "SPEECH_WORKER_URL is not set: deploy worker/speech.py and copy its URL here.",
    );
  }
  if (!secret) {
    throw new Error(
      "SPEECH_WORKER_SECRET is not set: it must equal the Modal secret wikitongues-speech.",
    );
  }
  return { url: url.replace(/\/+$/, ""), secret };
}

function bodyFor(job: LaunchJob, m: LaunchManifest): Record<string, unknown> {
  const hp =
    job.hyperparameters && typeof job.hyperparameters === "object"
      ? job.hyperparameters
      : undefined;
  switch (job.kind) {
    case "transcribe":
      return { jobId: job.id, manifest: m.lines, modelRef: job.modelRef ?? "base" };
    case "evaluate":
      return {
        jobId: job.id,
        manifest: m.lines,
        modelRef: job.modelRef ?? "base",
        manifestVersion: job.manifestVersion ?? "",
      };
    case "train_asr":
    case "train_tts":
      return {
        jobId: job.id,
        manifest: m.lines,
        ...(job.kind === "train_asr" ? { devManifest: m.devLines ?? [] } : {}),
        ...(job.baseModel ? { baseModel: job.baseModel } : {}),
        ...(hp ? { config: hp } : {}),
      };
    case "synthesize":
      return {
        jobId: job.id,
        modelRef: job.modelRef ?? "",
        sentences: m.sentences ?? [],
      };
  }
}

export const modalProvider: SpeechTrainProvider = {
  name: "modal",
  async launch(job, manifest) {
    const { url, secret } = workerConfig();
    const res = await fetch(`${url}/${PATHS[job.kind]}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shared-secret": secret },
      body: JSON.stringify(bodyFor(job, manifest)),
    });
    // Status only: the worker's error body is never copied into our errors.
    if (!res.ok) throw new Error(`Speech worker refused ${job.kind}: HTTP ${res.status}`);
    const data = (await res.json()) as { callId?: unknown };
    if (typeof data.callId !== "string" || !data.callId) {
      throw new Error("Speech worker answered without a callId");
    }
    return { externalId: data.callId };
  },
  async status(externalId) {
    const { url, secret } = workerConfig();
    const res = await fetch(`${url}/status/${encodeURIComponent(externalId)}`, {
      headers: { "x-shared-secret": secret },
    });
    if (!res.ok) throw new Error(`Speech worker status failed: HTTP ${res.status}`);
    const data = (await res.json()) as { status?: unknown };
    const s = data.status;
    return s === "queued" || s === "running" || s === "done" ? s : "failed";
  },
};

export function getSpeechTrainProvider(name?: string | null): SpeechTrainProvider {
  return name === "modal" ? modalProvider : mockProvider;
}
