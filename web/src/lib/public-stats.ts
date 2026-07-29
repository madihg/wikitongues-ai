import { BUCKETS, bucketLabel } from "@/lib/buckets";

/**
 * PUBLIC, AGGREGATE-ONLY project statistics.
 *
 * This module shapes the payload served by GET /api/public/stats, which is
 * UNAUTHENTICATED and consumed by the public marketing site's Research page.
 * It must therefore only ever expose counts and rates - never names, emails,
 * raw Igala answers, or any per-person or per-answer content. The Igala corpus
 * is the community's asset; only numbers about it leave this boundary.
 *
 * The shaping logic is a pure function so it can be unit-tested without a DB.
 */

/**
 * The measured output-purity milestone, hard-coded as a constant with its date.
 * Adding an explicit "Igala-forcing" instruction at generation time (which names
 * and forbids Yoruba/Igbo/Pidgin substitution) cut measured non-Igala content
 * from 41% to 3.1% - roughly an order of magnitude - before any fine-tuning.
 * Source: research dossier, compiled 2026-07-27.
 */
export const PURITY_MILESTONE = {
  metric:
    "Off-target output: non-Igala content (Yoruba, Igbo, or Pidgin bleed)",
  before: 41,
  after: 3.1,
  unit: "percent",
  intervention:
    "an explicit Igala-forcing instruction added at generation time, before any fine-tuning",
  measuredOn: "2026-07-27",
} as const;

export type PurityMilestone = typeof PURITY_MILESTONE;

/** Raw counts gathered by the route from Prisma. All must be isDemo-false where applicable. */
export interface RawPublicStats {
  totalPrompts: number;
  heldOutBenchmark: number;
  promptsByBucket: Array<{ bucket: string | null; count: number }>;
  languages: string[];
  coldAuthoredAnswers: number;
  corrections: number;
  pairwiseTotal: number;
  bothInadequate: number;
  decidedWinner: number;
  activeAnnotators: number;
}

export interface CategoryCount {
  key: string;
  label: string;
  count: number;
}

export interface PublicStats {
  generatedAt: string;
  languages: string[];
  prompts: {
    total: number;
    heldOutBenchmark: number;
    byCategory: CategoryCount[];
  };
  gold: {
    coldAuthoredAnswers: number;
    corrections: number;
    total: number;
  };
  judgments: {
    pairwiseTotal: number;
    bothInadequate: number;
    /** 0..1, rounded to 4 decimals. 0 when there are no judgments yet. */
    bothInadequateRate: number;
    decidedWinner: number;
  };
  annotators: {
    /** Count only - never any identifying information. */
    active: number;
  };
  modelOutputPurity: PurityMilestone;
}

/** Round to a fixed number of decimals without floating-point drift in output. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Shape raw counts into the public payload. Pure: pass `generatedAt` for
 * deterministic tests. Categories are always returned as the full canonical
 * set of eight, in taxonomy order, with a 0 for any that has no prompts yet -
 * so the client never has to know the taxonomy.
 */
export function buildPublicStats(
  raw: RawPublicStats,
  generatedAt: string = new Date().toISOString(),
): PublicStats {
  const countByBucket = new Map<string, number>();
  for (const row of raw.promptsByBucket) {
    if (row.bucket) countByBucket.set(row.bucket, row.count);
  }

  const byCategory: CategoryCount[] = BUCKETS.map((b) => ({
    key: b.key,
    label: bucketLabel(b.key),
    count: countByBucket.get(b.key) ?? 0,
  }));

  const bothInadequateRate =
    raw.pairwiseTotal > 0
      ? round(raw.bothInadequate / raw.pairwiseTotal, 4)
      : 0;

  const languages =
    raw.languages.length > 0 ? [...new Set(raw.languages)].sort() : ["igala"];

  return {
    generatedAt,
    languages,
    prompts: {
      total: raw.totalPrompts,
      heldOutBenchmark: raw.heldOutBenchmark,
      byCategory,
    },
    gold: {
      coldAuthoredAnswers: raw.coldAuthoredAnswers,
      corrections: raw.corrections,
      total: raw.coldAuthoredAnswers + raw.corrections,
    },
    judgments: {
      pairwiseTotal: raw.pairwiseTotal,
      bothInadequate: raw.bothInadequate,
      bothInadequateRate,
      decidedWinner: raw.decidedWinner,
    },
    annotators: {
      active: raw.activeAnnotators,
    },
    modelOutputPurity: PURITY_MILESTONE,
  };
}
