/**
 * Annotation queue assignment.
 *
 * Each annotator sees each prompt AT MOST ONCE. Different annotators are
 * assigned DIFFERENT model pairs for the same prompt, so across the whole
 * team every C(n,2) pair combination gets covered, and as an annotator
 * moves through their queue they encounter every model at least once.
 *
 * The assignment is a pure function of (annotatorId, promptId, nOutputs) -
 * no state, no DB round trip needed to know which pair a given annotator
 * would get for a given prompt. /next and /summary both call it fresh, so
 * a queue can be recomputed at any point (e.g. after outputs are
 * regenerated and output order shifts) without the two routes drifting
 * apart from each other.
 *
 * ─── THE 2026-08-20 PIVOT (tasks/annotation-pivot-decision.md) ────────────
 *
 * Pairwise episodes are now drawn only from a PAIRING POOL of strong arms
 * (CandidateModel.inPairingPool, a DB flag - never a hardcoded slug list).
 * When the pool is active:
 *
 *   - Only pool-arm outputs are pairing-eligible (`pairingEligibleOutputs`).
 *     Without this filter, assignedPair would dilute strong pairs across
 *     C(n,2) combinations that include the old weak outputs - the exact
 *     wall (99.3% both_inadequate) the pivot is escaping.
 *   - Held-out (frozen benchmark) prompts leave the pairwise queue: the
 *     frozen 43 stay cold-authored only, forever.
 *   - The queue is LANE-ORDERED (`computeQueueState`):
 *       1. zero-gold prompts first - one episode there mints first gold
 *          (cold) AND a strong-pair preference AND a correction, the
 *          maximum-yield episode;
 *       2. then a deterministic 2:1 interleave of strong-pair prompts
 *          (gold coverage exists, cold-first optional) against long-form
 *          cold-mandatory prompts - which lands the strong-pair lane at
 *          ~60-70% of episodes and the cold lane at ~30-40%, the decided
 *          weighting.
 *   - Whether an episode asks for a cold answer FIRST is `goldFirstFor`:
 *     mandatory on zero-gold and long-form prompts, optional (skipped) once
 *     a prompt has >= 2 gold answers, and the per-bucket default in between.
 *
 * When the pool is empty (pre-pivot state), every behaviour above degrades
 * to the old scheme: all outputs pairable, input order preserved, bucket
 * default for goldFirst.
 */

/** All index pairs (i<j) over n outputs, in canonical order. */
function allPairs(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push([i, j]);
    }
  }
  return pairs;
}

/**
 * FNV-1a 32-bit hash of a string, returned as an unsigned 32-bit integer.
 * Small, dependency-free, and stable across processes/runs - exactly what a
 * deterministic-but-well-mixed assignment index needs. Not a security hash,
 * just a spreader.
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // hash = hash * 0x01000193 (FNV prime), via shifts so it stays a 32-bit int
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0; // unsigned
}

/**
 * The one model pair this annotator is assigned for this prompt, or null
 * when the prompt doesn't have enough outputs to form a pair.
 *
 * Deterministic: the same (annotatorId, promptId, nOutputs) always yields
 * the same pair, so re-deriving it (e.g. after a page refresh, or after
 * outputs are deleted/regenerated and nOutputs changes) is always safe and
 * never crashes - it just may pick a different pair than before.
 *
 * Which pair a given annotator lands on is chosen by hashing their id
 * together with the prompt id and reducing mod the pair count. Different
 * annotators hash to different indices for the same prompt, which is what
 * spreads C(n,2) coverage of a prompt across the whole team instead of
 * everyone doing the same comparison.
 *
 * Since the pivot, nOutputs is the count of PAIRING-ELIGIBLE outputs (pool
 * arms only when a pool is active) and the returned indices address that
 * filtered, deterministically ordered list.
 */
export function assignedPair(
  annotatorId: string,
  promptId: string,
  nOutputs: number,
): [number, number] | null {
  if (nOutputs < 2) return null;
  const pairs = allPairs(nOutputs);
  const index = fnv1a32(`${annotatorId}:${promptId}`) % pairs.length;
  return pairs[index];
}

/**
 * Filter a prompt's outputs down to the pairing-eligible ones. Pure and
 * shared: /next and /summary both feed computeQueueState through this, so
 * the two routes cannot drift on WHICH outputs count toward a pair.
 *
 * poolActive=false (no pool arms registered) keeps the pre-pivot behaviour:
 * every output is pairable.
 */
export function pairingEligibleOutputs<T extends { inPool: boolean }>(
  outputs: T[],
  poolActive: boolean,
): T[] {
  return poolActive ? outputs.filter((o) => o.inPool) : outputs;
}

/** A prompt as seen by the queue: its public id and how many outputs it has. */
export interface QueuePrompt {
  /** Public promptId string (e.g. ig_orth_001), not the Prompt.id cuid. */
  promptId: string;
  /**
   * Number of PAIRING-ELIGIBLE model outputs (pool-filtered when the pool is
   * active), counted in the deterministic serving order.
   */
  outputCount: number;
  /**
   * Lane metadata (pivot). Optional: when absent the prompt is treated as a
   * plain pre-pivot queue entry (no lane ordering, no holdout exclusion).
   */
  /** Non-demo cold gold answers this prompt already has. */
  goldCount?: number;
  /** Long-form prompt (provenance carries "longform"): cold stays mandatory. */
  isLongForm?: boolean;
  /** Frozen-benchmark prompt: cold-only forever, never pairwise-served. */
  isHoldout?: boolean;
}

export type QueueLane = "both" | "strong_pair" | "cold_mandatory";

/**
 * Which lane a prompt belongs to.
 *   - "both": zero-gold - a single episode feeds the cold lane AND the
 *     strong-pair lane. Served first.
 *   - "cold_mandatory": long-form - post-editese bites hardest exactly where
 *     the corpus gap is, so cold-first stays mandatory regardless of coverage.
 *   - "strong_pair": everything else - coverage exists, comparison is the
 *     main event.
 */
export function laneFor(p: {
  goldCount?: number;
  isLongForm?: boolean;
}): QueueLane {
  if ((p.goldCount ?? 0) === 0) return "both";
  if (p.isLongForm) return "cold_mandatory";
  return "strong_pair";
}

/**
 * Whether the episode must ask for the annotator's own (cold, source-free)
 * answer BEFORE any model output is revealed.
 *
 *   - zero-gold or long-form -> always (the cold lane's mandate);
 *   - >= 2 gold answers -> never (the corpus already covers the prompt; the
 *     reclaimed minutes go to the edit step);
 *   - exactly 1 gold -> the per-bucket default the caller passes in
 *     (isGoldFirstBucket, unchanged from the pre-pivot scheme).
 *
 * Kept pure: bucket policy lives in src/lib/buckets.ts and is passed in as a
 * boolean so this module needs no bucket knowledge.
 */
export function goldFirstFor(
  p: { goldCount?: number; isLongForm?: boolean },
  bucketDefault: boolean,
): boolean {
  if (p.isLongForm) return true;
  const gold = p.goldCount;
  if (gold === undefined) return bucketDefault; // no lane metadata: old scheme
  if (gold === 0) return true;
  if (gold >= 2) return false;
  return bucketDefault;
}

/**
 * Deterministic lane-weighted ordering of the remaining queue:
 * zero-gold ("both") prompts first, then strong-pair and cold-mandatory
 * prompts interleaved 2:1. Relative order within each lane is preserved
 * (stable), so the ordering is a pure function of the input - no randomness,
 * and /next and /summary agree call after call.
 */
export function orderQueueByLane(prompts: QueuePrompt[]): QueuePrompt[] {
  const both: QueuePrompt[] = [];
  const strong: QueuePrompt[] = [];
  const cold: QueuePrompt[] = [];
  for (const p of prompts) {
    const lane = laneFor(p);
    if (lane === "both") both.push(p);
    else if (lane === "cold_mandatory") cold.push(p);
    else strong.push(p);
  }
  const interleaved: QueuePrompt[] = [];
  let s = 0;
  let c = 0;
  while (s < strong.length || c < cold.length) {
    // 2 strong-pair episodes, then 1 cold-mandatory episode: ~67% / ~33%,
    // inside the decided 60-70% / 30-40% split.
    if (s < strong.length) interleaved.push(strong[s++]);
    if (s < strong.length) interleaved.push(strong[s++]);
    if (c < cold.length) interleaved.push(cold[c++]);
  }
  return [...both, ...interleaved];
}

export interface QueueState {
  /** Prompts with >= 2 pairing-eligible outputs - assignable at all. */
  total: number;
  /** Of the eligible prompts, how many this annotator has any comparison for. */
  completed: number;
  /**
   * Eligible prompts this annotator has neither completed nor skipped. When
   * lane metadata is present the list is lane-ordered (zero-gold first, then
   * the 2:1 strong/cold interleave); otherwise it keeps input order. This is
   * exactly what /next walks to find the next task, and its length is exactly
   * what /summary reports as "Queue Remaining" - computing both from this one
   * function is what keeps the two routes from drifting apart.
   */
  remaining: QueuePrompt[];
}

/**
 * Derive an annotator's queue state from the full prompt catalogue and their
 * history. A prompt is excluded from `remaining` once the annotator has
 * logged ANY non-demo comparison against it (covers history from the old
 * always-serve-first-2-pairs scheme, regardless of which pair was done) or
 * once they've skipped it - either way there is nothing left to serve them
 * for that prompt. Skipped prompts do not count toward `completed`: they
 * were never answered, just dismissed.
 *
 * Prompts flagged isHoldout are never eligible: the frozen bank is
 * cold-authored territory, not pairwise territory.
 */
export function computeQueueState(
  prompts: QueuePrompt[],
  donePromptIds: ReadonlySet<string>,
  skippedPromptIds: ReadonlySet<string>,
): QueueState {
  const eligible = prompts.filter((p) => p.outputCount >= 2 && !p.isHoldout);
  let completed = 0;
  const remaining: QueuePrompt[] = [];
  for (const prompt of eligible) {
    if (donePromptIds.has(prompt.promptId)) {
      completed++;
      continue;
    }
    if (skippedPromptIds.has(prompt.promptId)) continue;
    remaining.push(prompt);
  }
  const hasLaneMetadata = remaining.some((p) => p.goldCount !== undefined);
  return {
    total: eligible.length,
    completed,
    remaining: hasLaneMetadata ? orderQueueByLane(remaining) : remaining,
  };
}
