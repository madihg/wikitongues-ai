/**
 * Read-only production check: does the pairwise queue actually serve what
 * the dashboard counts? For each annotator (or the one given by email),
 * walk computeQueueState's remaining exactly as /api/annotations/next does
 * and report how many prompts assignedPair can serve. Any prompt counted
 * as remaining but unservable is a drift between /summary and /next.
 *
 * Exits 1 on drift, and ALSO when the pool is active, prompts hold 2+ pooled
 * outputs, and none is pairable - the exact 2026-09-03 failure, which leaves
 * remaining=0 everywhere and would otherwise pass the drift check trivially.
 *
 *   npx tsx --env-file=.env.local scripts/check-queue-servable.ts [email]
 */
import { prisma } from "../src/lib/prisma";
import { ALLOWED_PAIRINGS, assignedPair, computeQueueState } from "../src/lib/pairing";
import { loadQueueInputs } from "../src/lib/queue-input";

async function main() {
  const email = process.argv[2];
  const users = await prisma.user.findMany({
    where: email ? { email } : { role: { in: ["ANNOTATOR", "RESEARCHER"] } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
  const { poolActive, byPromptId, queuePrompts } = await loadQueueInputs();
  const pooledSlugs = new Set<string>();
  for (const p of byPromptId.values()) for (const o of p.pairableOutputs) pooledSlugs.add(o.slug);
  console.log(`poolActive=${poolActive} pooledSlugs=${[...pooledSlugs].sort().join(",")}`);
  const withPair = queuePrompts.filter((q) => q.outputCount >= 2).length;
  const pairable = queuePrompts.filter((q) => q.pairable && q.outputCount >= 2).length;
  console.log(`prompts with outputs=${queuePrompts.length} with 2+ pooled outputs=${withPair} pairable=${pairable} unpairable=${withPair - pairable}`);
  const whitelistNamesPooledPair = ALLOWED_PAIRINGS.some(([a, b]) => pooledSlugs.has(a) && pooledSlugs.has(b));
  console.log(`whitelist names a pooled pair: ${whitelistNamesPooledPair} (${JSON.stringify(ALLOWED_PAIRINGS)})`);
  const starved = poolActive && withPair > 0 && pairable === 0;
  let drift = 0;
  for (const u of users) {
    const [done, flagged] = await Promise.all([
      prisma.pairwiseComparison.findMany({ where: { annotatorId: u.id, isDemo: false }, select: { promptId: true } }),
      prisma.promptFlag.findMany({ where: { annotatorId: u.id }, select: { prompt: { select: { promptId: true } } } }),
    ]);
    const state = computeQueueState(
      queuePrompts,
      new Set(done.map((r) => r.promptId)),
      new Set(flagged.map((r) => r.prompt.promptId)),
    );
    let servable = 0;
    for (const c of state.remaining) {
      const outputs = byPromptId.get(c.promptId)!.pairableOutputs;
      if (assignedPair(u.id, c.promptId, outputs.length, outputs.map((o) => o.slug))) servable++;
    }
    const d = state.remaining.length - servable;
    drift += d;
    console.log(`${u.email}: total=${state.total} completed=${state.completed} remaining=${state.remaining.length} servable=${servable}${d ? ` DRIFT=${d}` : ""}`);
  }
  if (starved) console.log("STARVED: the pool holds pairs but ALLOWED_PAIRINGS refuses all of them - every annotator sees an empty queue");
  console.log(drift === 0 ? "OK: every remaining prompt is servable" : `DRIFT: ${drift} counted-but-unservable prompts`);
  await prisma.$disconnect();
  process.exit(drift === 0 && !starved ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
