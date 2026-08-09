/**
 * COMPOSITE EVAL RUNNER.
 *
 * Pure: give it prompts (with their community gold), candidate outputs, and a
 * language-ID model, and it returns the whole report. No Prisma, no network -
 * so it is unit-testable and a report can be recomputed from a JSON snapshot
 * years later.
 *
 * Three things it always emits, and never emits without:
 *   1. an `n` on every aggregate;
 *   2. a bootstrap 95% interval on every aggregate;
 *   3. a PAIRED head-to-head delta with its own interval, and an explicit
 *      `distinguishable: false` when the interval straddles zero.
 *
 * And one thing it emits alongside every model number: the INTER-GOLD CEILING -
 * how well native speakers match each other on the same prompt under the same
 * metric. Any model score has to be read against that, not against 1.0.
 */

import {
  scoreAgainstReferences,
  interGoldAgreement,
  REFERENCE_METRICS,
  type ReferenceMetric,
  type ReferenceScore,
  type GoldCeiling,
} from "./reference";
import {
  identifyLanguage,
  LANGUAGES,
  type LanguageCode,
  type LanguageIdModel,
  type LanguageIdResult,
} from "./langid";
import {
  bootstrapMean,
  pairedBootstrapDelta,
  wilsonInterval,
  type Interval,
  type DeltaResult,
} from "./stats";

export interface EvalPromptInput {
  /** Stable human id, e.g. ig_bank_orth_001. Used to join outputs to prompts. */
  promptId: string;
  bucket: string | null;
  text: string;
  /** Every community gold answer for this prompt. May be empty. */
  golds: string[];
}

export interface EvalOutputInput {
  candidateId: string;
  candidateName: string;
  promptId: string;
  text: string;
}

export interface PerPromptScore {
  promptId: string;
  bucket: string | null;
  nReferences: number;
  /** Best-of-references score per metric. */
  best: Record<ReferenceMetric, number>;
  /** Mean-over-references score per metric. */
  meanOverRefs: Record<ReferenceMetric, number>;
  toneVariantOnly: boolean;
  language: {
    top: LanguageCode;
    isIgala: boolean;
    isEnglishLike: boolean;
    lowConfidence: boolean;
    margin: number;
  };
  /** The raw output, truncated - handy for the researcher page. */
  preview: string;
}

export interface MetricCell {
  metric: ReferenceMetric;
  best: Interval;
  meanOverRefs: Interval;
}

export interface CategoryReport {
  bucket: string;
  n: number;
  metrics: MetricCell[];
}

export interface LanguageReport {
  /** Share of outputs the gate calls Igala, with a Wilson interval. */
  igalaShare: Interval;
  /**
   * Share of outputs the gate calls English or Pidgin - i.e. "the model
   * answered in English". Reported as one class because the two are not
   * separable by this method.
   */
  englishLikeShare: Interval;
  /** Share of outputs where the gate refused to commit (short text / low margin). */
  lowConfidenceShare: number;
  /** Counts per top-language verdict. */
  verdictCounts: Record<LanguageCode, number>;
  /** Outputs carrying a non-Igala orthographic signature character. */
  signatureFlagged: number;
}

/**
 * How a candidate stands against the current chrF point-estimate leader.
 *
 * This exists because a table SORTED by score reads as a RANKING even when the
 * intervals do not support one, and a reader who scans the top row is exactly
 * the reader who will not check the head-to-head section further down. Every
 * row therefore carries its own verdict against the leader.
 */
export interface LeaderComparison {
  leaderId: string;
  leaderName: string;
  nPaired: number;
  deltaMean: number;
  ciLow: number;
  ciHigh: number;
  /** True only when the paired interval excludes zero. */
  distinguishable: boolean;
  underpowered: boolean;
}

export interface CandidateReport {
  candidateId: string;
  candidateName: string;
  n: number;
  /** Highest chrF POINT ESTIMATE. Not a claim that it is the best model. */
  isLeader: boolean;
  /**
   * Null for the leader itself, and for any candidate sharing fewer than 2
   * prompts with the leader (the minimum for a paired comparison) - which is a
   * statement about COVERAGE, not about the candidate being bad. Otherwise the paired verdict: when
   * `distinguishable` is false, this row and the top row are NOT ranked.
   */
  vsLeader: LeaderComparison | null;
  /** Overall metrics across every scored prompt. */
  overall: MetricCell[];
  byCategory: CategoryReport[];
  language: LanguageReport;
  perPrompt: PerPromptScore[];
}

export interface CeilingReport {
  /** Human-vs-human, leave-one-out, bootstrapped over prompts. */
  overall: MetricCell[];
  byCategory: CategoryReport[];
  nPromptsWithCeiling: number;
  nPromptsWithoutCeiling: number;
  /** Flat list of per-held-out-gold chrF values; feeds threshold calibration. */
  allGoldChrf: number[];
}

export interface HeadToHeadCell {
  metric: ReferenceMetric;
  delta: DeltaResult;
}

export interface HeadToHead {
  candidateA: string;
  candidateB: string;
  nPaired: number;
  cells: HeadToHeadCell[];
}

export interface EvalReport {
  generatedAt: string;
  nPrompts: number;
  nPromptsWithGold: number;
  candidates: CandidateReport[];
  ceiling: CeilingReport;
  /** Every ordered pair (A vs B) among candidates that share >= 2 prompts. */
  headToHead: HeadToHead[];
  /** Non-negotiable caveats rendered verbatim wherever this report is shown. */
  caveats: string[];
}

export const REPORT_CAVEATS = [
  "No automatic metric here measures Igala FLUENCY. chrF measures character overlap with what a handful of speakers happened to write; a fluent, correct answer that uses different words scores low, and a nonsense string that reuses the gold's characters scores high.",
  "Read every model score against the inter-gold ceiling on the same row, never against 1.0. The ceiling is how well native speakers match EACH OTHER; it is the resolution limit of the metric.",
  "The language gate distinguishes Igala from English with a measured accuracy (see the validation block). Its Yoruba / Igbo / Pidgin verdicts come from hardcoded seed lexicons with NO validation data and are triage flags only.",
  "Where a head-to-head interval includes zero we print 'not distinguishable'. That is the finding: the sample cannot support a ranking. The candidate table is SORTED by score for readability; that sort order is not itself a ranking, which is why every row carries its own verdict against the top row.",
  "A model fine-tuned on community gold is being scored against community gold written by the same annotators. The frozen prompts themselves were excluded from training, so this is not leakage - but chrF rewards matching this community's orthographic habits, and a tuned model has been taught exactly those habits. Read a tuned model's chrF lead as 'writes more like these speakers write', which is necessary for good Igala and nowhere near sufficient.",
] as const;

function emptyMetricRecord(): Record<ReferenceMetric, number[]> {
  const out = {} as Record<ReferenceMetric, number[]>;
  for (const m of REFERENCE_METRICS) out[m] = [];
  return out;
}

function buildCells(
  best: Record<ReferenceMetric, number[]>,
  meanOverRefs: Record<ReferenceMetric, number[]>,
  seed: number,
): MetricCell[] {
  return REFERENCE_METRICS.map((metric) => ({
    metric,
    best: bootstrapMean(best[metric], { seed }),
    meanOverRefs: bootstrapMean(meanOverRefs[metric], { seed }),
  }));
}

/** Deterministic seed per candidate/bucket, so reruns reproduce exactly. */
function seedFor(...parts: string[]): number {
  let h = 2166136261;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function scoreCandidate(
  candidateId: string,
  candidateName: string,
  outputs: EvalOutputInput[],
  promptById: Map<string, EvalPromptInput>,
  langModel: LanguageIdModel,
): CandidateReport {
  const perPrompt: PerPromptScore[] = [];
  const overallBest = emptyMetricRecord();
  const overallMean = emptyMetricRecord();
  const byBucketBest = new Map<string, Record<ReferenceMetric, number[]>>();
  const byBucketMean = new Map<string, Record<ReferenceMetric, number[]>>();

  const verdictCounts = Object.fromEntries(
    LANGUAGES.map((l) => [l, 0]),
  ) as Record<LanguageCode, number>;
  let igalaCount = 0;
  let englishLikeCount = 0;
  let lowConfidence = 0;
  let signatureFlagged = 0;

  for (const out of outputs) {
    const prompt = promptById.get(out.promptId);
    if (!prompt) continue;
    const score: ReferenceScore = scoreAgainstReferences(
      out.text,
      prompt.golds,
    );
    const lang: LanguageIdResult = identifyLanguage(langModel, out.text);

    verdictCounts[lang.top] = (verdictCounts[lang.top] ?? 0) + 1;
    if (lang.isIgala) igalaCount++;
    if (lang.isEnglishLike) englishLikeCount++;
    if (lang.lowConfidence) lowConfidence++;
    // Only a FOREIGN signature is a flag; Igala's own ñ is positive evidence.
    if (Object.keys(lang.signals.signatureChars).some((l) => l !== "igala")) {
      signatureFlagged++;
    }

    // A prompt with no gold cannot be scored against gold; it still counts for
    // the language gate, but must not enter the reference-metric aggregates.
    if (score.nReferences > 0) {
      for (const m of REFERENCE_METRICS) {
        overallBest[m].push(score.best[m]);
        overallMean[m].push(score.meanOverRefs[m]);
      }
      const bucket = prompt.bucket ?? "unassigned";
      if (!byBucketBest.has(bucket)) {
        byBucketBest.set(bucket, emptyMetricRecord());
        byBucketMean.set(bucket, emptyMetricRecord());
      }
      for (const m of REFERENCE_METRICS) {
        byBucketBest.get(bucket)![m].push(score.best[m]);
        byBucketMean.get(bucket)![m].push(score.meanOverRefs[m]);
      }
    }

    perPrompt.push({
      promptId: out.promptId,
      bucket: prompt.bucket,
      nReferences: score.nReferences,
      best: score.best,
      meanOverRefs: score.meanOverRefs,
      toneVariantOnly: score.toneVariantOnly,
      language: {
        top: lang.top,
        isIgala: lang.isIgala,
        isEnglishLike: lang.isEnglishLike,
        lowConfidence: lang.lowConfidence,
        margin: lang.margin,
      },
      preview: out.text.slice(0, 160),
    });
  }

  const byCategory: CategoryReport[] = Array.from(byBucketBest.keys())
    .sort()
    .map((bucket) => ({
      bucket,
      n: byBucketBest.get(bucket)!.chrf.length,
      metrics: buildCells(
        byBucketBest.get(bucket)!,
        byBucketMean.get(bucket)!,
        seedFor(candidateId, bucket),
      ),
    }));

  return {
    candidateId,
    candidateName,
    n: perPrompt.length,
    // Filled in by runEval once every candidate has been scored.
    isLeader: false,
    vsLeader: null,
    overall: buildCells(overallBest, overallMean, seedFor(candidateId)),
    byCategory,
    language: {
      igalaShare: wilsonInterval(igalaCount, perPrompt.length),
      englishLikeShare: wilsonInterval(englishLikeCount, perPrompt.length),
      lowConfidenceShare:
        perPrompt.length > 0 ? lowConfidence / perPrompt.length : 0,
      verdictCounts,
      signatureFlagged,
    },
    perPrompt,
  };
}

function buildCeiling(prompts: EvalPromptInput[]): CeilingReport {
  const overallBest = emptyMetricRecord();
  const overallMean = emptyMetricRecord();
  const byBucketBest = new Map<string, Record<ReferenceMetric, number[]>>();
  const byBucketMean = new Map<string, Record<ReferenceMetric, number[]>>();
  const allGoldChrf: number[] = [];
  let withCeiling = 0;
  let withoutCeiling = 0;

  for (const p of prompts) {
    const ceiling: GoldCeiling = interGoldAgreement(p.golds);
    if (!ceiling.computable) {
      withoutCeiling++;
      continue;
    }
    withCeiling++;
    allGoldChrf.push(...ceiling.perGoldChrf);
    const bucket = p.bucket ?? "unassigned";
    if (!byBucketBest.has(bucket)) {
      byBucketBest.set(bucket, emptyMetricRecord());
      byBucketMean.set(bucket, emptyMetricRecord());
    }
    for (const m of REFERENCE_METRICS) {
      overallBest[m].push(ceiling.best[m]);
      overallMean[m].push(ceiling.meanOverRefs[m]);
      byBucketBest.get(bucket)![m].push(ceiling.best[m]);
      byBucketMean.get(bucket)![m].push(ceiling.meanOverRefs[m]);
    }
  }

  return {
    overall: buildCells(overallBest, overallMean, seedFor("__ceiling__")),
    byCategory: Array.from(byBucketBest.keys())
      .sort()
      .map((bucket) => ({
        bucket,
        n: byBucketBest.get(bucket)!.chrf.length,
        metrics: buildCells(
          byBucketBest.get(bucket)!,
          byBucketMean.get(bucket)!,
          seedFor("__ceiling__", bucket),
        ),
      })),
    nPromptsWithCeiling: withCeiling,
    nPromptsWithoutCeiling: withoutCeiling,
    allGoldChrf,
  };
}

/** Paired head-to-head on the prompts both candidates answered. */
export function headToHead(a: CandidateReport, b: CandidateReport): HeadToHead {
  const aByPrompt = new Map(
    a.perPrompt.filter((p) => p.nReferences > 0).map((p) => [p.promptId, p]),
  );
  const shared: string[] = [];
  for (const p of b.perPrompt) {
    if (p.nReferences > 0 && aByPrompt.has(p.promptId)) shared.push(p.promptId);
  }
  shared.sort();
  const bByPrompt = new Map(b.perPrompt.map((p) => [p.promptId, p]));

  const cells: HeadToHeadCell[] = REFERENCE_METRICS.map((metric) => {
    const xs = shared.map((id) => aByPrompt.get(id)!.best[metric]);
    const ys = shared.map((id) => bByPrompt.get(id)!.best[metric]);
    return {
      metric,
      delta: pairedBootstrapDelta(xs, ys, {
        seed: seedFor(a.candidateId, b.candidateId, metric),
      }),
    };
  });

  return {
    candidateA: a.candidateId,
    candidateB: b.candidateId,
    nPaired: shared.length,
    cells,
  };
}

export interface RunEvalInput {
  prompts: EvalPromptInput[];
  outputs: EvalOutputInput[];
  langModel: LanguageIdModel;
  /** Override the timestamp so snapshots diff cleanly in tests. */
  generatedAt?: string;
}

export function runEval(input: RunEvalInput): EvalReport {
  const promptById = new Map(input.prompts.map((p) => [p.promptId, p]));

  const byCandidate = new Map<string, EvalOutputInput[]>();
  const names = new Map<string, string>();
  for (const out of input.outputs) {
    if (!byCandidate.has(out.candidateId)) byCandidate.set(out.candidateId, []);
    byCandidate.get(out.candidateId)!.push(out);
    names.set(out.candidateId, out.candidateName);
  }

  const candidates = Array.from(byCandidate.entries())
    .map(([id, outs]) =>
      scoreCandidate(
        id,
        names.get(id) ?? id,
        outs,
        promptById,
        input.langModel,
      ),
    )
    .sort((x, y) => {
      // Rank by chrF point estimate, but the UI must still read the CI before
      // calling it an ordering - see `distinguishable` on the head-to-head.
      const cx = x.overall.find((c) => c.metric === "chrf")?.best.mean ?? 0;
      const cy = y.overall.find((c) => c.metric === "chrf")?.best.mean ?? 0;
      return cy - cx;
    });

  const h2h: HeadToHead[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const pair = headToHead(candidates[i], candidates[j]);
      if (pair.nPaired >= 2) h2h.push(pair);
    }
  }

  // Annotate every row with its verdict against the leader, so the sort order
  // can never be mistaken for a ranking the data supports.
  const leader = candidates[0];
  if (leader) {
    leader.isLeader = true;
    for (const c of candidates) {
      if (c.candidateId === leader.candidateId) continue;
      const pair = h2h.find(
        (h) =>
          h.candidateA === leader.candidateId && h.candidateB === c.candidateId,
      );
      if (!pair) continue;
      const d = pair.cells.find((x) => x.metric === "chrf")!.delta;
      c.vsLeader = {
        leaderId: leader.candidateId,
        leaderName: leader.candidateName,
        nPaired: pair.nPaired,
        deltaMean: d.mean,
        ciLow: d.ciLow,
        ciHigh: d.ciHigh,
        distinguishable: d.distinguishable,
        underpowered: d.underpowered,
      };
    }
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nPrompts: input.prompts.length,
    nPromptsWithGold: input.prompts.filter((p) => p.golds.length > 0).length,
    candidates,
    ceiling: buildCeiling(input.prompts),
    headToHead: h2h,
    caveats: [...REPORT_CAVEATS],
  };
}
