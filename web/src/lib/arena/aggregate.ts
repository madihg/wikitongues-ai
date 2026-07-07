import {
  bradleyTerry,
  type BradleyTerryResult,
  type PairwiseObservation,
} from "./bradley-terry";
import { BUCKET_KEYS } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

/**
 * Arena aggregation: turn collected human pairwise + rubric signal into a
 * per-bucket ranking matrix. Pure functions — the API route supplies plain
 * rows mapped from Prisma so this stays unit-testable.
 *
 * Rubric rows are axis-keyed (rubric v2): one row per scored axis. N/A scores
 * (null) are excluded before rows reach this module.
 */

/** A pairwise comparison reduced to the two candidates and the winner. */
export interface PairwiseRow {
  candidateA: string;
  candidateB: string;
  winner: "a" | "b" | "tie";
  bucket: EvalBucket | null;
}

/** One scored rubric axis (v2): candidate, bucket, axis key, 0-5 score. */
export interface RubricRow {
  candidateId: string;
  bucket: EvalBucket | null;
  axis: string;
  score: number;
}

export interface RubricMeans {
  /** Mean per axis key (only axes that were actually scored appear). */
  axes: Record<string, number>;
  /** Mean of the axis means. */
  overall: number;
  /** Number of scored axis rows that fed this cell. */
  n: number;
}

export interface BucketRanking {
  bucket: EvalBucket;
  bt: BradleyTerryResult;
}

export interface ArenaMatrix {
  /** BT ranking per bucket. */
  byBucket: Record<string, BradleyTerryResult>;
  /** BT ranking pooled across all buckets. */
  overall: BradleyTerryResult;
  /** Rubric means per candidate, keyed candidateId -> bucket("__overall__") -> means. */
  rubric: Record<string, Record<string, RubricMeans>>;
  candidateIds: string[];
}

function toObservation(row: PairwiseRow): PairwiseObservation {
  return { a: row.candidateA, b: row.candidateB, winner: row.winner };
}

/** Run Bradley-Terry separately for each prompt category, plus overall. */
export function rankPairwise(rows: PairwiseRow[]): {
  byBucket: Record<string, BradleyTerryResult>;
  overall: BradleyTerryResult;
} {
  const byBucket: Record<string, BradleyTerryResult> = {};
  for (const bucket of BUCKET_KEYS) {
    const obs = rows.filter((r) => r.bucket === bucket).map(toObservation);
    byBucket[bucket] = bradleyTerry(obs);
  }
  const overall = bradleyTerry(rows.map(toObservation));
  return { byBucket, overall };
}

/** Mean rubric per candidate, per bucket and overall ("__overall__").
 *  Per-axis means first; a cell's overall is the mean of its axis means, so
 *  a frequently-scored axis doesn't drown out a rarely-applicable one. */
export function aggregateRubric(
  rows: RubricRow[],
): Record<string, Record<string, RubricMeans>> {
  // cid -> cellKey -> axis -> {sum, n}
  const acc: Record<
    string,
    Record<string, Record<string, { sum: number; n: number }>>
  > = {};

  const add = (cid: string, key: string, row: RubricRow) => {
    acc[cid] ??= {};
    acc[cid][key] ??= {};
    acc[cid][key][row.axis] ??= { sum: 0, n: 0 };
    acc[cid][key][row.axis].sum += row.score;
    acc[cid][key][row.axis].n += 1;
  };

  for (const row of rows) {
    add(row.candidateId, "__overall__", row);
    if (row.bucket) add(row.candidateId, row.bucket, row);
  }

  const out: Record<string, Record<string, RubricMeans>> = {};
  for (const [cid, byKey] of Object.entries(acc)) {
    out[cid] = {};
    for (const [key, byAxis] of Object.entries(byKey)) {
      const axes: Record<string, number> = {};
      let n = 0;
      for (const [axis, { sum, n: axisN }] of Object.entries(byAxis)) {
        axes[axis] = sum / axisN;
        n += axisN;
      }
      const axisMeans = Object.values(axes);
      out[cid][key] = {
        axes,
        overall:
          axisMeans.length > 0
            ? axisMeans.reduce((s, v) => s + v, 0) / axisMeans.length
            : 0,
        n,
      };
    }
  }
  return out;
}

export function buildArenaMatrix(
  pairwise: PairwiseRow[],
  rubric: RubricRow[],
): ArenaMatrix {
  const { byBucket, overall } = rankPairwise(pairwise);
  const rubricMeans = aggregateRubric(rubric);
  const candidateIds = Array.from(
    new Set([
      ...pairwise.flatMap((r) => [r.candidateA, r.candidateB]),
      ...rubric.map((r) => r.candidateId),
    ]),
  );
  return { byBucket, overall, rubric: rubricMeans, candidateIds };
}
