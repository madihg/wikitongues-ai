import type { SpeechJobKind } from "./train-providers";

/**
 * Numbers the nightly loop needs that are not the retrain thresholds (those
 * are DECIDE_CONFIG in decide.ts). One file, so the dashboard and the tests
 * read the same values.
 */

/** Modal GPU rates in USD per second. Mirrors worker/igala_speech/rates.py; loop-config.test.ts fails if they drift. */
export const GPU_RATES_PER_SECOND = {
  A10G: 0.000306,
  "A100-80GB": 0.000694,
} as const;

/**
 * The GPU and hours planned for each kind of job, used for the estimate
 * written when a job launches. Assumptions from worker/README.md ("Cost
 * estimates"), not measurements: replace them after the first real run. The
 * callback's costUsd replaces the estimate.
 */
export const PLANNED_GPU: Record<
  Extract<SpeechJobKind, "train_asr" | "train_tts" | "evaluate" | "transcribe">,
  { gpu: keyof typeof GPU_RATES_PER_SECOND; hours: number }
> = {
  train_asr: { gpu: "A100-80GB", hours: 2.25 }, // 5000 steps at 1.5 s plus 10 min setup
  train_tts: { gpu: "A10G", hours: 6 },
  evaluate: { gpu: "A10G", hours: 0.25 },
  transcribe: { gpu: "A10G", hours: 0.5 },
};

/** Estimated USD for one job: planned GPU seconds times the rate, four places. */
export function estimateCostUsd(kind: keyof typeof PLANNED_GPU): number {
  const { gpu, hours } = PLANNED_GPU[kind];
  return Math.round(GPU_RATES_PER_SECOND[gpu] * hours * 3600 * 1e4) / 1e4;
}

/**
 * A candidate is "regressed" against the promoted model of its system when
 * CER is more than 1.0 point worse or TER more than 2.0 points worse. Points
 * are percentage points: the metrics are fractions, so 0.01 and 0.02.
 */
export const REGRESSION = { cerPoints: 1.0, terPoints: 2.0 } as const;

/**
 * Studio clips are told apart by sourceRef. PR H (the studio session page)
 * writes it; until then no clip matches and the TTS side of decide() sees 0.
 */
export const STUDIO_SOURCE_REF_PREFIX = "studio:";

export const isStudioRow = (r: { sourceRef?: string | null }): boolean =>
  r.sourceRef?.startsWith(STUDIO_SOURCE_REF_PREFIX) ?? false;

/** The base models the worker trains from (worker/igala_speech/jobs.py defaults). */
export const BASE_MODELS = {
  asr: "omniASR_CTC_300M_v2",
  tts: "everyvoice-fastspeech2",
} as const;
