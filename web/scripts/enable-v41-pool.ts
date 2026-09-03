/**
 * ENABLE THE V4.1 POOL ARMS - option (a) pool prep, step 5
 * (2026-09-03 pool-prep task).
 *
 * Flips inPairingPool=true on gemini-3-1-pro-rag-v4-1 and
 * gemini-3-1-pro-tonestrip, but ONLY after verifying their train-prompt
 * coverage actually exists (step 4's precondition) - flipping the flag
 * first and generating second would let the queue serve a v4.1 output that
 * doesn't exist yet.
 *
 * Then DRY-RUNS the pairing code against the real DB: for a sample of
 * (prompt, annotator) combinations, loads pairable outputs the way
 * loadQueueInputs() does and calls assignedPair() with slugs, asserting
 * both ALLOWED_PAIRINGS entries actually get drawn somewhere in the sample.
 * No rows are written by the dry run - it only reads.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/enable-v41-pool.ts
 */

import { prisma } from "@/lib/prisma";
import { ALLOWED_PAIRINGS, assignedPair } from "@/lib/pairing";

const V41_SLUG = "gemini-3-1-pro-rag-v4-1";
const TONESTRIP_SLUG = "gemini-3-1-pro-tonestrip";
const V3_SLUG = "gemini-3-1-pro-rag-v3";

async function main() {
  const [v41, tonestrip, v3] = await Promise.all([
    prisma.candidateModel.findUnique({ where: { slug: V41_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: TONESTRIP_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: V3_SLUG } }),
  ]);
  if (!v41) throw new Error(`${V41_SLUG} not registered`);
  if (!tonestrip) throw new Error(`${TONESTRIP_SLUG} not registered`);
  if (!v3) throw new Error(`${V3_SLUG} not registered`);

  // ── precondition: v4.1's train outputs must already exist ───────────────
  const v41TrainCount = await prisma.modelOutput.count({
    where: {
      candidateModelId: v41.id,
      isDemo: false,
      prompt: { isHoldout: false },
    },
  });
  const tonestripTrainCount = await prisma.modelOutput.count({
    where: {
      candidateModelId: tonestrip.id,
      isDemo: false,
      prompt: { isHoldout: false },
    },
  });
  console.log(
    `${V41_SLUG} train outputs: ${v41TrainCount}; ${TONESTRIP_SLUG} train outputs: ${tonestripTrainCount}`,
  );
  if (v41TrainCount === 0) {
    throw new Error(
      `${V41_SLUG} has zero train outputs - run scripts/train-fill-arm.ts first (step 4)`,
    );
  }
  if (tonestripTrainCount === 0) {
    throw new Error(
      `${TONESTRIP_SLUG} has zero train outputs - it should already exist`,
    );
  }

  // ── flip the flags ───────────────────────────────────────────────────────
  await prisma.candidateModel.update({
    where: { slug: V41_SLUG },
    data: { inPairingPool: true },
  });
  await prisma.candidateModel.update({
    where: { slug: TONESTRIP_SLUG },
    data: { inPairingPool: true },
  });
  console.log(`inPairingPool=true set on ${V41_SLUG} and ${TONESTRIP_SLUG}`);

  // ── dry run: prove the pairing code can draw both allowed pairings ──────
  const poolRows = await prisma.candidateModel.findMany({
    where: { inPairingPool: true, archived: false },
    select: { id: true, slug: true },
  });
  console.log(`pool now: ${poolRows.map((r) => r.slug).join(", ")}`);

  // Prompts where all three of v3 / v4.1 / tonestrip have an output - the
  // only prompts that can serve either allowed pairing.
  const relevantSlugs = [V3_SLUG, V41_SLUG, TONESTRIP_SLUG];
  const relevantIds = poolRows
    .filter((r) => relevantSlugs.includes(r.slug))
    .map((r) => r.id);
  const outputs = await prisma.modelOutput.findMany({
    where: {
      candidateModelId: { in: relevantIds },
      isDemo: false,
      prompt: { isHoldout: false },
    },
    select: {
      promptId: true,
      candidateModel: { select: { slug: true } },
    },
  });
  const bySlugByPrompt = new Map<string, Set<string>>();
  for (const o of outputs) {
    const slug = o.candidateModel!.slug;
    if (!bySlugByPrompt.has(slug)) bySlugByPrompt.set(slug, new Set());
    bySlugByPrompt.get(slug)!.add(o.promptId);
  }
  const v3Prompts = bySlugByPrompt.get(V3_SLUG) ?? new Set();
  const v41Prompts = bySlugByPrompt.get(V41_SLUG) ?? new Set();
  const tsPrompts = bySlugByPrompt.get(TONESTRIP_SLUG) ?? new Set();

  const promptsWithV3AndV41 = [...v41Prompts].filter((p) => v3Prompts.has(p));
  const promptsWithTsAndV41 = [...v41Prompts].filter((p) => tsPrompts.has(p));
  console.log(
    `prompts eligible for [v4.1, v3]: ${promptsWithV3AndV41.length}; ` +
      `[v4.1, tonestrip]: ${promptsWithTsAndV41.length} (read-only counts, no writes)`,
  );

  const seenPairs = new Set<string>();
  const sampleAnnotators = Array.from(
    { length: 12 },
    (_, i) => `dryrun-ann-${i}`,
  );
  const slugsFor = (promptId: string): string[] =>
    [V41_SLUG, V3_SLUG, TONESTRIP_SLUG].filter((s) =>
      bySlugByPrompt.get(s)?.has(promptId),
    );

  const candidatePrompts = [
    ...new Set([...promptsWithV3AndV41, ...promptsWithTsAndV41]),
  ];
  for (const promptId of candidatePrompts) {
    const slugs = slugsFor(promptId);
    if (slugs.length < 2) continue;
    for (const annotatorId of sampleAnnotators) {
      const pair = assignedPair(annotatorId, promptId, slugs.length, slugs);
      if (!pair) continue;
      const [i, j] = pair;
      const key = [slugs[i], slugs[j]].sort().join(" | ");
      seenPairs.add(key);
    }
  }
  console.log(
    `dry run - pairings actually drawn: ${[...seenPairs].join("; ") || "(none)"}`,
  );

  const expected = ALLOWED_PAIRINGS.map((p) => [...p].sort().join(" | "));
  const missing = expected.filter((e) => !seenPairs.has(e));
  if (missing.length > 0) {
    throw new Error(
      `dry run did not draw every allowed pairing against real DB coverage: missing ${missing.join(", ")}. ` +
        `Check output coverage (v3=${v3Prompts.size}, v4.1=${v41Prompts.size}, tonestrip=${tsPrompts.size} train prompts).`,
    );
  }
  console.log(
    "OK: the pairing code draws both allowed pairings against the DB (dry run, no rows written).",
  );

  const allActive = await prisma.candidateModel.findMany({
    where: { inPairingPool: true, archived: false },
    select: { slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  console.log("\nEXACT POOL MEMBERSHIP after this change:");
  for (const r of allActive) console.log(`  ${r.slug.padEnd(28)} ${r.name}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
