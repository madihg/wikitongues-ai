import type { FineTuneJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildDpoExamples,
  buildSftExamples,
  toJsonl,
  type DpoSourceRow,
  type ExportFilters,
} from "@/lib/arena/training-export";
import { loadSftSourceRows } from "@/lib/arena/sft-source";
import {
  estimateFineTuneCostUsd,
  fineTuneCostFromTokensUsd,
  roundUsd,
} from "@/lib/arena/pricing";
import {
  togetherConfigured,
  uploadTrainingFile,
  startFineTune,
  pollFineTune,
} from "@/lib/arena/together";
import * as openaiFt from "@/lib/arena/openai-finetune";

/**
 * Provider-adapter interface for the fine-tune flywheel.
 *
 * The platform collects annotations, builds a training set, and hands it to a
 * provider that actually runs the job. The closed path (a deterministic mock) is
 * fully wired so the whole flow runs on the current stack with NO external calls
 * and NO GPU — this stays the DEFAULT for dev, CI and demos. Two REAL adapters
 * sit beside it:
 *   - "together" (open weights, LoRA). Trains cheaply, but a tuned open-weights
 *     checkpoint needs a dedicated GPU endpoint to serve, which this account
 *     cannot create — so its output cannot enter the arena.
 *   - "openai" (closed weights, hosted). Its output model id is servable on the
 *     normal OpenAI API the moment the job finishes, with no infrastructure.
 * Both are OFF until their API key is set; calling one unconfigured throws.
 */

export interface FineTuneLaunchResult {
  providerJobId: string;
  providerFileId?: string;
}

export interface FineTunePollResult {
  status: "running" | "succeeded" | "failed";
  outputModelId?: string;
  costUsd?: number;
  error?: string;
}

export interface FineTuneProvider {
  name: string;
  launch(job: FineTuneJob): Promise<FineTuneLaunchResult>;
  poll(job: FineTuneJob): Promise<FineTunePollResult>;
}

function hpNumber(job: FineTuneJob, key: string): number | undefined {
  const hp = job.hyperparameters;
  if (hp && typeof hp === "object" && !Array.isArray(hp)) {
    const v = (hp as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

/**
 * Deterministic, offline mock. Makes no network calls. Given the same job it
 * always returns the same synthetic ids and a small synthetic cost, so the
 * flywheel can be exercised end-to-end in dev, CI, and demos.
 */
const mockProvider: FineTuneProvider = {
  name: "mock",
  async launch(job) {
    const shortId = job.id.slice(0, 8);
    return {
      providerJobId: `mock-ftjob-${shortId}`,
      providerFileId: `mock-file-${shortId}`,
    };
  },
  async poll(job) {
    const shortId = job.id.slice(0, 8);
    // A small deterministic cost derived from the dataset size, so larger
    // training sets read as (slightly) more expensive.
    const rows = job.nTrainingRows ?? 0;
    const costUsd = Math.round((0.5 + rows * 0.002) * 100) / 100;
    return {
      status: "succeeded",
      outputModelId: `${job.baseModelId}:ft-${shortId}`,
      costUsd,
    };
  },
};

/**
 * Build the training JSONL for a job, fresh from the collected signal. Reuses the
 * same pure builders as the export path, so the contamination guard (held-out
 * prompts dropped) and the demo guard (isDemo rows excluded) both hold.
 *
 * Provider-agnostic on purpose: Together and OpenAI accept the identical chat
 * shape for SFT ({"messages":[system,user,assistant]}) and the identical triple
 * shape for preference data, so one builder feeds both and the two providers can
 * never drift into training on differently-shaped data.
 */
export async function buildTrainingJsonl(job: FineTuneJob): Promise<string> {
  const system = job.systemPrompt ?? "";
  const sysMsg = system ? [{ role: "system" as const, content: system }] : [];
  const filters: ExportFilters = {
    buckets: job.bucketFilter.length > 0 ? job.bucketFilter : undefined,
  };

  if (job.method === "dpo") {
    const comparisons = await prisma.pairwiseComparison.findMany({
      where: {
        winner: { in: ["a", "b"] },
        isDemo: false,
        ...(job.sourcePairwiseIds.length > 0
          ? { id: { in: job.sourcePairwiseIds } }
          : {}),
      },
      include: {
        modelOutputA: {
          select: {
            outputText: true,
            prompt: {
              select: { id: true, text: true, isHoldout: true, bucket: true },
            },
          },
        },
        modelOutputB: { select: { outputText: true } },
      },
    });
    const rows: DpoSourceRow[] = comparisons.map((c) => {
      const winnerIsA = c.winner === "a";
      return {
        promptId: c.modelOutputA.prompt.id,
        promptText: c.modelOutputA.prompt.text,
        chosenText: winnerIsA
          ? c.modelOutputA.outputText
          : c.modelOutputB.outputText,
        rejectedText: winnerIsA
          ? c.modelOutputB.outputText
          : c.modelOutputA.outputText,
        bucket: c.bucket ?? c.modelOutputA.prompt.bucket,
        isHoldout: c.modelOutputA.prompt.isHoldout,
      };
    });
    const examples = buildDpoExamples(rows, filters);
    return toJsonl(
      examples.map((e) => ({
        input: {
          messages: [...sysMsg, { role: "user" as const, content: e.prompt }],
        },
        preferred_output: [{ role: "assistant" as const, content: e.chosen }],
        non_preferred_output: [
          { role: "assistant" as const, content: e.rejected },
        ],
      })),
    );
  }

  // sft / continued_pretrain train off the platform's Igala gold: cold author
  // answers (source-free, the bulk) plus annotator edits. Same loader as the
  // build route, so the reported row count and the uploaded JSONL never diverge.
  const rows = await loadSftSourceRows(job);
  const examples = buildSftExamples(rows, filters);
  return toJsonl(
    examples.map((e) => {
      const user = e.messages.find((m) => m.role === "user")?.content ?? "";
      const assistant =
        e.messages.find((m) => m.role === "assistant")?.content ?? "";
      // One shared row builder (see openai-finetune.ts) so the system turn is
      // always present and the assistant turn is the Igala gold and nothing else.
      return openaiFt.buildOpenAiChatRow({
        systemPrompt: system,
        prompt: user,
        completion: assistant,
      });
    }),
  );
}

/** The real Together AI adapter. Off until TOGETHER_API_KEY is set. */
const togetherProvider: FineTuneProvider = {
  name: "together",
  async launch(job) {
    if (!togetherConfigured()) {
      throw new Error(
        "Together not configured — set TOGETHER_API_KEY to fine-tune on Together",
      );
    }
    const jsonl = await buildTrainingJsonl(job);
    if (!jsonl.trim()) {
      throw new Error(
        "No eligible (non-held-out, non-demo) training rows to upload",
      );
    }
    const fileName = `wikitongues-${job.method}-${job.id.slice(0, 8)}.jsonl`;
    const providerFileId = await uploadTrainingFile(jsonl, fileName);
    const method = job.method === "dpo" ? "dpo" : "sft";
    const providerJobId = await startFineTune({
      fileId: providerFileId,
      model: job.baseModelId,
      method,
      nEpochs: hpNumber(job, "nEpochs"),
      learningRate: hpNumber(job, "learningRate"),
      dpoBeta: hpNumber(job, "dpoBeta"),
      batchSize: hpNumber(job, "batchSize"),
    });
    return { providerJobId, providerFileId };
  },
  async poll(job) {
    if (!job.providerJobId) {
      throw new Error("Job has no Together job id to poll");
    }
    const r = await pollFineTune(job.providerJobId);
    if (r.status !== "succeeded") {
      return { status: r.status, error: r.error };
    }
    // Prefer Together's real billed amount (already converted to USD by the
    // adapter); fall back to the estimate only when they do not report one.
    const costUsd = roundUsd(
      r.costUsd ??
        estimateFineTuneCostUsd({
          baseModelId: job.baseModelId,
          nRows: job.nTrainingRows ?? 0,
          nEpochs: hpNumber(job, "nEpochs") ?? 3,
        }),
    );
    return { status: "succeeded", outputModelId: r.outputModelId, costUsd };
  },
};

/**
 * The real OpenAI adapter. Off until OPENAI_API_KEY is set.
 *
 * Only supervised fine-tuning is wired here: `dpo` and `continued_pretrain` are
 * rejected rather than silently trained as SFT, since OpenAI's preference method
 * takes a different job shape and CPT is not offered at all.
 */
const openaiProvider: FineTuneProvider = {
  name: "openai",
  async launch(job) {
    if (!openaiFt.openAiFineTuneConfigured()) {
      throw new Error(
        "OpenAI not configured - set OPENAI_API_KEY to fine-tune on OpenAI",
      );
    }
    if (job.method !== "sft") {
      throw new Error(
        `OpenAI adapter supports method "sft" only (got "${job.method}")`,
      );
    }
    const jsonl = await buildTrainingJsonl(job);
    if (!jsonl.trim()) {
      throw new Error(
        "No eligible (non-held-out, non-demo) training rows to upload",
      );
    }
    // Verify the base snapshot really exists on this account before spending a
    // file upload on it, and fall back to a known-tunable snapshot if not.
    const model = await openaiFt.resolveBaseModel(job.baseModelId);
    const fileName = `wikitongues-${job.method}-${job.id.slice(0, 8)}.jsonl`;
    const providerFileId = await openaiFt.uploadTrainingFile(jsonl, fileName);
    const providerJobId = await openaiFt.startFineTune({
      fileId: providerFileId,
      model,
      suffix: `${job.language}-${job.method}`.slice(0, 18),
      nEpochs: hpNumber(job, "nEpochs"),
      batchSize: hpNumber(job, "batchSize"),
      learningRateMultiplier: hpNumber(job, "learningRateMultiplier"),
    });
    return { providerJobId, providerFileId };
  },
  async poll(job) {
    if (!job.providerJobId) {
      throw new Error("Job has no OpenAI job id to poll");
    }
    const r = await openaiFt.pollFineTune(job.providerJobId);
    if (r.status !== "succeeded") {
      return { status: r.status, error: r.error };
    }
    // OpenAI reports billed TOKENS, not dollars, so price the reported tokens at
    // the published training rate; fall back to the row-count estimate only when
    // no token count came back.
    const costUsd = roundUsd(
      r.trainedTokens != null
        ? fineTuneCostFromTokensUsd({
            baseModelId: job.baseModelId,
            trainedTokens: r.trainedTokens,
          })
        : estimateFineTuneCostUsd({
            baseModelId: job.baseModelId,
            nRows: job.nTrainingRows ?? 0,
            nEpochs: hpNumber(job, "nEpochs") ?? 3,
          }),
    );
    return { status: "succeeded", outputModelId: r.outputModelId, costUsd };
  },
};

const PROVIDERS: Record<string, FineTuneProvider> = {
  mock: mockProvider,
  together: togetherProvider,
  openai: openaiProvider,
};

/** Known provider names (for UI selectors / validation). */
export const FINE_TUNE_PROVIDERS = Object.keys(PROVIDERS);

/**
 * Resolve a provider by name. Unknown providers fall back to the deterministic
 * mock so a misconfigured job never silently hits a real backend.
 */
export function getFineTuneProvider(name: string): FineTuneProvider {
  return PROVIDERS[name] ?? mockProvider;
}
