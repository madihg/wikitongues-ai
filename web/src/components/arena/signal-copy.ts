/**
 * Turning the arena's raw vote counts into the sentence the leaderboard
 * explainer says out loud. Pure formatting, no statistics: whether the table
 * can rank anything is decided upstream by the Bradley-Terry fit
 * (`distinguishable`), never by a threshold invented here.
 */

/** Live counts behind the leaderboard, as returned by /api/arena/leaderboard. */
export interface ArenaSignal {
  /** Non-demo comparisons that map to two different arena candidates. */
  comparisons: number;
  /** Comparisons where a human picked a side ("a" or "b"). */
  decided: number;
  /** Comparisons called an explicit tie. */
  ties: number;
  /** Comparisons where the annotator rejected both answers. */
  bothInadequate: number;
  /** Size of the frozen benchmark whose gold never enters training. */
  heldOutPrompts: number;
}

/** "0.6%" below ten percent, "64%" above it, "0%" when there is nothing yet. */
export function share(count: number, total: number): string {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0)
    return "0%";
  const p = (count / total) * 100;
  if (p === 0) return "0%";
  return p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

export interface SignalCopy {
  /** e.g. "781" */
  comparisons: string;
  /** e.g. "5" */
  decided: string;
  /** e.g. "0.6%" */
  decidedShare: string;
  /** e.g. "775" */
  bothInadequate: string;
  /** e.g. "99%" */
  bothInadequateShare: string;
  /** e.g. "1" */
  ties: string;
  /** e.g. "43" */
  heldOutPrompts: string;
  /**
   * "absence" when the fit cannot separate any two candidates, so every cell is
   * reporting missing evidence rather than a genuine dead heat. "ranking" once
   * the fit does separate them.
   */
  verdict: "absence" | "ranking";
}

export function describeArenaSignal(
  signal: ArenaSignal,
  distinguishable: boolean,
): SignalCopy {
  const total = Math.max(0, signal.comparisons);
  return {
    comparisons: total.toLocaleString(),
    decided: Math.max(0, signal.decided).toLocaleString(),
    decidedShare: share(signal.decided, total),
    bothInadequate: Math.max(0, signal.bothInadequate).toLocaleString(),
    bothInadequateShare: share(signal.bothInadequate, total),
    ties: Math.max(0, signal.ties).toLocaleString(),
    heldOutPrompts: Math.max(0, signal.heldOutPrompts).toLocaleString(),
    verdict: distinguishable ? "ranking" : "absence",
  };
}
