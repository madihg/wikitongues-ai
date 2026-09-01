import type { PrismaClient } from "@prisma/client";

/**
 * Live insights for "The Speakers' Verdict" - the annotation view that makes
 * the blind-comparison evidence legible to a non-ML human: who wins when
 * speakers pick a side, why the losing answers lose, and how often BOTH
 * answers are still inadequate.
 *
 * Same house rules as src/lib/method-metrics.ts: every number is computed
 * from the database AT REQUEST TIME (no cached scores, no hardcoded counts),
 * demo rows are excluded in the WHERE clause, and @test.com seed accounts are
 * excluded the same way and for the same reason as /api/public/stats - a
 * bring-up test login is not a speaker.
 *
 * Prisma is injected so the whole thing is unit-testable with a recorder
 * fake - the same pattern as computeMethodMetrics.
 */

// ─── shapes ─────────────────────────────────────────────────────────────────

/** One comparison, flattened to what the aggregations need. */
export interface ComparisonRow {
  winner: string; // "a" | "b" | "tie" | "both_inadequate"
  failureTagsA: string[];
  failureTagsB: string[];
  createdAt: Date;
  /** Candidate names; null when the output predates the candidate registry. */
  aName: string | null;
  bName: string | null;
  aInPool: boolean;
  bInPool: boolean;
  /** Whether each side's candidate carries the community's material - any
   * kind other than an untouched baseline. */
  aCommunityTaught: boolean;
  bCommunityTaught: boolean;
}

/**
 * The data behind the plain-language headline sentence. The "leader" is the
 * pool arm with the most decided wins - computed, never a hardcoded name.
 */
export interface VerdictHeadline {
  /** Comparisons where BOTH sides are current pairing-pool arms. */
  poolComparisons: number;
  /** Pool comparisons where a winner was actually picked ("a" or "b"). */
  poolDecided: number;
  poolTies: number;
  poolBothInadequate: number;
  leaderName: string | null;
  leaderWins: number;
  /** True when the leader is anything but an untouched baseline - i.e. it
   * was taught with the community's material (retrieval or fine-tune). */
  leaderCommunityTaught: boolean;
  runnerUpName: string | null;
  runnerUpWins: number;
}

/** Win split for one unordered candidate pairing, winner-side first. */
export interface PairingSummary {
  aName: string;
  bName: string;
  aWins: number;
  bWins: number;
  ties: number;
  bothInadequate: number;
  decided: number;
  total: number;
  /** Both arms are in the current pairing pool - featured first. */
  isCurrentPool: boolean;
}

export interface TagCount {
  key: string;
  count: number;
}

/** One weekly bucket of the both-inadequate rate. Gap weeks between the
 * first and last observed week are filled with total 0 so the time axis
 * never silently compresses a quiet stretch. */
export interface WeeklyInadequacy {
  /** ISO date of the UTC Monday starting the week. */
  weekStart: string;
  total: number;
  bothInadequate: number;
}

/**
 * The two comparison counts a reader meets on the arena Overview, reconciled.
 *
 * "pool" is every matchup between two arms that are in the pairing pool right
 * now; "legacy" is the remainder, where at least one side is an arm the
 * project has since retired. all = pool + legacy, always.
 *
 * The split is defined by the live inPairingPool flag rather than by a
 * cutover date, so it keeps telling the truth as the pool changes. It exists
 * because the all-time number and the pool number look contradictory side by
 * side, and the difference between their decided rates is the whole story:
 * the retired era is most of the input and almost none of the signal.
 */
export interface CorpusSplit {
  allComparisons: number;
  allDecided: number;
  allBothInadequate: number;
  poolComparisons: number;
  poolDecided: number;
  poolBothInadequate: number;
  legacyComparisons: number;
  legacyDecided: number;
  legacyBothInadequate: number;
}

/** One recent decided comparison, ready to render. No annotator identity is
 * ever carried here - the UI attributes every verdict to "a speaker". */
export interface RecentDecision {
  promptText: string;
  winnerName: string;
  loserName: string;
  winnerOutput: string;
  loserOutput: string;
  explanation: string;
  /** Failure-tag KEYS on the losing side; the UI maps them to labels. */
  loserTags: string[];
  createdAt: string;
}

export interface AnnotationInsights {
  computedAt: string;
  headline: VerdictHeadline;
  /** All-time versus current-pool comparison counts, reconciled. */
  corpus: CorpusSplit;
  pairings: PairingSummary[];
  /** Failure tags of the LOSING side across decided comparisons. */
  losingTags: TagCount[];
  /** Failure tags (both sides) on both-inadequate verdicts. */
  bothInadequateTags: TagCount[];
  weekly: WeeklyInadequacy[];
  recent: RecentDecision[];
}

// ─── pure helpers (exported for tests) ──────────────────────────────────────

const DECIDED = new Set(["a", "b"]);

/**
 * Leader-by-wins over the pool-arm comparisons. Wins are counted per
 * candidate NAME, and the leader is whoever has the most - ties broken by
 * name so the result is deterministic.
 */
export function poolHeadline(rows: ComparisonRow[]): VerdictHeadline {
  const pool = rows.filter((r) => r.aInPool && r.bInPool);
  const wins = new Map<string, number>();
  const taught = new Map<string, boolean>();
  let decided = 0;
  let ties = 0;
  let bothInadequate = 0;
  for (const r of pool) {
    if (r.winner === "tie") ties++;
    else if (r.winner === "both_inadequate") bothInadequate++;
    else if (DECIDED.has(r.winner)) {
      decided++;
      const name = r.winner === "a" ? r.aName : r.bName;
      const communityTaught =
        r.winner === "a" ? r.aCommunityTaught : r.bCommunityTaught;
      if (name !== null) {
        wins.set(name, (wins.get(name) ?? 0) + 1);
        taught.set(name, communityTaught);
      }
    }
  }
  const ranked = [...wins.entries()].sort(
    (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
  );
  const leader = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  return {
    poolComparisons: pool.length,
    poolDecided: decided,
    poolTies: ties,
    poolBothInadequate: bothInadequate,
    leaderName: leader ? leader[0] : null,
    leaderWins: leader ? leader[1] : 0,
    leaderCommunityTaught: leader ? (taught.get(leader[0]) ?? false) : false,
    runnerUpName: runnerUp ? runnerUp[0] : null,
    runnerUpWins: runnerUp ? runnerUp[1] : 0,
  };
}

/**
 * Split every comparison into the current-pool matchups and the legacy
 * remainder, counting decided winners and both-inadequate verdicts in each.
 * Pure counting, no thresholds: the caller decides what is worth saying.
 */
export function corpusSplit(rows: ComparisonRow[]): CorpusSplit {
  const split: CorpusSplit = {
    allComparisons: 0,
    allDecided: 0,
    allBothInadequate: 0,
    poolComparisons: 0,
    poolDecided: 0,
    poolBothInadequate: 0,
    legacyComparisons: 0,
    legacyDecided: 0,
    legacyBothInadequate: 0,
  };
  for (const r of rows) {
    const inPool = r.aInPool && r.bInPool;
    const decided = DECIDED.has(r.winner);
    const both = r.winner === "both_inadequate";
    split.allComparisons++;
    if (decided) split.allDecided++;
    if (both) split.allBothInadequate++;
    if (inPool) {
      split.poolComparisons++;
      if (decided) split.poolDecided++;
      if (both) split.poolBothInadequate++;
    } else {
      split.legacyComparisons++;
      if (decided) split.legacyDecided++;
      if (both) split.legacyBothInadequate++;
    }
  }
  return split;
}

/** Minimum decided comparisons before a pairing is worth a bar. Exported so
 * the UI copy quoting the threshold can never drift from the computation. */
export const MIN_DECIDED_PER_PAIRING = 5;

/**
 * Aggregate every unordered candidate pairing that reached `minDecided`
 * decided comparisons. The current pool pairing is featured first, then by
 * volume; within a pairing the side with more wins renders first.
 */
export function pairingSummaries(
  rows: ComparisonRow[],
  minDecided = MIN_DECIDED_PER_PAIRING,
): PairingSummary[] {
  interface Acc {
    names: [string, string]; // sorted
    wins: [number, number];
    ties: number;
    bothInadequate: number;
    isCurrentPool: boolean;
  }
  const byPair = new Map<string, Acc>();
  for (const r of rows) {
    if (r.aName === null || r.bName === null) continue;
    if (r.aName === r.bName) continue; // self-pairing carries no verdict
    const names: [string, string] =
      r.aName < r.bName ? [r.aName, r.bName] : [r.bName, r.aName];
    const key = `${names[0]}::${names[1]}`;
    const acc = byPair.get(key) ?? {
      names,
      wins: [0, 0] as [number, number],
      ties: 0,
      bothInadequate: 0,
      isCurrentPool: r.aInPool && r.bInPool,
    };
    // Pool membership is a property of the candidates, so any row agrees;
    // still OR it so a single stale join row cannot unmark the pool pairing.
    acc.isCurrentPool = acc.isCurrentPool || (r.aInPool && r.bInPool);
    if (r.winner === "tie") acc.ties++;
    else if (r.winner === "both_inadequate") acc.bothInadequate++;
    else if (DECIDED.has(r.winner)) {
      const winnerName = r.winner === "a" ? r.aName : r.bName;
      acc.wins[winnerName === acc.names[0] ? 0 : 1]++;
    }
    byPair.set(key, acc);
  }
  return [...byPair.values()]
    .map((acc) => {
      const decided = acc.wins[0] + acc.wins[1];
      const total = decided + acc.ties + acc.bothInadequate;
      // Winner-side first, ties broken by name for determinism.
      const flip = acc.wins[1] > acc.wins[0];
      return {
        aName: flip ? acc.names[1] : acc.names[0],
        bName: flip ? acc.names[0] : acc.names[1],
        aWins: flip ? acc.wins[1] : acc.wins[0],
        bWins: flip ? acc.wins[0] : acc.wins[1],
        ties: acc.ties,
        bothInadequate: acc.bothInadequate,
        decided,
        total,
        isCurrentPool: acc.isCurrentPool,
      };
    })
    .filter((p) => p.decided >= minDecided)
    .sort(
      (x, y) =>
        Number(y.isCurrentPool) - Number(x.isCurrentPool) ||
        y.total - x.total ||
        x.aName.localeCompare(y.aName),
    );
}

function countTags(into: Map<string, number>, tags: string[]) {
  for (const t of tags) into.set(t, (into.get(t) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>): TagCount[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
}

/** Failure tags of the LOSING side across decided comparisons: the winner
 * "a" means side B lost, so its tags are the diagnosis - and vice versa. */
export function losingTagCounts(rows: ComparisonRow[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.winner === "a") countTags(counts, r.failureTagsB);
    else if (r.winner === "b") countTags(counts, r.failureTagsA);
  }
  return sortedCounts(counts);
}

/** Failure tags on both sides of both-inadequate verdicts, kept separate
 * from the losing-side chart: "both failed" is a different story from
 * "one was preferred". */
export function bothInadequateTagCounts(rows: ComparisonRow[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.winner !== "both_inadequate") continue;
    countTags(counts, r.failureTagsA);
    countTags(counts, r.failureTagsB);
  }
  return sortedCounts(counts);
}

/** ISO date (yyyy-mm-dd) of the UTC Monday starting the given date's week. */
export function weekStartUtc(d: Date): string {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      daysSinceMonday * 86_400_000,
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Weekly both-inadequate buckets over ALL comparisons, oldest first, with
 * gap weeks filled at total 0. Over-time is the one chart where the early,
 * weaker arms belong IN the denominator: the story is precisely that the
 * rate fell as the systems improved.
 */
export function weeklyInadequacy(rows: ComparisonRow[]): WeeklyInadequacy[] {
  if (rows.length === 0) return [];
  const byWeek = new Map<string, { total: number; bothInadequate: number }>();
  for (const r of rows) {
    const wk = weekStartUtc(r.createdAt);
    const acc = byWeek.get(wk) ?? { total: 0, bothInadequate: 0 };
    acc.total++;
    if (r.winner === "both_inadequate") acc.bothInadequate++;
    byWeek.set(wk, acc);
  }
  const weeks = [...byWeek.keys()].sort();
  const out: WeeklyInadequacy[] = [];
  let cursor = weeks[0];
  const last = weeks[weeks.length - 1];
  while (cursor <= last) {
    const acc = byWeek.get(cursor) ?? { total: 0, bothInadequate: 0 };
    out.push({ weekStart: cursor, ...acc });
    cursor = new Date(
      new Date(`${cursor}T00:00:00Z`).getTime() + 7 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
  }
  return out;
}

// ─── the computation ────────────────────────────────────────────────────────

/** Same seed-account exclusion, same reason, as /api/public/stats and
 * computeMethodMetrics: a bring-up test login is not a speaker. */
const SEED_ACCOUNT_EMAIL_SUFFIX = "@test.com";

interface RawComparison {
  winner: string;
  failureTagsA: string[];
  failureTagsB: string[];
  explanation: string;
  createdAt: Date;
  promptId: string;
  modelOutputA: {
    outputText: string;
    model: string;
    candidateModel: {
      name: string;
      kind: string;
      inPairingPool: boolean;
    } | null;
  };
  modelOutputB: {
    outputText: string;
    model: string;
    candidateModel: {
      name: string;
      kind: string;
      inPairingPool: boolean;
    } | null;
  };
}

function toRow(c: RawComparison): ComparisonRow {
  return {
    winner: c.winner,
    failureTagsA: c.failureTagsA,
    failureTagsB: c.failureTagsB,
    createdAt: c.createdAt,
    aName: c.modelOutputA.candidateModel?.name ?? null,
    bName: c.modelOutputB.candidateModel?.name ?? null,
    aInPool: c.modelOutputA.candidateModel?.inPairingPool ?? false,
    bInPool: c.modelOutputB.candidateModel?.inPairingPool ?? false,
    aCommunityTaught: isCommunityTaught(c.modelOutputA.candidateModel?.kind),
    bCommunityTaught: isCommunityTaught(c.modelOutputB.candidateModel?.kind),
  };
}

/** Every kind except an untouched baseline carries the community's material -
 * retrieval serves it, fine-tunes are trained on it. */
export function isCommunityTaught(kind: string | undefined): boolean {
  return kind !== undefined && kind !== "baseline";
}

export async function computeAnnotationInsights(
  prisma: PrismaClient,
): Promise<AnnotationInsights> {
  // One read of every real comparison; all aggregation is pure JS below.
  // Well under a few thousand rows - same cost posture as computeMethodMetrics.
  const comparisons = (await prisma.pairwiseComparison.findMany({
    where: {
      isDemo: false,
      annotator: {
        email: { not: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      winner: true,
      failureTagsA: true,
      failureTagsB: true,
      explanation: true,
      createdAt: true,
      promptId: true,
      modelOutputA: {
        select: {
          outputText: true,
          model: true,
          candidateModel: {
            select: { name: true, kind: true, inPairingPool: true },
          },
        },
      },
      modelOutputB: {
        select: {
          outputText: true,
          model: true,
          candidateModel: {
            select: { name: true, kind: true, inPairingPool: true },
          },
        },
      },
    },
  })) as unknown as RawComparison[];

  const rows = comparisons.map(toRow);

  // ── recent decided examples ───────────────────────────────────────────────
  const decided = comparisons.filter((c) => DECIDED.has(c.winner));
  const lastFive = decided.slice(-5).reverse(); // newest first
  const promptIds = [...new Set(lastFive.map((c) => c.promptId))];
  const prompts =
    promptIds.length > 0
      ? await prisma.prompt.findMany({
          where: { id: { in: promptIds } },
          select: { id: true, text: true },
        })
      : [];
  const promptText = new Map(prompts.map((p) => [p.id, p.text]));

  const recent: RecentDecision[] = lastFive.map((c) => {
    const aWon = c.winner === "a";
    const winnerOut = aWon ? c.modelOutputA : c.modelOutputB;
    const loserOut = aWon ? c.modelOutputB : c.modelOutputA;
    return {
      promptText: promptText.get(c.promptId) ?? "",
      winnerName: winnerOut.candidateModel?.name ?? winnerOut.model,
      loserName: loserOut.candidateModel?.name ?? loserOut.model,
      winnerOutput: winnerOut.outputText,
      loserOutput: loserOut.outputText,
      explanation: c.explanation,
      loserTags: aWon ? c.failureTagsB : c.failureTagsA,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return {
    computedAt: new Date().toISOString(),
    headline: poolHeadline(rows),
    corpus: corpusSplit(rows),
    pairings: pairingSummaries(rows),
    losingTags: losingTagCounts(rows),
    bothInadequateTags: bothInadequateTagCounts(rows),
    weekly: weeklyInadequacy(rows),
    recent,
  };
}
