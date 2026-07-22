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

/** A prompt as seen by the queue: its public id and how many outputs it has. */
export interface QueuePrompt {
  /** Public promptId string (e.g. ig_orth_001), not the Prompt.id cuid. */
  promptId: string;
  /** Number of model outputs, counted in the deterministic serving order. */
  outputCount: number;
}

export interface QueueState {
  /** Prompts with >= 2 outputs - eligible to be assigned a pair at all. */
  total: number;
  /** Of the eligible prompts, how many this annotator has any comparison for. */
  completed: number;
  /**
   * Eligible prompts this annotator has neither completed nor skipped, in
   * the same order they were passed in. This is exactly what /next walks to
   * find the next task, and its length is exactly what /summary reports as
   * "Queue Remaining" - computing both from this one function is what keeps
   * the two routes from drifting apart.
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
 */
export function computeQueueState(
  prompts: QueuePrompt[],
  donePromptIds: ReadonlySet<string>,
  skippedPromptIds: ReadonlySet<string>,
): QueueState {
  const eligible = prompts.filter((p) => p.outputCount >= 2);
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
  return { total: eligible.length, completed, remaining };
}
