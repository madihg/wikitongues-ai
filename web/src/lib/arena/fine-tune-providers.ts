import type { FineTuneJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildDpoExamples,
  buildSftExamples,
  toJsonl,
  type DpoSourceRow,
  type SftSourceRow,
  type ExportFilters,
} from "@/lib/arena/training-export";
import { estimateFineTuneCostUsd, roundUsd } from "@/lib/arena/pricing";
import {
  togetherConfigured,
  uploadTrainingFile,
  startFineTune,
  pollFineTune,
} from "@/lib/arena/together";

/**
 * Provider-adapter interface for the fine-tune flywheel.
 *
 * The platform collects annotations, builds a training set, and hands it to a
 * provider that actually runs the job. The closed path (a deterministic mock) is
 * fully wired so the whole flow runs on the current stack with NO external calls
 * and NO GPU — this stays the DEFAULT for the Igala pilot. "together" is a REAL
 * adapter (Together AI, the same provider used in singulars) but is OFF until
 * TOGETHER_API_KEY is set; calling it unconfigured throws a clear error. "openai"
 * stays a stub.
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
 * Build the Together training JSONL for a job, fresh from the collected signal.
 * Reuses the same pure builders as the export path, so the contamination guard
 * (held-out prompts dropped) and the demo guard (isDemo rows excluded) both hold.
 */
async function buildTogetherJsonl(job: FineTuneJob): Promise<string> {
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

  // sft / continued_pretrain both train off edits as gold targets.
  const edits = await prisma.outputEdit.findMany({
    where: {
      isDemo: false,
      ...(job.sourceEditIds.length > 0
        ? { id: { in: job.sourceEditIds } }
        : {}),
    },
    include: {
      modelOutput: {
        select: {
          prompt: {
            select: { id: true, text: true, isHoldout: true, bucket: true },
          },
        },
      },
    },
  });
  const rows: SftSourceRow[] = edits.map((e) => ({
    promptId: e.modelOutput.prompt.id,
    promptText: e.modelOutput.prompt.text,
    correctedText: e.correctedText,
    bucket: e.bucket ?? e.modelOutput.prompt.bucket,
    isHoldout: e.modelOutput.prompt.isHoldout,
    verificationStatus: e.verificationStatus,
  }));
  const examples = buildSftExamples(rows, filters);
  return toJsonl(
    examples.map((e) => ({ messages: [...sysMsg, ...e.messages] })),
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
    const jsonl = await buildTogetherJsonl(job);
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
    const costUsd = roundUsd(
      estimateFineTuneCostUsd({
        baseModelId: job.baseModelId,
        nRows: job.nTrainingRows ?? 0,
        nEpochs: hpNumber(job, "nEpochs") ?? 3,
      }),
    );
    return { status: "succeeded", outputModelId: r.outputModelId, costUsd };
  },
};

/** A provider that is recognized but not yet wired to a real backend. */
function makeStubProvider(name: string): FineTuneProvider {
  const notConfigured = (): never => {
    throw new Error(
      `provider ${name} not configured — set credentials and wire the real adapter`,
    );
  };
  return {
    name,
    async launch() {
      return notConfigured();
    },
    async poll() {
      return notConfigured();
    },
  };
}

const PROVIDERS: Record<string, FineTuneProvider> = {
  mock: mockProvider,
  together: togetherProvider,
  openai: makeStubProvider("openai"),
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
