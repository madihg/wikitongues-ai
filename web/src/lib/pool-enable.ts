import {
  ALLOWED_PAIRINGS,
  assignedPair,
  pairingEligibleOutputs,
} from "@/lib/pairing";

/**
 * Pure checks behind an arm's enable script (scripts/enable-v45-pool.ts):
 * the whitelist names exactly the pairs decided for the arm, and a dry run
 * draws pairs the way /api/annotations/next will once the flag is set. Kept
 * here, not in the script, so vitest can hold them in place.
 */

/** An unordered pair as one key: the two slugs sorted, joined by "|". */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * What is wrong with the whitelist's entries for `slug`, against exactly the
 * `expected` pair keys: a missing pair, an extra pair, a duplicate entry, or
 * a pair of the slug with itself. Empty means the set is exact.
 */
export function whitelistProblemsFor(
  slug: string,
  expected: readonly string[],
  allowed: readonly (readonly [string, string])[] = ALLOWED_PAIRINGS,
): string[] {
  const problems: string[] = [];
  const keys = allowed
    .filter(([a, b]) => a === slug || b === slug)
    .map(([a, b]) => {
      if (a === b) problems.push(`self-pair ${a}|${b}`);
      return pairKey(a, b);
    });
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) problems.push(`duplicate ${k}`);
    seen.add(k);
  }
  const want = new Set(expected);
  for (const k of [...want].sort())
    if (!seen.has(k)) problems.push(`missing ${k}`);
  for (const k of [...seen].sort())
    if (!want.has(k)) problems.push(`extra ${k}`);
  return problems;
}

/**
 * The slug list /next would address for one prompt if `pool` were the pool:
 * the prompt's outputs, which the caller must pass in QUEUE_OUTPUT_ORDER
 * (src/lib/queue-input.ts; the order is the database's, so it is not
 * re-sorted here), filtered by pairingEligibleOutputs exactly as
 * loadQueueInputs filters them.
 */
export function servedSlugs(
  orderedOutputSlugs: readonly string[],
  pool: ReadonlySet<string>,
): string[] {
  return pairingEligibleOutputs(
    orderedOutputSlugs.map((slug) => ({ slug, inPool: pool.has(slug) })),
    true,
  ).map((o) => o.slug);
}

/**
 * Every (annotator, prompt) draw assignedPair makes, tallied by pair key.
 * `code` is the public prompt code (Prompt.promptId), which is what /next
 * hashes; the Prompt.id cuid would draw different pairs.
 */
export function tallyDraws(
  prompts: readonly { code: string; slugs: readonly string[] }[],
  annotatorIds: readonly string[],
): { byPair: Map<string, number>; total: number } {
  const byPair = new Map<string, number>();
  let total = 0;
  for (const p of prompts) {
    const slugs = [...p.slugs];
    for (const annotatorId of annotatorIds) {
      const pair = assignedPair(annotatorId, p.code, slugs.length, slugs);
      if (!pair) continue;
      const k = pairKey(slugs[pair[0]], slugs[pair[1]]);
      byPair.set(k, (byPair.get(k) ?? 0) + 1);
      total++;
    }
  }
  return { byPair, total };
}
