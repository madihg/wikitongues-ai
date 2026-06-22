import {
  bradleyTerry,
  type BradleyTerryResult,
  type PairwiseObservation,
} from "./bradley-terry";
import { BUCKET_KEYS, RUBRIC_KEYS } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

/**
 * Arena aggregation: turn collected human pairwise + rubric signal into a
 * per-bucket ranking matrix. Pure functions — the API route supplies plain
 * rows mapped from Prisma so this stays unit-testable.
 */

/** A pairwise comparison reduced to the two candidates and the winner. */
export interface PairwiseRow {
  candidateA: string;
  candidateB: string;
  winner: "a" | "b" | "tie";
  bucket: EvalBucket | null;
}

/** A rubric submission reduced to a candidate, bucket, and the four 1-5 axes. */
export interface RubricRow {
  candidateId: string;
  bucket: EvalBucket | null;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
}

export interface RubricMeans {
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
  overall: number;
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

/** Run Bradley-Terry separately for each of the 8 buckets, plus overall. */
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

function emptyMeans(): { sum: RubricMeans; count: number } {
  return {
    sum: {
      culturalAccuracy: 0,
      linguisticAuthenticity: 0,
      culturalNormAdherence: 0,
      factualCorrectness: 0,
      overall: 0,
      n: 0,
    },
    count: 0,
  };
}

/** Mean rubric per candidate, per bucket and overall ("__overall__"). */
export function aggregateRubric(
  rows: RubricRow[],
): Record<string, Record<string, RubricMeans>> {
  const acc: Record<
    string,
    Record<string, { sum: RubricMeans; count: number }>
  > = {};

  const add = (cid: string, key: string, row: RubricRow) => {
    acc[cid] ??= {};
    acc[cid][key] ??= emptyMeans();
    const a = acc[cid][key];
    a.sum.culturalAccuracy += row.culturalAccuracy;
    a.sum.linguisticAuthenticity += row.linguisticAuthenticity;
    a.sum.culturalNormAdherence += row.culturalNormAdherence;
    a.sum.factualCorrectness += row.factualCorrectness;
    a.count += 1;
  };

  for (const row of rows) {
    add(row.candidateId, "__overall__", row);
    if (row.bucket) add(row.candidateId, row.bucket, row);
  }

  const out: Record<string, Record<string, RubricMeans>> = {};
  for (const [cid, byKey] of Object.entries(acc)) {
    out[cid] = {};
    for (const [key, { sum, count }] of Object.entries(byKey)) {
      const n = count || 1;
      const means: RubricMeans = {
        culturalAccuracy: sum.culturalAccuracy / n,
        linguisticAuthenticity: sum.linguisticAuthenticity / n,
        culturalNormAdherence: sum.culturalNormAdherence / n,
        factualCorrectness: sum.factualCorrectness / n,
        overall: 0,
        n: count,
      };
      means.overall =
        (means.culturalAccuracy +
          means.linguisticAuthenticity +
          means.culturalNormAdherence +
          means.factualCorrectness) /
        RUBRIC_KEYS.length;
      out[cid][key] = means;
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
