import { prisma } from "@/lib/prisma";
import { ALLOWED_PAIRINGS, assignedPair } from "@/lib/pairing";

/**
 * Put the rag-v4-4 arm into the pairing pool, so the next blind round pits
 * it against the two arms the community has already judged (bare Gemini 3.1
 * Pro and the v3 package). Halim's call, 2026-09-23, after v4.4 led every
 * frozen-exam column (agreement 105.3, tone-insensitive 94.7, speakerRank
 * 62.7).
 *
 * ORDER OF OPERATIONS (the flag is the LAST step, after the code deploys):
 *   1. src/lib/pairing.ts names [v4-4, bare] and [v4-4, v3] in
 *      ALLOWED_PAIRINGS (merged and deployed first: production's whitelist
 *      must know the pairs before the flag flips, or v4.4 outputs sit in the
 *      pool with no pair that can draw them).
 *   2. Train outputs exist: `train-queue-fill.ts generate
 *      gemini-3-1-pro-rag-v4-4 --provenance <batch>` for each batch still in
 *      annotators' queues (its v4-family branch serves the same assembly as
 *      the exam and the chat route: v4.4 prompt, retrieval v4, grammar block,
 *      repair round, name check).
 *   3. This script: preconditions, a read-only dry run proving assignedPair
 *      draws both v4.4 pairs against real coverage, THEN the flag.
 *   4. scripts/check-queue-servable.ts, then scripts/queue-summary.ts.
 *
 * Copied from scripts/enable-v41-pool.ts (2026-09-07 shape: dry run first,
 * flag only if it passes). Idempotent: re-running flips nothing new.
 *
 * Run:  npx tsx --env-file=.env.local scripts/enable-v44-pool.ts
 */

const V44_SLUG = "gemini-3-1-pro-rag-v4-4";
const BARE_SLUG = "gemini-3-1-pro";
const V3_SLUG = "gemini-3-1-pro-rag-v3";

async function main() {
  const [v44, bare, v3] = await Promise.all([
    prisma.candidateModel.findUnique({ where: { slug: V44_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: BARE_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: V3_SLUG } }),
  ]);
  if (!v44) throw new Error(`${V44_SLUG} not registered`);
  if (!bare) throw new Error(`${BARE_SLUG} not registered`);
  if (!v3) throw new Error(`${V3_SLUG} not registered`);
  if (!bare.inPairingPool || !v3.inPairingPool) {
    throw new Error(
      `${BARE_SLUG} and ${V3_SLUG} must already be pooled (the pairs v4.4 joins are against them)`,
    );
  }

  // ── precondition: the whitelist names both v4.4 pairs ────────────────────
  const relevantSlugs = [V44_SLUG, BARE_SLUG, V3_SLUG];
  const expected = ALLOWED_PAIRINGS.filter(([a, b]) =>
    a === V44_SLUG || b === V44_SLUG
      ? relevantSlugs.includes(a) && relevantSlugs.includes(b)
      : false,
  ).map((p) => [...p].sort().join(" | "));
  if (expected.length !== 2) {
    throw new Error(
      `ALLOWED_PAIRINGS names ${expected.length} v4.4 pairing(s), expected 2 ([v4-4, bare] and [v4-4, v3]) - deploy src/lib/pairing.ts first`,
    );
  }

  // ── precondition: v4.4's train outputs must already exist ────────────────
  const v44TrainCount = await prisma.modelOutput.count({
    where: {
      candidateModelId: v44.id,
      isDemo: false,
      prompt: { isHoldout: false },
    },
  });
  console.log(`${V44_SLUG} train outputs: ${v44TrainCount}`);
  if (v44TrainCount === 0) {
    throw new Error(
      `${V44_SLUG} has zero train outputs - run scripts/train-queue-fill.ts generate ${V44_SLUG} --provenance <batch> first`,
    );
  }

  // ── dry run FIRST, flag flipped only if it passes ────────────────────────
  const relevantRows = await prisma.candidateModel.findMany({
    where: { slug: { in: relevantSlugs }, archived: false },
    select: { id: true, slug: true },
  });
  const outputs = await prisma.modelOutput.findMany({
    where: {
      candidateModelId: { in: relevantRows.map((r) => r.id) },
      isDemo: false,
      prompt: { isHoldout: false },
    },
    select: { promptId: true, candidateModel: { select: { slug: true } } },
  });
  const bySlugByPrompt = new Map<string, Set<string>>();
  for (const o of outputs) {
    const slug = o.candidateModel!.slug;
    if (!bySlugByPrompt.has(slug)) bySlugByPrompt.set(slug, new Set());
    bySlugByPrompt.get(slug)!.add(o.promptId);
  }
  const v44Prompts = bySlugByPrompt.get(V44_SLUG) ?? new Set<string>();
  const barePrompts = bySlugByPrompt.get(BARE_SLUG) ?? new Set<string>();
  const v3Prompts = bySlugByPrompt.get(V3_SLUG) ?? new Set<string>();
  const withBare = [...v44Prompts].filter((p) => barePrompts.has(p));
  const withV3 = [...v44Prompts].filter((p) => v3Prompts.has(p));
  console.log(
    `prompts eligible for [v4.4, bare]: ${withBare.length}; [v4.4, v3]: ${withV3.length} ` +
      `(coverage: v4.4=${v44Prompts.size}, bare=${barePrompts.size}, v3=${v3Prompts.size} train prompts; read-only)`,
  );

  const seenPairs = new Set<string>();
  const sampleAnnotators = Array.from(
    { length: 12 },
    (_, i) => `dryrun-ann-${i}`,
  );
  const slugsFor = (promptId: string): string[] =>
    relevantSlugs.filter((s) => bySlugByPrompt.get(s)?.has(promptId));
  for (const promptId of new Set([...withBare, ...withV3])) {
    const slugs = slugsFor(promptId);
    if (slugs.length < 2) continue;
    for (const annotatorId of sampleAnnotators) {
      const pair = assignedPair(annotatorId, promptId, slugs.length, slugs);
      if (!pair) continue;
      const [i, j] = pair;
      seenPairs.add([slugs[i], slugs[j]].sort().join(" | "));
    }
  }
  console.log(
    `dry run - pairings actually drawn: ${[...seenPairs].join("; ") || "(none)"}`,
  );
  const missing = expected.filter((e) => !seenPairs.has(e));
  if (missing.length > 0) {
    throw new Error(
      `dry run did not draw every v4.4 pairing against real DB coverage: missing ${missing.join(", ")}. No flags were changed.`,
    );
  }
  console.log(
    `OK: the pairing code draws both v4.4 pairings against the DB (dry run, no rows written).`,
  );

  // ── flip the flag ────────────────────────────────────────────────────────
  if (v44.inPairingPool) {
    console.log(`${V44_SLUG} is already pooled (nothing to flip).`);
  } else {
    await prisma.candidateModel.update({
      where: { slug: V44_SLUG },
      data: { inPairingPool: true },
    });
    console.log(`inPairingPool=true set on ${V44_SLUG}`);
  }
  console.log(
    "Now run: npx tsx --env-file=.env.local scripts/check-queue-servable.ts",
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
