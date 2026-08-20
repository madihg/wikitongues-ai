/**
 * QUEUE SUMMARY - end-to-end verification of the pivoted annotator queue,
 * computed from the live DB through the exact modules the routes use
 * (loadQueueInputs -> computeQueueState -> assignedPair), so what this prints
 * is what /api/annotations/next will serve and /api/annotator/summary will
 * count. Read-only.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/queue-summary.ts [annotator-email]
 * Defaults to annotator@test.com.
 */

import { prisma } from "@/lib/prisma";
import {
  assignedPair,
  computeQueueState,
  goldFirstFor,
  laneFor,
} from "@/lib/pairing";
import { isGoldFirstBucket } from "@/lib/buckets";
import { loadQueueInputs } from "@/lib/queue-input";

async function main() {
  const email = process.argv[2] ?? "annotator@test.com";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no user with email ${email}`);

  const { poolActive, byPromptId, queuePrompts } = await loadQueueInputs();

  const [doneRows, skipRows] = await Promise.all([
    prisma.pairwiseComparison.findMany({
      where: { annotatorId: user.id, isDemo: false },
      select: { promptId: true },
    }),
    // ANY flag (skip or malformed-prompt) excludes the prompt for its
    // flagger - mirrors /next and /summary exactly.
    prisma.promptFlag.findMany({
      where: { annotatorId: user.id },
      select: { prompt: { select: { promptId: true } } },
    }),
  ]);

  const state = computeQueueState(
    queuePrompts,
    new Set(doneRows.map((r) => r.promptId)),
    new Set(skipRows.map((r) => r.prompt.promptId)),
  );

  const lanes = { both: 0, strong_pair: 0, cold_mandatory: 0 };
  let goldFirstCount = 0;
  for (const p of state.remaining) {
    lanes[laneFor(p)]++;
    const detail = byPromptId.get(p.promptId)!;
    if (goldFirstFor(p, isGoldFirstBucket(detail.bucket))) goldFirstCount++;
  }

  console.log(`QUEUE SUMMARY for ${email} (${user.id})`);
  console.log(`  pairing pool active: ${poolActive}`);
  console.log(`  prompts with any outputs: ${queuePrompts.length}`);
  console.log(`  eligible (>=2 pool outputs, non-holdout): ${state.total}`);
  console.log(`  completed by this annotator: ${state.completed}`);
  console.log(`  remaining: ${state.remaining.length}`);
  console.log(
    `  lanes in remaining: both(zero-gold)=${lanes.both} strong_pair=${lanes.strong_pair} cold_mandatory(long-form)=${lanes.cold_mandatory}`,
  );
  console.log(`  episodes that will ask cold-first: ${goldFirstCount}`);

  console.log(`\n  first 10 served episodes (in order):`);
  for (const p of state.remaining.slice(0, 10)) {
    const detail = byPromptId.get(p.promptId)!;
    const pair = assignedPair(user.id, p.promptId, p.outputCount);
    const pairSlugs = pair
      ? await Promise.all(
          pair.map(async (idx) => {
            const out = detail.pairableOutputs[idx];
            const row = await prisma.modelOutput.findUnique({
              where: { id: out.id },
              select: { candidateModel: { select: { slug: true } } },
            });
            return row?.candidateModel?.slug ?? "?";
          }),
        )
      : [];
    console.log(
      `    ${p.promptId.padEnd(26)} lane=${laneFor(p).padEnd(14)} ` +
        `goldFirst=${goldFirstFor(p, isGoldFirstBucket(detail.bucket))} ` +
        `pair=[${pairSlugs.join(" vs ")}]`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
