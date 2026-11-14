/**
 * Read-only production check for the explicit prompt order (2026-11-13).
 * loadQueueInputs now asks the database for prompts by createdAt, then id.
 * Before, the query carried no order. For each annotator this compares the
 * queue they had (the order the database returns with no order asked) with
 * the queue they have now, and reports:
 *   same set     the prompts left to do are the same prompts
 *   moved        positions in the remaining queue that now hold another prompt
 *   out of line  the fewest prompts that had to change place relative to the
 *                others (queue length minus the longest run kept in order)
 *   next         whether the very next prompt served is the same
 * Writes nothing. Prints no email and no name: annotators are numbered by
 * how many prompts they have judged.
 *
 *   npx tsx --env-file=.env.local scripts/queue-order-diff.ts
 */
import { prisma } from "../src/lib/prisma";
import { computeQueueState, type QueuePrompt } from "../src/lib/pairing";
import { loadQueueInputs } from "../src/lib/queue-input";

/** Length of the longest strictly increasing subsequence. */
function longestKept(xs: number[]): number {
  const tails: number[] = [];
  for (const x of xs) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

async function main() {
  const { queuePrompts: after } = await loadQueueInputs();
  const unordered = await prisma.prompt.findMany({
    where: { modelOutputs: { some: {} } },
    select: { promptId: true },
  });
  const byId = new Map(after.map((q) => [q.promptId, q]));
  const before: QueuePrompt[] = unordered.map((u) => byId.get(u.promptId)!);
  if (before.some((q) => !q) || before.length !== after.length) {
    throw new Error("the two queries returned different prompts");
  }
  const cataloguePos = new Map(after.map((q, i) => [q.promptId, i]));
  const catalogueMoved = before.filter((q, i) => q.promptId !== after[i].promptId).length;
  console.log(
    `catalogue: ${after.length} prompts, ${catalogueMoved} positions differ, ${after.length - longestKept(before.map((q) => cataloguePos.get(q.promptId)!))} out of line`,
  );

  const users = await prisma.user.findMany({
    where: { role: { in: ["ANNOTATOR", "RESEARCHER"] } },
    select: { id: true },
  });
  const rows: { judged: number; line: string; ok: boolean }[] = [];
  for (const u of users) {
    const [done, flagged, recent] = await Promise.all([
      prisma.pairwiseComparison.findMany({ where: { annotatorId: u.id, isDemo: false }, select: { promptId: true } }),
      prisma.promptFlag.findMany({ where: { annotatorId: u.id }, select: { prompt: { select: { promptId: true } } } }),
      prisma.pairwiseComparison.count({ where: { annotatorId: u.id, isDemo: false, createdAt: { gte: new Date("2026-10-09") } } }),
    ]);
    if (done.length === 0) continue;
    const doneSet = new Set(done.map((r) => r.promptId));
    const skipSet = new Set(flagged.map((r) => r.prompt.promptId));
    const b = computeQueueState(before, doneSet, skipSet);
    const a = computeQueueState(after, doneSet, skipSet);
    const bIds = b.remaining.map((p) => p.promptId);
    const aIds = a.remaining.map((p) => p.promptId);
    const sameSet = bIds.length === aIds.length && new Set(bIds).size === new Set([...bIds, ...aIds]).size;
    const reserved = aIds.filter((p) => doneSet.has(p) || skipSet.has(p)).length;
    const moved = aIds.filter((p, i) => p !== bIds[i]).length;
    const pos = new Map(aIds.map((p, i) => [p, i]));
    const outOfLine = aIds.length - longestKept(bIds.map((p) => pos.get(p)!));
    const sameNext = aIds.length === 0 || aIds[0] === bIds[0];
    rows.push({
      judged: done.length,
      ok: sameSet && reserved === 0 && a.total === b.total && a.completed === b.completed,
      line: `judged=${done.length} since_oct9=${recent} remaining=${aIds.length} same_set=${sameSet} re_served=${reserved} moved=${moved} out_of_line=${outOfLine} same_next=${sameNext}`,
    });
  }
  rows.sort((x, y) => y.judged - x.judged);
  rows.forEach((r, i) => console.log(`annotator ${i + 1}: ${r.line}`));
  const bad = rows.filter((r) => !r.ok).length;
  console.log(bad === 0 ? "OK: every annotator keeps the same set, totals and nothing is served again" : `FAIL: ${bad} annotator(s) differ in set or totals`);
  await prisma.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
