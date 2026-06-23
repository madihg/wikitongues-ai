import type { FineTuneJob } from "@prisma/client";

/**
 * Provider-adapter interface for the fine-tune flywheel.
 *
 * The platform collects annotations, builds a training set, and hands it to a
 * provider that actually runs the job. The closed path (a deterministic mock)
 * is fully wired so the whole flow runs on the current stack with NO external
 * calls and NO GPU. The open-weights / hosted providers ("openai", "together")
 * are intentionally stubbed: their launch/poll throw a clear error so the path
 * is obviously not-yet-live until real credentials and adapters are wired.
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
  openai: makeStubProvider("openai"),
  together: makeStubProvider("together"),
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
