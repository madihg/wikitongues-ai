import type {
  CandidateKind,
  FineTuneJob,
  FineTuneMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Where the flywheel closes: a succeeded fine-tune becomes a first-class arena
 * candidate, the job is marked `registered`, and a post-finetune EvalRun is
 * queued on the frozen held-out bank.
 *
 * Extracted from the poll route so the HTTP path and any operational runner
 * register checkpoints through the SAME code - a checkpoint registered by a
 * script must be indistinguishable from one registered by the API, or the arena
 * quietly ends up with two kinds of candidate.
 */

// Method -> the candidate kind it produces. continued_pretrain maps 1:1.
const METHOD_TO_KIND: Record<FineTuneMethod, CandidateKind> = {
  sft: "sft",
  dpo: "dpo",
  continued_pretrain: "continued_pretrain",
};

/**
 * Which serving provider can actually run a checkpoint produced by a given
 * TRAINING provider. This is not the same question as "what provider was the
 * base candidate served by": a model tuned on OpenAI is served by OpenAI's own
 * API as a normal model id, while an open-weights LoRA tuned on Together is
 * served through Together's OpenAI-compatible endpoint. Getting this wrong sends
 * generation at the wrong host with the wrong key, which is exactly what a
 * silently-defaulted "openai-compatible" used to do to OpenAI-tuned models.
 */
const SERVING_PROVIDER: Record<string, string> = {
  openai: "openai",
  together: "openai-compatible",
  fireworks: "openai-compatible",
};

/** Serving endpoint override, when the serving provider is not the default router. */
const SERVING_ENDPOINT: Record<string, string | null> = {
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
};

export interface ServingRoute {
  provider: string;
  apiEndpoint: string | null;
}

/**
 * Resolve how a checkpoint produced by `ftProvider` should be served. Falls back
 * to the base candidate's provider only for training providers with no known
 * inference story (e.g. the offline mock), and never invents an endpoint.
 */
export function resolveServingRoute(
  ftProvider: string,
  baseProvider?: string | null,
): ServingRoute {
  return {
    provider:
      SERVING_PROVIDER[ftProvider] ?? baseProvider ?? "openai-compatible",
    apiEndpoint: SERVING_ENDPOINT[ftProvider] ?? null,
  };
}

/** Coarse model family label, used for grouping and output labelling. */
export function familyFromModelId(modelId: string): string {
  const id = (modelId || "").toLowerCase();
  if (id.includes("gpt") || id.startsWith("ft:")) return "gpt";
  if (id.includes("claude")) return "claude";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("llama")) return "llama";
  if (id.includes("mistral") || id.includes("nemo")) return "mistral";
  return "open-weights";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

// Distinct-from-baseline palette for auto-registered output models.
const FT_PALETTE = ["#7a4f9c", "#2f8a8a", "#b5512f", "#4f7a5e", "#9c6a13"];

/** Tiny stable hash for deterministic palette selection. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export interface RegisterArgs {
  job: FineTuneJob & {
    baseCandidate?: {
      id: string;
      name: string;
      provider: string;
      family?: string;
      decodingParams?: unknown;
    } | null;
    outputCandidate?: { id: string } | null;
  };
  outputModelId: string;
  costUsd?: number;
  userId?: string | null;
  /** Override the generated display name (defaults to "<base> SFT"). */
  name?: string;
}

export interface RegisterResult {
  candidateId: string;
  evalRunId?: string;
  alreadyRegistered: boolean;
}

/**
 * Register a succeeded job's checkpoint. Idempotent: a job that already has an
 * output candidate is simply marked `registered` and its existing candidate id
 * returned, so re-polling never creates duplicates.
 */
export async function registerFineTuneOutput(
  args: RegisterArgs,
): Promise<RegisterResult> {
  const { job, outputModelId } = args;

  if (job.outputCandidate) {
    await prisma.fineTuneJob.update({
      where: { id: job.id },
      data: { status: "registered" },
    });
    return { candidateId: job.outputCandidate.id, alreadyRegistered: true };
  }

  const kind = METHOD_TO_KIND[job.method];
  const baseName = job.baseCandidate?.name ?? job.baseModelId;
  const name = args.name ?? `${baseName} ${job.method.toUpperCase()}`;
  // Unique slug: derive from name + job id so re-runs never collide.
  const slug = `${slugify(name)}-${job.id.slice(0, 8)}`;
  const color = FT_PALETTE[Math.abs(hashCode(job.id)) % FT_PALETTE.length];

  const { provider, apiEndpoint } = resolveServingRoute(
    job.provider,
    job.baseCandidate?.provider,
  );
  const family = job.baseCandidate?.family ?? familyFromModelId(outputModelId);

  const candidate = await prisma.candidateModel.create({
    data: {
      name,
      slug,
      family,
      kind,
      language: job.language,
      baseModelId: outputModelId,
      provider,
      apiEndpoint,
      // A first-party hosted fine-tune IS the model id; only an open-weights
      // checkpoint served elsewhere is meaningfully an "adapter" location.
      adapterUri: provider === "openai-compatible" ? outputModelId : null,
      // Inherit the base recipe's decoding so the tuned variant is compared
      // under the same settings it was registered against.
      decodingParams:
        (job.baseCandidate?.decodingParams as object | null | undefined) ??
        undefined,
      parentCandidateId: job.baseCandidateId,
      fineTuneJobId: job.id,
      fineTuneSource: `${job.method} job ${job.id.slice(0, 8)}`,
      color,
      createdById: args.userId ?? undefined,
    },
  });

  await prisma.fineTuneJob.update({
    where: { id: job.id },
    data: {
      status: "registered",
      costUsd: args.costUsd ?? null,
      completedAt: new Date(),
    },
  });

  // Queue a post-finetune eval on the same frozen held-out bank.
  const evalRun = await prisma.evalRun.create({
    data: {
      candidateModelId: candidate.id,
      language: job.language,
      promptSetLabel: "igala-heldout",
      holdoutPromptIds: job.holdoutPromptIds,
      trigger: "post_finetune",
      status: "draft",
      nPrompts: job.holdoutPromptIds.length,
      triggeredById: args.userId ?? undefined,
    },
  });

  return {
    candidateId: candidate.id,
    evalRunId: evalRun.id,
    alreadyRegistered: false,
  };
}
