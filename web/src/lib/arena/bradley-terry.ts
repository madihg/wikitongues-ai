/**
 * Bradley-Terry ranking from pairwise comparisons, with bootstrap confidence
 * intervals. This is the per-bucket ranking backbone for the arena (the
 * LMArena/LMSYS standard: order-invariant, tighter CIs than online Elo).
 *
 * Honest at low sample sizes: when the top candidates' CIs overlap we report
 * `distinguishable: false` rather than inventing a winner.
 */

export interface PairwiseObservation {
  a: string; // candidate id shown as A
  b: string; // candidate id shown as B
  winner: "a" | "b" | "tie";
}

export interface CandidateStrength {
  id: string;
  /** Latent BT strength, scaled to a ~0-100 "arena score" for display. */
  strength: number;
  /** Normalized win probability mass (sums to 1 across candidates). */
  prob: number;
  ciLow: number;
  ciHigh: number;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  games: number;
}

export interface BradleyTerryResult {
  candidates: CandidateStrength[];
  /** False when the top two candidates' CIs overlap (or too little data). */
  distinguishable: boolean;
  nObservations: number;
  nCandidates: number;
}

interface FitOptions {
  bootstrapSamples?: number; // default 1000
  maxIterations?: number; // MM iterations, default 200
  tolerance?: number; // convergence, default 1e-9
  minObservations?: number; // below this -> not distinguishable, default 8
}

/**
 * Fit BT latent abilities via the Minorization-Maximization algorithm
 * (Hunter 2004). Returns probability-scale strengths that sum to 1.
 */
function fitOnce(
  ids: string[],
  obs: PairwiseObservation[],
  maxIterations: number,
  tolerance: number,
): Record<string, number> {
  const idx: Record<string, number> = {};
  ids.forEach((id, i) => (idx[id] = i));
  const n = ids.length;

  // wins[i] counts a tie as half a win to each side.
  const wins = new Array(n).fill(0);
  // pair counts: comparisons[i][j] = number of games between i and j.
  const comparisons: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  );

  for (const o of obs) {
    const i = idx[o.a];
    const j = idx[o.b];
    if (i === undefined || j === undefined || i === j) continue;
    comparisons[i][j] += 1;
    comparisons[j][i] += 1;
    if (o.winner === "a") wins[i] += 1;
    else if (o.winner === "b") wins[j] += 1;
    else {
      wins[i] += 0.5;
      wins[j] += 0.5;
    }
  }

  // Start uniform. Add a tiny smoothing win so isolated candidates don't blow up.
  let p = new Array(n).fill(1 / n);
  const smoothedWins = wins.map((w) => w + 1e-3);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nij = comparisons[i][j];
        if (nij === 0) continue;
        denom += nij / (p[i] + p[j]);
      }
      next[i] = denom > 0 ? smoothedWins[i] / denom : p[i];
    }
    const sum = next.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < n; i++) next[i] /= sum;

    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i] - p[i]);
    p = next;
    if (delta < tolerance) break;
  }

  const out: Record<string, number> = {};
  ids.forEach((id, i) => (out[id] = p[i]));
  return out;
}

/** Scale probability-mass strengths to a friendly 0-100 display range. */
function toDisplayScore(prob: number, n: number): number {
  // 1/n is "average". Map log-odds vs average onto ~[0,100] centered at 50.
  const avg = 1 / n;
  const ratio = prob / avg;
  const logit = Math.log(Math.max(ratio, 1e-6));
  return Math.max(0, Math.min(100, 50 + logit * 12));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bradleyTerry(
  observations: PairwiseObservation[],
  options: FitOptions = {},
): BradleyTerryResult {
  const {
    bootstrapSamples = 1000,
    maxIterations = 200,
    tolerance = 1e-9,
    minObservations = 8,
  } = options;

  const idSet = new Set<string>();
  for (const o of observations) {
    idSet.add(o.a);
    idSet.add(o.b);
  }
  const ids = Array.from(idSet);
  const n = ids.length;

  // tally raw records
  const wins: Record<string, number> = {};
  const losses: Record<string, number> = {};
  const ties: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const id of ids) {
    wins[id] = losses[id] = ties[id] = games[id] = 0;
  }
  for (const o of observations) {
    games[o.a]++;
    games[o.b]++;
    if (o.winner === "tie") {
      ties[o.a]++;
      ties[o.b]++;
    } else if (o.winner === "a") {
      wins[o.a]++;
      losses[o.b]++;
    } else {
      wins[o.b]++;
      losses[o.a]++;
    }
  }

  if (n === 0) {
    return {
      candidates: [],
      distinguishable: false,
      nObservations: 0,
      nCandidates: 0,
    };
  }

  const point = fitOnce(ids, observations, maxIterations, tolerance);

  // Bootstrap CIs over observations (resample with replacement).
  const samples: Record<string, number[]> = {};
  for (const id of ids) samples[id] = [];
  const rand = mulberry32(0x5eed ^ observations.length ^ n);
  const m = observations.length;
  const doBootstrap = m >= minObservations && bootstrapSamples > 0;
  if (doBootstrap) {
    for (let b = 0; b < bootstrapSamples; b++) {
      const resample: PairwiseObservation[] = new Array(m);
      for (let k = 0; k < m; k++) {
        resample[k] = observations[Math.floor(rand() * m)];
      }
      const fit = fitOnce(ids, resample, maxIterations, tolerance);
      for (const id of ids) samples[id].push(fit[id] ?? 0);
    }
  }

  const percentile = (arr: number[], q: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = q * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  const candidates: CandidateStrength[] = ids.map((id) => {
    const prob = point[id];
    const ciLowProb = doBootstrap ? percentile(samples[id], 0.025) : prob;
    const ciHighProb = doBootstrap ? percentile(samples[id], 0.975) : prob;
    return {
      id,
      strength: toDisplayScore(prob, n),
      prob,
      ciLow: toDisplayScore(ciLowProb, n),
      ciHigh: toDisplayScore(ciHighProb, n),
      rank: 0,
      wins: wins[id],
      losses: losses[id],
      ties: ties[id],
      games: games[id],
    };
  });

  candidates.sort((a, b) => b.prob - a.prob);
  candidates.forEach((c, i) => (c.rank = i + 1));

  // Distinguishable if we have enough data AND the top two CIs don't overlap.
  let distinguishable = false;
  if (m >= minObservations && candidates.length >= 2) {
    const top = candidates[0];
    const second = candidates[1];
    distinguishable = top.ciLow > second.ciHigh;
  } else if (candidates.length === 1) {
    distinguishable = false;
  }

  return {
    candidates,
    distinguishable,
    nObservations: m,
    nCandidates: n,
  };
}
