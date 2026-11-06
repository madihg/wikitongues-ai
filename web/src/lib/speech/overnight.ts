/**
 * The "What changed overnight" card's view model, built from the latest
 * SpeechNightlyRun row (its stepLog) and the candidate its training job made.
 * Pure and defensive: stepLog is Json written by nightly.ts, read back here
 * without trusting its shape. Numbers, reasons and ids only.
 */

export interface MetricSet {
  cer: number;
  werStripped: number;
  werRetained: number;
  ter: number;
}

export interface OvernightCandidate {
  id: string;
  jobId: string | null;
  regressed: boolean;
  metrics: MetricSet;
}

export interface OvernightView {
  state: "trained" | "skipped" | "failed" | "running";
  runId: string;
  runDate: string;
  newClips: number;
  newHours: number;
  reasons: string[];
  errors: string[];
  launched: Array<{ jobId: string; kind: string }>;
  candidate: OvernightCandidate | null;
  /** Metrics minus the promoted model's, in percentage points; null with nothing promoted. */
  delta: MetricSet | null;
  costUsd: number;
}

type Entry = Record<string, unknown>;
const isEntry = (v: unknown): v is Entry =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strs = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function deltaSet(a: MetricSet, b: MetricSet): MetricSet {
  const pts = (x: number, y: number) => Math.round((x - y) * 100 * 1e6) / 1e6;
  return {
    cer: pts(a.cer, b.cer),
    werStripped: pts(a.werStripped, b.werStripped),
    werRetained: pts(a.werRetained, b.werRetained),
    ter: pts(a.ter, b.ter),
  };
}

export function buildOvernight(
  run: {
    id: string;
    runDate: Date;
    outcome: string;
    stepLog: unknown;
    costUsd: number;
  },
  candidates: OvernightCandidate[],
  promoted: MetricSet | null,
  actualCostUsd: number | null,
): OvernightView {
  const log = (Array.isArray(run.stepLog) ? run.stepLog : []).filter(isEntry);
  const find = (name: string) => log.find((e) => e.step === name);
  const ingest = find("ingest");
  const decision = find("decide");
  const finish = find("finish");

  const launched = (Array.isArray(finish?.launched) ? finish.launched : [])
    .filter(isEntry)
    .map((l) => ({ jobId: String(l.jobId), kind: String(l.kind) }));
  const trainJobId = launched.find((l) => l.kind.startsWith("train"))?.jobId;
  const candidate = trainJobId
    ? (candidates.find((c) => c.jobId === trainJobId) ?? null)
    : null;

  const errors = log
    .filter((e) => e.ok === false)
    .map((e) => `${String(e.step)}: ${String(e.error ?? "failed")}`);

  const state: OvernightView["state"] =
    run.outcome === "trained" || run.outcome === "skipped" || run.outcome === "failed"
      ? run.outcome
      : "running";

  return {
    state,
    runId: run.id,
    runDate: run.runDate.toISOString().slice(0, 10),
    newClips: num(ingest?.newClips),
    newHours: num(ingest?.newHours),
    reasons: strs(decision?.reasons),
    errors,
    launched,
    candidate,
    delta: candidate && promoted ? deltaSet(candidate.metrics, promoted) : null,
    costUsd: actualCostUsd ?? run.costUsd,
  };
}

/** A fraction as a percentage with one decimal: 0.2345 -> "23.5%". */
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** A delta in points with a sign: 1.234 -> "+1.2", -0.5 -> "-0.5". */
export const signedPoints = (x: number) =>
  `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x).toFixed(1)}`;
