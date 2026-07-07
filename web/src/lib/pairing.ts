/**
 * How many times a single prompt is shown to one annotator, as pairwise pairs.
 * The queue used to serve every C(n,2) pair, so a prompt with 3 model answers
 * came back 3 times — tedious and low-value. Capping at 2 keeps it short while
 * still covering all three models (see firstPairs).
 */
export const MAX_SHOWS_PER_PROMPT = 2;

/**
 * The first `max` index pairs (i<j) over `n` outputs, in output order.
 * Deterministic, so the same prompt always offers the same capped pairs.
 * With n=3, max=2 → [[0,1],[0,2]]: output 0 is compared with both others, so
 * all three models still appear. With n=2 → [[0,1]] (one comparison).
 */
export function firstPairs(n: number, max: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pairs.length >= max) return pairs;
      pairs.push([i, j]);
    }
  }
  return pairs;
}
