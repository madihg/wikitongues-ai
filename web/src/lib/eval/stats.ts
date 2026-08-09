/**
 * Uncertainty, not point estimates.
 *
 * Every aggregate this harness reports carries an n and a 95% interval, and
 * every comparison between two candidates has to survive its interval before we
 * are allowed to call it a difference. At n = 43 prompts, chrF differences under
 * roughly 5 points are routinely inside the noise; without an interval next to
 * them they would read as findings. They are not.
 *
 * Methods:
 *   - bootstrapMean: percentile bootstrap over the per-item scores (Efron 1979).
 *     Non-parametric, makes no normality assumption, and is the standard for MT
 *     metric reporting (Koehn 2004, "Statistical significance tests for machine
 *     translation evaluation").
 *   - pairedBootstrapDelta: PAIRED bootstrap - resample PROMPTS, not scores, and
 *     recompute both systems on the same resample. Prompt difficulty is the
 *     dominant variance component here (a 3-letter orthography prompt and a
 *     long-form culture prompt are not exchangeable), so pairing removes it and
 *     is far more powerful than comparing two independent intervals.
 *   - wilsonInterval: interval for a PROPORTION (agreement rates, match rates).
 *     Wilson (1927) rather than normal-approximation, because at n = 5 the
 *     normal interval is nonsense and can leave [0, 1].
 *
 * All randomness is seeded, so a report is reproducible byte-for-byte.
 */

export interface Interval {
  /** Point estimate. */
  mean: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  /** True when n was too small to bootstrap at all (interval is degenerate). */
  underpowered: boolean;
}

export const MIN_BOOTSTRAP_N = 5;
const DEFAULT_SAMPLES = 2000;

/** Deterministic PRNG (mulberry32) so every reported interval is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface BootstrapOptions {
  samples?: number;
  seed?: number;
  /** Two-sided alpha. Default 0.05 -> a 95% interval. */
  alpha?: number;
}

/** Percentile-bootstrap 95% CI for the mean of `xs`. */
export function bootstrapMean(
  xs: number[],
  options: BootstrapOptions = {},
): Interval {
  const { samples = DEFAULT_SAMPLES, seed = 0x5eed, alpha = 0.05 } = options;
  const n = xs.length;
  const point = mean(xs);
  if (n < MIN_BOOTSTRAP_N) {
    // Refuse to fabricate an interval from almost nothing. Callers must render
    // this as "n too small" rather than as a tight estimate.
    return { mean: point, ciLow: point, ciHigh: point, n, underpowered: true };
  }
  const rand = mulberry32(seed ^ (n * 2654435761));
  const means: number[] = new Array(samples);
  for (let b = 0; b < samples; b++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += xs[Math.floor(rand() * n)];
    means[b] = sum / n;
  }
  means.sort((a, b) => a - b);
  return {
    mean: point,
    ciLow: percentile(means, alpha / 2),
    ciHigh: percentile(means, 1 - alpha / 2),
    n,
    underpowered: false,
  };
}

export interface DeltaResult extends Interval {
  /** Mean of A. */
  meanA: number;
  /** Mean of B. */
  meanB: number;
  /**
   * True only when the 95% interval for (A - B) excludes 0 AND n is large
   * enough to have bootstrapped. False means "not distinguishable at this n" -
   * which is a result, not a missing value.
   */
  distinguishable: boolean;
}

/**
 * Paired bootstrap on the per-item difference a[i] - b[i]. Inputs must be
 * aligned item-for-item (same prompt, same order); mismatched lengths throw
 * rather than silently truncating, because a silent misalignment would produce
 * a confident wrong answer.
 */
export function pairedBootstrapDelta(
  a: number[],
  b: number[],
  options: BootstrapOptions = {},
): DeltaResult {
  if (a.length !== b.length) {
    throw new Error(
      `pairedBootstrapDelta: unaligned inputs (${a.length} vs ${b.length})`,
    );
  }
  const diffs = a.map((x, i) => x - b[i]);
  const interval = bootstrapMean(diffs, options);
  const distinguishable =
    !interval.underpowered &&
    ((interval.ciLow > 0 && interval.ciHigh > 0) ||
      (interval.ciLow < 0 && interval.ciHigh < 0));
  return {
    ...interval,
    meanA: mean(a),
    meanB: mean(b),
    distinguishable,
  };
}

/**
 * Wilson score interval for a binomial proportion. `successes` of `total`.
 * n = 0 returns the full [0, 1] interval and `underpowered: true`.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.959963984540054, // 95%
): Interval {
  if (total <= 0) {
    return { mean: 0, ciLow: 0, ciHigh: 1, n: 0, underpowered: true };
  }
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return {
    mean: p,
    ciLow: Math.max(0, centre - half),
    ciHigh: Math.min(1, centre + half),
    n: total,
    // A proportion measured on fewer than 30 trials cannot separate anything
    // useful; flag it so the UI can say so rather than printing a percentage.
    underpowered: total < 30,
  };
}

/**
 * Pearson correlation. Returns 0 for degenerate input (n < 2 or zero variance)
 * rather than NaN, and callers should check n before believing it.
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}
