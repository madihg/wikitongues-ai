import { prisma } from "@/lib/prisma";
import { ALLOWED_PAIRINGS, assignedPair } from "@/lib/pairing";
import { V45_POOL_FLIP_AT } from "@/lib/arena/era";

/**
 * Put the rag-v4-5 arm into the pairing pool, against v4.4 (the fourteen
 * amended lines and the version-scoped rows, isolated) and against the bare
 * model (the fixed reference). Halim's call, 2026-10-09: "I want the
 * community to start testing v4.5". Exam: agreement 122.7 against v4.4's
 * 105.3, tone-insensitive 94.8 against 94.7, so the frozen exam sees only the
 * tone marks; the 2026-10-08 bank is where its ki and agreement lines can
 * show, and that bank is where v4.5's train answers are filled first.
 *
 * ORDER OF OPERATIONS (the flag is the LAST step, after the code deploys):
 *   1. src/lib/pairing.ts names [v4-5, v4-4] and [v4-5, bare]; src/lib/arena/
 *      era.ts opens round-4 at V45_POOL_FLIP_AT. Merged and deployed first.
 *   2. Train outputs exist: `train-queue-fill.ts generate
 *      gemini-3-1-pro-rag-v4-5 --provenance claude_authored_v45_2026_10_08`
 *      (then the Sep 13 batch as the Gemini daily quota allows).
 *   3. This script, at or after V45_POOL_FLIP_AT (it refuses earlier, so no
 *      v4.5 pair can be judged inside round-3): preconditions, a read-only
 *      dry run proving assignedPair draws both v4.5 pairs against real
 *      coverage, THEN the flag.
 *   4. scripts/check-queue-servable.ts.
 *
 * Copied from scripts/enable-v44-pool.ts. Idempotent.
 *
 * Run:  npx tsx --env-file=.env.local scripts/enable-v45-pool.ts
 */

const V45_SLUG = "gemini-3-1-pro-rag-v4-5";
const V44_SLUG = "gemini-3-1-pro-rag-v4-4";
const BARE_SLUG = "gemini-3-1-pro";

async function main() {
  // ── precondition: never before the round boundary ───────────────────────
  if (Date.now() < Date.parse(V45_POOL_FLIP_AT)) {
    throw new Error(
      `it is before V45_POOL_FLIP_AT (${V45_POOL_FLIP_AT}): a v4.5 pair judged now would land in round-3. No flags were changed.`,
    );
  }
  const [v45, v44, bare] = await Promise.all([
    prisma.candidateModel.findUnique({ where: { slug: V45_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: V44_SLUG } }),
    prisma.candidateModel.findUnique({ where: { slug: BARE_SLUG } }),
  ]);
  if (!v45) throw new Error(`${V45_SLUG} not registered`);
  if (!v44) throw new Error(`${V44_SLUG} not registered`);
  if (!bare) throw new Error(`${BARE_SLUG} not registered`);
  if (!v44.inPairingPool || !bare.inPairingPool) {
    throw new Error(
      `${V44_SLUG} and ${BARE_SLUG} must already be pooled (the pairs v4.5 joins are against them)`,
    );
  }

  // ── precondition: the whitelist names both v4.5 pairs ────────────────────
  const relevantSlugs = [V45_SLUG, V44_SLUG, BARE_SLUG];
  const expected = ALLOWED_PAIRINGS.filter(([a, b]) =>
    a === V45_SLUG || b === V45_SLUG
      ? relevantSlugs.includes(a) && relevantSlugs.includes(b)
      : false,
  ).map((p) => [...p].sort().join(" | "));
  if (expected.length !== 2) {
    throw new Error(
      `ALLOWED_PAIRINGS names ${expected.length} v4.5 pairing(s), expected 2 ([v4-5, v4-4] and [v4-5, bare]) - deploy src/lib/pairing.ts first`,
    );
  }

  // ── precondition: v4.5's train outputs must already exist ────────────────
  const v45TrainCount = await prisma.modelOutput.count({
    where: {
      candidateModelId: v45.id,
      isDemo: false,
      prompt: { isHoldout: false },
    },
  });
  console.log(`${V45_SLUG} train outputs: ${v45TrainCount}`);
  if (v45TrainCount === 0) {
    throw new Error(
      `${V45_SLUG} has zero train outputs - run scripts/train-queue-fill.ts generate ${V45_SLUG} --provenance claude_authored_v45_2026_10_08 first`,
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
  const v45Prompts = bySlugByPrompt.get(V45_SLUG) ?? new Set<string>();
  const v44Prompts = bySlugByPrompt.get(V44_SLUG) ?? new Set<string>();
  const barePrompts = bySlugByPrompt.get(BARE_SLUG) ?? new Set<string>();
  const withV44 = [...v45Prompts].filter((p) => v44Prompts.has(p));
  const withBare = [...v45Prompts].filter((p) => barePrompts.has(p));
  console.log(
    `prompts eligible for [v4.5, v4.4]: ${withV44.length}; [v4.5, bare]: ${withBare.length} ` +
      `(coverage: v4.5=${v45Prompts.size}, v4.4=${v44Prompts.size}, bare=${barePrompts.size} train prompts; read-only)`,
  );

  const seenPairs = new Set<string>();
  const sampleAnnotators = Array.from(
    { length: 12 },
    (_, i) => `dryrun-ann-${i}`,
  );
  const slugsFor = (promptId: string): string[] =>
    relevantSlugs.filter((s) => bySlugByPrompt.get(s)?.has(promptId));
  for (const promptId of new Set([...withV44, ...withBare])) {
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
      `dry run did not draw every v4.5 pairing against real DB coverage: missing ${missing.join(", ")}. No flags were changed.`,
    );
  }
  console.log(
    `OK: the pairing code draws both v4.5 pairings against the DB (dry run, no rows written).`,
  );

  // ── flip the flag ────────────────────────────────────────────────────────
  if (v45.inPairingPool) {
    console.log(`${V45_SLUG} is already pooled (nothing to flip).`);
  } else {
    await prisma.candidateModel.update({
      where: { slug: V45_SLUG },
      data: { inPairingPool: true },
    });
    console.log(`inPairingPool=true set on ${V45_SLUG}`);
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
