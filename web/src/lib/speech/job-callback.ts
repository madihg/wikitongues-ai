import type { Prisma } from "@prisma/client";

/**
 * What the Modal worker reports when a job ends (worker/igala_speech/callback.py)
 * and what the app writes for it. parseCallback checks the shape by hand (no
 * schema library in this repo); applyCallback runs inside the route's
 * transaction. Nothing here logs transcripts.
 */

export const JOB_KINDS = [
  "transcribe",
  "train_asr",
  "evaluate",
  "train_tts",
  "synthesize",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface EvalMetrics {
  manifestVersion: string;
  nClips: number;
  aggregate: { cer: number; werStripped: number; werRetained: number; ter: number };
  perSpeaker: Record<string, unknown>;
  perDialect: Record<string, unknown>;
}

export interface SynthOutput {
  sentenceId: string;
  key: string;
  durationMs: number;
  sampleRate: number;
}

export interface CallbackPayload {
  jobId: string;
  kind: JobKind;
  status: "succeeded" | "failed";
  gpuSeconds: number;
  costUsd: number | null;
  modelRef: string | null;
  metrics: EvalMetrics | null;
  transcripts: Array<{ id: string; text: string }> | null;
  outputs: SynthOutput[] | null;
  error: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseMetrics(v: unknown): EvalMetrics | null {
  if (!isObj(v) || !isObj(v.aggregate) || !isObj(v.perSpeaker) || !isObj(v.perDialect)) {
    return null;
  }
  const a = v.aggregate;
  if (!isNum(a.cer) || !isNum(a.werStripped) || !isNum(a.werRetained) || !isNum(a.ter)) {
    return null;
  }
  if (typeof v.manifestVersion !== "string" || !isNum(v.nClips)) return null;
  return {
    manifestVersion: v.manifestVersion,
    nClips: Math.round(v.nClips),
    aggregate: { cer: a.cer, werStripped: a.werStripped, werRetained: a.werRetained, ter: a.ter },
    perSpeaker: v.perSpeaker,
    perDialect: v.perDialect,
  };
}

function parseTranscripts(v: unknown): CallbackPayload["transcripts"] {
  if (!Array.isArray(v)) return null;
  const out: Array<{ id: string; text: string }> = [];
  for (const t of v) {
    if (!isObj(t) || !isStr(t.id) || typeof t.text !== "string") return null;
    out.push({ id: t.id, text: t.text });
  }
  return out;
}

function parseOutputs(v: unknown): SynthOutput[] | null {
  if (!Array.isArray(v)) return null;
  const out: SynthOutput[] = [];
  for (const o of v) {
    if (
      !isObj(o) ||
      !isStr(o.sentenceId) ||
      !isStr(o.key) ||
      !isNum(o.durationMs) ||
      !isNum(o.sampleRate)
    ) {
      return null;
    }
    out.push({
      sentenceId: o.sentenceId,
      key: o.key,
      durationMs: Math.round(o.durationMs),
      sampleRate: Math.round(o.sampleRate),
    });
  }
  return out;
}

/** The payload, or null when it is malformed or lacks what its kind needs. */
export function parseCallback(raw: unknown): CallbackPayload | null {
  if (!isObj(raw) || !isStr(raw.jobId)) return null;
  const kind = JOB_KINDS.find((k) => k === raw.kind);
  if (!kind) return null;
  if (raw.status !== "succeeded" && raw.status !== "failed") return null;
  if (!isNum(raw.gpuSeconds) || raw.gpuSeconds < 0) return null;
  const costUsd = raw.costUsd == null ? null : raw.costUsd;
  if (costUsd !== null && (!isNum(costUsd) || costUsd < 0)) return null;

  const p: CallbackPayload = {
    jobId: raw.jobId,
    kind,
    status: raw.status,
    gpuSeconds: Math.round(raw.gpuSeconds),
    costUsd,
    modelRef: typeof raw.modelRef === "string" && raw.modelRef ? raw.modelRef : null,
    metrics: raw.metrics == null ? null : parseMetrics(raw.metrics),
    transcripts: raw.transcripts == null ? null : parseTranscripts(raw.transcripts),
    outputs: raw.outputs == null ? null : parseOutputs(raw.outputs),
    error: typeof raw.error === "string" ? raw.error.slice(0, 500) : null,
  };
  // A field that was sent but did not parse is a malformed payload.
  if (raw.metrics != null && !p.metrics) return null;
  if (raw.transcripts != null && !p.transcripts) return null;
  if (raw.outputs != null && !p.outputs) return null;

  if (p.status === "succeeded") {
    if (kind === "evaluate" && (!p.metrics || !p.modelRef)) return null;
    if (kind === "transcribe" && (!p.transcripts || !p.modelRef)) return null;
    if (kind === "synthesize" && (!p.outputs || !p.modelRef)) return null;
    if ((kind === "train_asr" || kind === "train_tts") && !p.modelRef) return null;
  }
  return p;
}

const COST_CATEGORY: Record<JobKind, "finetune" | "eval_generation" | "inference"> = {
  train_asr: "finetune",
  train_tts: "finetune",
  evaluate: "eval_generation",
  transcribe: "eval_generation",
  synthesize: "inference",
};

/**
 * Write everything one callback means. The job row is claimed first (queued or
 * running to its final state); a second callback finds no such row and
 * returns false without writing anything else.
 */
export async function applyCallback(
  tx: Prisma.TransactionClient,
  p: CallbackPayload,
): Promise<boolean> {
  const ok = p.status === "succeeded";
  let note: string | null = ok ? null : p.error;
  let recordings: Prisma.SpeechRecordingCreateManyInput[] = [];

  if (ok && p.kind === "synthesize" && p.outputs) {
    const known = new Set(
      (
        await tx.prompt.findMany({
          where: { id: { in: p.outputs.map((o) => o.sentenceId) } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    const now = new Date();
    recordings = p.outputs
      .filter((o) => known.has(o.sentenceId))
      .map((o) => ({
        promptId: o.sentenceId,
        storagePath: o.key,
        storageKey: o.key,
        mimeType: "audio/wav",
        durationMs: o.durationMs,
        sampleRate: o.sampleRate,
        uploadedAt: now,
        tier: "community_only",
        sourceType: "derived",
        // modelOutputId is a foreign key to ModelOutput, so it cannot hold a model ref.
        sourceRef: p.modelRef,
        isDemo: false,
        reviewStatus: null,
      }));
    const skipped = p.outputs.length - recordings.length;
    if (skipped > 0) note = `${skipped} output(s) skipped: unknown prompt id`;
  }

  const claimed = await tx.speechTrainJob.updateMany({
    where: { id: p.jobId, status: { in: ["queued", "running"] } },
    data: {
      status: ok ? "succeeded" : "failed",
      costUsd: p.costUsd,
      gpuSeconds: p.gpuSeconds,
      ...(ok && (p.kind === "train_asr" || p.kind === "train_tts")
        ? { outputRef: p.modelRef }
        : {}),
      error: note,
      completedAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

  if (ok && p.kind === "evaluate" && p.metrics && p.modelRef) {
    const m = p.metrics;
    await tx.speechEvalResult.create({
      data: {
        jobId: p.jobId,
        modelRef: p.modelRef,
        manifestVersion: m.manifestVersion,
        cer: m.aggregate.cer,
        werStripped: m.aggregate.werStripped,
        werRetained: m.aggregate.werRetained,
        ter: m.aggregate.ter,
        perSpeaker: m.perSpeaker as Prisma.InputJsonValue,
        perDialect: m.perDialect as Prisma.InputJsonValue,
        nClips: m.nClips,
      },
    });
  }
  if (ok && p.kind === "transcribe" && p.transcripts && p.modelRef) {
    const modelRef = p.modelRef;
    await tx.speechTranscript.createMany({
      data: p.transcripts.map((t) => ({ recordingId: t.id, modelRef, text: t.text })),
      skipDuplicates: true,
    });
  }
  if (recordings.length > 0) {
    await tx.speechRecording.createMany({ data: recordings });
  }
  if (p.costUsd !== null) {
    await tx.costEntry.create({
      data: {
        category: COST_CATEGORY[p.kind],
        provider: "modal",
        label: `speech ${p.kind} ${p.jobId}`,
        amountUsd: p.costUsd,
        estimated: false,
        refType: "speech_train_job",
        refId: p.jobId,
      },
    });
  }
  return true;
}
