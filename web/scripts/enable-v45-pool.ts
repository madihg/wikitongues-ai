import { prisma } from "@/lib/prisma";
import { V45_POOL_FLIP_AT } from "@/lib/arena/era";
import { QUEUE_OUTPUT_ORDER } from "@/lib/queue-input";
import {
  pairKey,
  servedSlugs,
  tallyDraws,
  whitelistProblemsFor,
} from "@/lib/pool-enable";

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
 *   3. This script with --check, any time: every precondition and the dry
 *      run, read-only, no time guard, no flag.
 *   4. This script, at or after V45_POOL_FLIP_AT (it refuses earlier, so no
 *      v4.5 pair can be judged inside round-3): the same preconditions and
 *      dry run, THEN the flag.
 *   5. scripts/check-queue-servable.ts.
 *
 * THE DRY RUN MIRRORS /api/annotations/next: each train prompt's slug list
 * is its outputs in QUEUE_OUTPUT_ORDER (the order src/lib/queue-input.ts
 * serves), filtered to every arm pooled now plus v4.5; assignedPair is
 * called with the public prompt code (Prompt.promptId), for every account
 * that annotates. It prints the share of draws per pair.
 *
 * Copied from scripts/enable-v44-pool.ts. Idempotent.
 *
 * Run:  npx tsx --env-file=.env.local scripts/enable-v45-pool.ts --check
 *       npx tsx --env-file=.env.local scripts/enable-v45-pool.ts
 */

const V45_SLUG = "gemini-3-1-pro-rag-v4-5";
const V44_SLUG = "gemini-3-1-pro-rag-v4-4";
const BARE_SLUG = "gemini-3-1-pro";
/** Exactly these v4.5 pairs, no more, no fewer (sorted keys). */
const EXPECTED_V45_PAIRS = [
  pairKey(V44_SLUG, V45_SLUG),
  pairKey(BARE_SLUG, V45_SLUG),
];

const CHECK = process.argv.includes("--check");

function pct(n: number, total: number): string {
  return total > 0 ? `${((100 * n) / total).toFixed(1)}%` : "-";
}

function printShares(
  title: string,
  { byPair, total }: { byPair: Map<string, number>; total: number },
) {
  console.log(`${title}: ${total} draw(s)`);
  for (const [k, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pct(n, total).padStart(6)}  ${String(n).padStart(5)}  ${k}`);
  }
}

async function main() {
  if (CHECK) {
    console.log(
      "--check: read-only. The time guard and the flag are skipped; every precondition and the dry run run.",
    );
  } else if (Date.now() < Date.parse(V45_POOL_FLIP_AT)) {
    // ── precondition: never before the round boundary ─────────────────────
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
  if (v45.archived) throw new Error(`${V45_SLUG} is archived`);
  if (!v44.inPairingPool || v44.archived || !bare.inPairingPool || bare.archived) {
    throw new Error(
      `${V44_SLUG} and ${BARE_SLUG} must already be pooled and unarchived (the pairs v4.5 joins are against them)`,
    );
  }

  // ── precondition: the whitelist names exactly the two v4.5 pairs ─────────
  const problems = whitelistProblemsFor(V45_SLUG, EXPECTED_V45_PAIRS);
  if (problems.length > 0) {
    throw new Error(
      `ALLOWED_PAIRINGS must name exactly ${EXPECTED_V45_PAIRS.join(" and ")} for v4.5: ${problems.join("; ")}. No flags were changed.`,
    );
  }
  console.log(`whitelist: exactly ${EXPECTED_V45_PAIRS.join(", ")}`);

  // ── precondition: v4.5's train outputs must already exist ────────────────
  const v45TrainWhere = {
    candidateModelId: v45.id,
    isDemo: false,
    prompt: { isHoldout: false },
  };
  const v45TrainCount = await prisma.modelOutput.count({ where: v45TrainWhere });
  console.log(`${V45_SLUG} train outputs: ${v45TrainCount}`);
  if (v45TrainCount === 0) {
    throw new Error(
      `${V45_SLUG} has zero train outputs - run scripts/train-queue-fill.ts generate ${V45_SLUG} --provenance claude_authored_v45_2026_10_08 first`,
    );
  }

  // ── precondition: at most one non-demo v4.5 output per train prompt ──────
  // A second one doubles v4.5 in that prompt's slug list, so assignedPair
  // could draw it twice as often there, or pair it with itself if the
  // whitelist ever allowed that.
  const perPrompt = await prisma.modelOutput.groupBy({
    by: ["promptId"],
    where: v45TrainWhere,
    _count: { _all: true },
  });
  const doubled = perPrompt.filter((g) => g._count._all > 1);
  if (doubled.length > 0) {
    const codes = await prisma.prompt.findMany({
      where: { id: { in: doubled.slice(0, 10).map((g) => g.promptId) } },
      select: { promptId: true },
    });
    throw new Error(
      `${doubled.length} train prompt(s) hold more than one non-demo ${V45_SLUG} output (e.g. ${codes.map((c) => c.promptId).join(", ")}). Remove the extras first. No flags were changed.`,
    );
  }
  console.log(
    `one non-demo ${V45_SLUG} output per train prompt: OK (${perPrompt.length} prompt(s))`,
  );

  // ── dry run FIRST, flag flipped only if it passes ────────────────────────
  const pooledNow = await prisma.candidateModel.findMany({
    where: { inPairingPool: true, archived: false },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  const afterPool = new Set([...pooledNow.map((r) => r.slug), V45_SLUG]);
  console.log(`pool now: ${pooledNow.map((r) => r.slug).join(", ")}`);
  console.log(`pool after the flag: ${[...afterPool].sort().join(", ")}`);

  const prompts = await prisma.prompt.findMany({
    where: { isHoldout: false, modelOutputs: { some: {} } },
    select: {
      promptId: true,
      modelOutputs: {
        orderBy: QUEUE_OUTPUT_ORDER,
        select: { candidateModel: { select: { slug: true } } },
      },
    },
  });
  const slugLists = prompts.map((p) => ({
    code: p.promptId,
    slugs: servedSlugs(
      p.modelOutputs.map((o) => o.candidateModel?.slug ?? ""),
      afterPool,
    ),
  }));
  const withV45 = slugLists.filter((p) => p.slugs.includes(V45_SLUG));
  // Every account /next serves in practice: the annotator role, plus anyone
  // (a researcher, say) who has a non-demo judgment. Their real ids, since
  // the draw hashes the annotator id.
  const annotators = await prisma.user.findMany({
    where: {
      OR: [
        { role: "ANNOTATOR" },
        { pairwiseComparisons: { some: { isDemo: false } } },
      ],
    },
    select: { id: true },
  });
  const annotatorIds = annotators.map((a) => a.id);
  if (annotatorIds.length === 0) throw new Error("no annotating accounts found");
  console.log(
    `dry run over ${slugLists.length} train prompt(s) with outputs (${withV45.length} carry v4.5) x ${annotatorIds.length} annotating account(s); read-only`,
  );

  const all = tallyDraws(slugLists, annotatorIds);
  const onV45 = tallyDraws(withV45, annotatorIds);
  printShares("share of draws per pair, every train prompt", all);
  printShares("share of draws per pair, prompts carrying v4.5", onV45);

  const missing = EXPECTED_V45_PAIRS.filter((k) => !all.byPair.has(k));
  if (missing.length > 0) {
    throw new Error(
      `dry run did not draw every v4.5 pairing against real DB coverage: missing ${missing.join(", ")}. No flags were changed.`,
    );
  }
  console.log(
    `OK: the pairing code draws both v4.5 pairings against the DB (dry run, no rows written).`,
  );

  if (CHECK) {
    console.log(
      `--check done: ${V45_SLUG} inPairingPool=${v45.inPairingPool}, nothing changed.`,
    );
    return;
  }

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
