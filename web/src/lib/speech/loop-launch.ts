import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import {
  buildEvalManifest,
  buildTrainingManifest,
  type LoopRow,
  type TrainingManifest,
} from "./training-manifest";
import { loadTestSetRows } from "./loop-rows";
import { estimateCostUsd } from "./loop-config";
import { storageEnabled, signedUrl } from "./storage-supabase";
import {
  getSpeechTrainProvider,
  type LaunchManifest,
  type SpeechTrainProvider,
} from "./train-providers";

/**
 * The launch half of the nightly loop, shared by the nightly route and the
 * callback route (which scores a model the moment its training ends).
 * Every launch is one SpeechTrainJob row, one estimated CostEntry (replaced
 * by the actual figure when the worker calls back) and one provider call.
 */

export type LoopJobKind = "train_asr" | "train_tts" | "evaluate" | "transcribe";

/** The real worker when SPEECH_WORKER_URL is set; the deterministic mock otherwise. */
export function loopProvider(): SpeechTrainProvider {
  return getSpeechTrainProvider(process.env.SPEECH_WORKER_URL ? "modal" : "mock");
}

const SIGN_CHUNK = 50;

/**
 * Build a manifest with signed URLs. The builders take a synchronous URL
 * function, so a first pass collects the keys of the rows the guard lets
 * through, they are signed, and a second pass builds the real manifest. Only
 * clips that pass the guard are ever signed. The mock provider gets inert
 * mock:// URLs and never touches storage.
 */
export async function buildSigned(
  build: typeof buildTrainingManifest,
  rows: LoopRow[],
  purpose: "asr" | "tts",
  provider: SpeechTrainProvider,
): Promise<TrainingManifest> {
  const ctx = { scope: "internal", purpose } as const;
  const keys = new Set<string>();
  build(rows, {
    ...ctx,
    signedUrl: (k) => {
      keys.add(k);
      return k;
    },
  });
  const urls = new Map<string, string>();
  if (provider.name === "mock") {
    for (const k of keys) urls.set(k, `mock://${k}`);
  } else if (keys.size > 0) {
    if (!storageEnabled()) {
      throw new Error(
        "SPEECH_STORAGE is not on: clips cannot be signed for the worker.",
      );
    }
    const all = [...keys];
    for (let i = 0; i < all.length; i += SIGN_CHUNK) {
      const chunk = all.slice(i, i + SIGN_CHUNK);
      const signed = await Promise.all(chunk.map((k) => signedUrl(k)));
      chunk.forEach((k, j) => urls.set(k, signed[j]));
    }
  }
  return build(rows, { ...ctx, signedUrl: (k) => urls.get(k) ?? "" });
}

export const startOfUtcMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** This month's launched and finished fine-tune spend, in USD (estimates until replaced). */
export async function monthSpendUsd(now: Date): Promise<number> {
  const agg = await prisma.costEntry.aggregate({
    _sum: { amountUsd: true },
    where: {
      category: "finetune",
      refType: "speech_train_job",
      createdAt: { gte: startOfUtcMonth(now) },
    },
  });
  return agg._sum.amountUsd ?? 0;
}

export interface JobPlan {
  kind: LoopJobKind;
  system: "asr" | "tts";
  /** The model trained from (train kinds) or the model run (evaluate, transcribe). */
  baseModel: string;
  /** Checkpoint path or "base"; evaluate and transcribe only. */
  modelRef?: string;
  manifestVersion: string;
  manifest: LaunchManifest;
  hyperparameters?: Record<string, unknown>;
  /** Keep the clip ids and pseudonyms of a training job for the withdrawal check. */
  recordLines?: boolean;
}

const msg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function launchSpeechJob(
  plan: JobPlan,
  provider: SpeechTrainProvider,
  now: Date = new Date(),
): Promise<string> {
  const job = await prisma.speechTrainJob.create({
    data: {
      system: plan.system,
      provider: provider.name,
      baseModel: plan.baseModel,
      manifestVersion: plan.manifestVersion,
      hyperparameters: plan.hyperparameters as Prisma.InputJsonValue | undefined,
      status: "queued",
      kind: plan.kind,
      manifestLines: plan.recordLines
        ? plan.manifest.lines.map((l) => ({
            id: l.id,
            speakerPseudonym: l.speakerPseudonym,
          }))
        : undefined,
    },
    select: { id: true },
  });
  // The mock spends nothing, so it writes no estimate into the real ledger.
  const estimated = provider.name !== "mock";
  if (estimated) {
    await prisma.costEntry.create({
      data: {
        category: plan.kind.startsWith("train") ? "finetune" : "eval_generation",
        provider: "modal",
        label: `speech ${plan.kind} ${job.id} (estimate)`,
        amountUsd: estimateCostUsd(plan.kind),
        estimated: true,
        refType: "speech_train_job",
        refId: job.id,
      },
    });
  }
  try {
    const { externalId } = await provider.launch(
      {
        id: job.id,
        kind: plan.kind,
        baseModel: plan.kind.startsWith("train") ? plan.baseModel : undefined,
        manifestVersion: plan.manifestVersion,
        hyperparameters: plan.hyperparameters,
        modelRef: plan.modelRef,
      },
      plan.manifest,
    );
    await prisma.speechTrainJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: now, externalId },
    });
    return job.id;
  } catch (e) {
    await prisma.speechTrainJob.update({
      where: { id: job.id },
      data: { status: "failed", error: msg(e), completedAt: now },
    });
    if (estimated) {
      await prisma.costEntry.deleteMany({
        where: { refType: "speech_train_job", refId: job.id, estimated: true },
      });
    }
    throw e;
  }
}

export type ScoreOutcome =
  | { launched: true; jobId: string }
  | {
      launched: false;
      reason: "already_scored" | "paused" | "cap_reached" | "frozen_set_missing";
    };

/**
 * Score one model on the frozen exam set: launch an evaluate job unless one
 * already exists for it, the loop is paused, the month's cap is reached, or
 * there is no exam set. Throws when the provider refuses; callers capture it.
 */
export async function scoreModel(
  modelRef: string,
  provider: SpeechTrainProvider,
  now: Date = new Date(),
): Promise<ScoreOutcome> {
  const have = await prisma.speechTrainJob.findFirst({
    where: {
      kind: "evaluate",
      baseModel: modelRef,
      status: { in: ["queued", "running", "succeeded"] },
    },
    select: { id: true },
  });
  if (have) return { launched: false, reason: "already_scored" };

  const state = await prisma.speechLoopState.findUnique({
    where: { id: 1 },
    select: { paused: true, monthlyCapUsd: true },
  });
  if (state?.paused) return { launched: false, reason: "paused" };
  const cap = state?.monthlyCapUsd ?? 200;
  if ((await monthSpendUsd(now)) >= cap) {
    await notify("cap_reached", [`month spend has reached the cap ${cap.toFixed(2)}`], { now });
    return { launched: false, reason: "cap_reached" };
  }

  const exam = await buildSigned(
    buildEvalManifest,
    await loadTestSetRows(prisma),
    "asr",
    provider,
  );
  if (exam.lines.length === 0) {
    await notify("frozen_set_missing", ["the exam set has 0 usable clips"], { now });
    return { launched: false, reason: "frozen_set_missing" };
  }
  const jobId = await launchSpeechJob(
    {
      kind: "evaluate",
      system: "asr",
      baseModel: modelRef,
      modelRef,
      manifestVersion: exam.version,
      manifest: { lines: exam.lines },
    },
    provider,
    now,
  );
  return { launched: true, jobId };
}
