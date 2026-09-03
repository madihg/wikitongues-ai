import { bradleyTerry, type PairwiseObservation } from "./bradley-terry";
import { BUCKET_KEYS } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

/**
 * The rubric arena table, windowed and gated.
 *
 * The per-category Bradley-Terry fit over ALL history is dominated by an era
 * that carries almost no signal: before the annotation pivot the arms were
 * weak enough that speakers rejected BOTH answers in nearly every comparison,
 * so those rows enter the denominator and leave the numerator empty. Fitting
 * over the whole corpus therefore spreads a handful of decided winners across
 * every candidate and every category, and the table fills with neutral 50s -
 * an absence of evidence that reads like a wall of ties.
 *
 * Two corrections live here, both pure and both testable:
 *
 *  1. ERA. The window defaults to the post-pivot era, whose start is DERIVED
 *     from the data - the first non-demo comparison involving a candidate that
 *     is in the pairing pool right now (CandidateModel.inPairingPool). It is a
 *     derivation rather than a constant so it keeps telling the truth as the
 *     pool changes, and it lands on the pivot recorded in
 *     tasks/annotation-pivot-decision.md (2026-08-20) without that date being
 *     written down anywhere in the code.
 *
 *  2. SPARSITY. A candidate earns a row only once it has
 *     MIN_DECIDED_PER_CANDIDATE decided comparisons inside the window.
 *     Everything below the line is listed with its own count instead of being
 *     dropped, so a reader can see the absence rather than infer a tie from a
 *     column of 50s.
 *
 * Neither correction invents confidence. The fit, the CIs and the
 * "distinguishable" verdict are still Bradley-Terry's, computed on the rows in
 * the window; nothing here rescales, smooths, or backfills a score, and no
 * model judges any Igala at any point.
 */

/** Minimum decided comparisons a candidate needs inside the selected window
 * before it earns a row in the table. Exported so the UI copy quoting the
 * threshold can never drift from the computation - the same rule as
 * MIN_DECIDED_PER_PAIRING in src/lib/annotation-insights.ts. */
export const MIN_DECIDED_PER_CANDIDATE = 5;

/** The pinned annotation pivot: the value derivePivotAt returns against
 * production as of the 2026-09-01 decision recorded in
 * tasks/annotation-pivot-decision.md. Pinning it stops the post-pivot window
 * from silently moving every time the pairing pool changes (adding a new
 * arm to inPairingPool would otherwise re-derive an EARLIER pivot, since
 * derivePivotAt takes the first comparison touching any current pool
 * member) - the window boundary is a decision, not a side effect of pool
 * membership. derivePivotAt is kept as a test-only cross-check that must
 * still equal this constant against a fixture reproducing that decision. */
export const POOL_PIVOT_AT = "2026-08-20T19:38:08.385Z";

/** "since_pivot" is the default: it is the window where speakers are actually
 * deciding. "all_time" stays one click away because hiding the old era would
 * be its own dishonesty. */
export type ArenaEra = "since_pivot" | "all_time";

export const DEFAULT_ARENA_ERA: ArenaEra = "since_pivot";

export const ARENA_ERA_LABELS: Record<ArenaEra, string> = {
  since_pivot: "Since the annotation pivot",
  all_time: "All time",
};

/** A comparison flattened to what the window and the fit need. `outcome` is
 * the raw stored verdict, because "both_inadequate" is NOT a decided vote and
 * the gate must not count it as one. */
export interface ArenaComparisonRow {
  candidateA: string;
  candidateB: string;
  /** "a" | "b" | "tie" | "both_inadequate" as stored. */
  outcome: string;
  bucket: EvalBucket | null;
  createdAt: Date;
  /** CandidateModel.inPairingPool for each side, as it stands now. */
  aInPool: boolean;
  bInPool: boolean;
}

export interface EraCell {
  bucket: string;
  strength: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  rank: number | null;
  /** Comparisons in this category involving this candidate, in the window. */
  games: number;
  /** Of those, the ones where a speaker picked a side. */
  decided: number;
  distinguishable: boolean;
}

export interface EraRow {
  candidateId: string;
  /** Decided comparisons involving this candidate, in the window. */
  decided: number;
  games: number;
  overall: {
    strength: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    rank: number | null;
    games: number;
    decided: number;
    distinguishable: boolean;
  };
  cells: EraCell[];
}

/** A candidate that did not clear the gate, with the count that kept it out. */
export interface EraShortfall {
  candidateId: string;
  decided: number;
  games: number;
}

export interface EraSlice {
  era: ArenaEra;
  /** Start of the window, ISO. Null for all-time, and null for the post-pivot
   * window when no pairing-pool arm has been compared yet. */
  windowStart: string | null;
  comparisons: number;
  decided: number;
  ties: number;
  bothInadequate: number;
  /** The gate that produced `rows` and `belowGate`, carried in the payload so
   * the copy interpolates the same number the computation used. */
  minDecided: number;
  /** Candidates clearing the gate, best overall rank first. */
  rows: EraRow[];
  /** Registered candidates that did not, with their counts. Never dropped. */
  belowGate: EraShortfall[];
  /** Prompt categories with at least one comparison in the window. */
  bucketsWithVotes: string[];
  /** Prompt categories with none - a column of dashes, so it is not drawn. */
  bucketsWithoutVotes: string[];
  overallDistinguishable: boolean;
}

const DECIDED = new Set(["a", "b"]);

function isDecided(outcome: string): boolean {
  return DECIDED.has(outcome);
}

/**
 * The pivot: the earliest non-demo comparison involving a candidate that is in
 * the pairing pool right now. Derived, never hardcoded - see the module note.
 * Null when no pool arm has been compared yet.
 */
export function derivePivotAt(rows: ArenaComparisonRow[]): Date | null {
  let earliest: Date | null = null;
  for (const r of rows) {
    if (!r.aInPool && !r.bInPool) continue;
    if (earliest === null || r.createdAt < earliest) earliest = r.createdAt;
  }
  return earliest;
}

/** The rows inside a window. The post-pivot window is empty rather than
 * silently all-time when there is no pivot yet: a window with no start date is
 * not a window. */
export function selectEra(
  rows: ArenaComparisonRow[],
  era: ArenaEra,
  pivotAt: Date | null,
): ArenaComparisonRow[] {
  if (era === "all_time") return rows;
  if (pivotAt === null) return [];
  return rows.filter((r) => r.createdAt.getTime() >= pivotAt.getTime());
}

/** Decided and total comparison counts per candidate over the given rows. */
export function decidedByCandidate(
  rows: ArenaComparisonRow[],
): Map<string, { decided: number; games: number }> {
  const out = new Map<string, { decided: number; games: number }>();
  const bump = (id: string, decided: boolean) => {
    const acc = out.get(id) ?? { decided: 0, games: 0 };
    acc.games += 1;
    if (decided) acc.decided += 1;
    out.set(id, acc);
  };
  for (const r of rows) {
    if (r.candidateA === r.candidateB) continue;
    const decided = isDecided(r.outcome);
    bump(r.candidateA, decided);
    bump(r.candidateB, decided);
  }
  return out;
}

/** "both_inadequate" folds into "tie" for the fit - the fit has no third
 * outcome - but only after the decided counts above are taken, so a rejection
 * of both answers never counts as evidence about either. */
function toObservation(row: ArenaComparisonRow): PairwiseObservation {
  return {
    a: row.candidateA,
    b: row.candidateB,
    winner: row.outcome === "a" || row.outcome === "b" ? row.outcome : "tie",
  };
}

export interface BuildEraSliceOptions {
  era: ArenaEra;
  pivotAt: Date | null;
  /** Every registered candidate, so a candidate with no votes in the window is
   * listed as having none rather than vanishing. */
  candidateIds: string[];
  minDecided?: number;
}

/**
 * One era's view of the table: the fit over the rows in the window, the rows
 * that clear the gate, and the counts for everything that does not.
 *
 * The fit runs over ALL rows in the window, including candidates below the
 * gate: their votes are real evidence about the candidates they were compared
 * against. The gate governs who gets a ROW, never whose votes count.
 */
export function buildEraSlice(
  allRows: ArenaComparisonRow[],
  options: BuildEraSliceOptions,
): EraSlice {
  const {
    era,
    pivotAt,
    candidateIds,
    minDecided = MIN_DECIDED_PER_CANDIDATE,
  } = options;
  const rows = selectEra(allRows, era, pivotAt).filter(
    (r) => r.candidateA !== r.candidateB,
  );

  let decided = 0;
  let ties = 0;
  let bothInadequate = 0;
  for (const r of rows) {
    if (isDecided(r.outcome)) decided += 1;
    else if (r.outcome === "both_inadequate") bothInadequate += 1;
    else ties += 1;
  }

  const totals = decidedByCandidate(rows);

  // Per-bucket fits plus the pooled overall fit, all on the windowed rows.
  const byBucket: Record<string, ReturnType<typeof bradleyTerry>> = {};
  const bucketRows: Record<string, ArenaComparisonRow[]> = {};
  for (const bucket of BUCKET_KEYS) {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    bucketRows[bucket] = inBucket;
    byBucket[bucket] = bradleyTerry(inBucket.map(toObservation));
  }
  const overall = bradleyTerry(rows.map(toObservation));

  const perBucketCounts: Record<
    string,
    Map<string, { decided: number; games: number }>
  > = {};
  for (const bucket of BUCKET_KEYS) {
    perBucketCounts[bucket] = decidedByCandidate(bucketRows[bucket]);
  }

  const gated: EraRow[] = [];
  const belowGate: EraShortfall[] = [];

  for (const id of candidateIds) {
    const t = totals.get(id) ?? { decided: 0, games: 0 };
    if (t.decided < minDecided) {
      belowGate.push({ candidateId: id, decided: t.decided, games: t.games });
      continue;
    }
    const overallEntry = overall.candidates.find((c) => c.id === id);
    const cells: EraCell[] = BUCKET_KEYS.map((bucket) => {
      const fit = byBucket[bucket];
      const entry = fit.candidates.find((c) => c.id === id);
      const counts = perBucketCounts[bucket].get(id) ?? {
        decided: 0,
        games: 0,
      };
      return {
        bucket,
        strength: entry?.strength ?? null,
        ciLow: entry?.ciLow ?? null,
        ciHigh: entry?.ciHigh ?? null,
        rank: entry?.rank ?? null,
        games: counts.games,
        decided: counts.decided,
        distinguishable: fit.distinguishable,
      };
    });
    gated.push({
      candidateId: id,
      decided: t.decided,
      games: t.games,
      cells,
      overall: {
        strength: overallEntry?.strength ?? null,
        ciLow: overallEntry?.ciLow ?? null,
        ciHigh: overallEntry?.ciHigh ?? null,
        rank: overallEntry?.rank ?? null,
        games: t.games,
        decided: t.decided,
        distinguishable: overall.distinguishable,
      },
    });
  }

  // Rows by overall rank (nulls last); shortfalls by how close they are.
  gated.sort(
    (a, b) =>
      (a.overall.rank ?? Infinity) - (b.overall.rank ?? Infinity) ||
      a.candidateId.localeCompare(b.candidateId),
  );
  belowGate.sort(
    (a, b) =>
      b.decided - a.decided ||
      b.games - a.games ||
      a.candidateId.localeCompare(b.candidateId),
  );

  const bucketsWithVotes = BUCKET_KEYS.filter(
    (b) => bucketRows[b].length > 0,
  ) as string[];
  const bucketsWithoutVotes = BUCKET_KEYS.filter(
    (b) => bucketRows[b].length === 0,
  ) as string[];

  const windowStart =
    era === "all_time" ? null : pivotAt === null ? null : pivotAt.toISOString();

  return {
    era,
    windowStart,
    comparisons: rows.length,
    decided,
    ties,
    bothInadequate,
    minDecided,
    rows: gated,
    belowGate,
    bucketsWithVotes,
    bucketsWithoutVotes,
    overallDistinguishable: overall.distinguishable,
  };
}

/** The two windows' counts, plus the remainder before the pivot. The
 * before-pivot numbers are a subtraction rather than a second pass, so the
 * three sets always reconcile: before + since = all. */
export interface EraSplit {
  sinceComparisons: number;
  sinceDecided: number;
  beforeComparisons: number;
  beforeDecided: number;
  allComparisons: number;
  allDecided: number;
}

export function eraSplit(allTime: EraSlice, sincePivot: EraSlice): EraSplit {
  return {
    sinceComparisons: sincePivot.comparisons,
    sinceDecided: sincePivot.decided,
    beforeComparisons: Math.max(
      0,
      allTime.comparisons - sincePivot.comparisons,
    ),
    beforeDecided: Math.max(0, allTime.decided - sincePivot.decided),
    allComparisons: allTime.comparisons,
    allDecided: allTime.decided,
  };
}
