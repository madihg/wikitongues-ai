/**
 * BENCH: per-stage timing of the rag-v3 chat serving path, DB only.
 *
 * v3 serving = v2 retrieval (src/lib/arena/retrieval-v2.ts) + the v3 system
 * prompt; the provider call is deliberately excluded here, so what this
 * measures is everything the chat route does BEFORE the model starts talking.
 * Three representative chat prompts (lookup, greeting, sentence-building),
 * each run REPS times; stage timings reported per run so cold/warm are both
 * visible.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/bench-retrieval-v3.ts [explain]
 * "explain" additionally prints EXPLAIN ANALYZE for the hot queries.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  buildRetrievalV2,
  contentWords,
  retrieveDictCandidates,
  retrieveGuardedGold,
  wantsStructureExamples,
  PARALLEL_K,
  type ParallelRow,
} from "@/lib/arena/retrieval-v2";

const PROMPTS = [
  {
    label: "lookup",
    text: "What is the Igala word for water?",
  },
  {
    label: "greeting",
    text: "How should a younger person respectfully greet an elder in the morning?",
  },
  {
    label: "sentence",
    text: "Translate this sentence into Igala: the farmer went to the market with his children.",
  },
];

const REPS = 3;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; out: T }> {
  const t0 = performance.now();
  const out = await fn();
  return { ms: performance.now() - t0, out };
}

async function pairQuery(text: string): Promise<ParallelRow[]> {
  // Byte-identical to the query in buildRetrievalV2, replicated here so the
  // leg can be timed in isolation.
  return prisma.$queryRaw<ParallelRow[]>(Prisma.sql`
    SELECT id, igala, english
    FROM wikitongues."ParallelPair"
    WHERE "englishTsv" @@ replace(plainto_tsquery('english', ${text})::text, ' & ', ' | ')::tsquery
    ORDER BY ts_rank("englishTsv", replace(plainto_tsquery('english', ${text})::text, ' & ', ' | ')::tsquery) DESC, id ASC
    LIMIT ${PARALLEL_K}
  `);
}

async function benchOne(label: string, text: string, rep: number) {
  const chatPrompt = {
    promptId: "__chat__",
    text,
    bucket: null as string | null,
    isHoldout: true,
  };
  const words = contentWords(text);

  // FULL is timed FIRST so the very first run of the process measures a cold
  // path (no gold-pool cache warmed by the individual leg timings below).
  const full = await timed(() => buildRetrievalV2(prisma, chatPrompt));
  const promptRow = await timed(() =>
    prisma.prompt.findUnique({
      where: { promptId: "__chat__" },
      select: { id: true },
    }),
  );
  const dict = await timed(() => retrieveDictCandidates(prisma, words));
  const pairs = wantsStructureExamples(null, text)
    ? await timed(() => pairQuery(text))
    : { ms: 0, out: [] as ParallelRow[] };
  const gold = await timed(() => retrieveGuardedGold(prisma, chatPrompt));

  console.log(
    [
      `${label} #${rep}`,
      `promptRow ${promptRow.ms.toFixed(0)}ms`,
      `dict ${dict.ms.toFixed(0)}ms (${words.length} words, ${dict.out.length} cands)`,
      `pairs ${pairs.ms.toFixed(0)}ms (${pairs.out.length})`,
      `gold ${gold.ms.toFixed(0)}ms (${gold.out.length})`,
      `FULL buildRetrievalV2 ${full.ms.toFixed(0)}ms`,
    ].join(" | "),
  );
  return full.ms;
}

async function explainHotQueries() {
  const text = PROMPTS[1].text;
  console.log("\n── EXPLAIN ANALYZE: ParallelPair FTS ──");
  const ftsPlan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`
    EXPLAIN ANALYZE
    SELECT id, igala, english
    FROM wikitongues."ParallelPair"
    WHERE "englishTsv" @@ replace(plainto_tsquery('english', ${text})::text, ' & ', ' | ')::tsquery
    ORDER BY ts_rank("englishTsv", replace(plainto_tsquery('english', ${text})::text, ' & ', ' | ')::tsquery) DESC, id ASC
    LIMIT ${PARALLEL_K}
  `);
  for (const r of ftsPlan) console.log(r["QUERY PLAN"]);

  console.log("\n── EXPLAIN ANALYZE: LexEntry exact glossFolded IN ──");
  const inPlan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`
    EXPLAIN ANALYZE
    SELECT id FROM wikitongues."LexEntry"
    WHERE "glossFolded" IN ('water', 'morning', 'farmer')
  `);
  for (const r of inPlan) console.log(r["QUERY PLAN"]);

  console.log("\n── EXPLAIN ANALYZE: LexEntry prefix glossFolded LIKE ──");
  const likePlan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(
    Prisma.sql`
    EXPLAIN ANALYZE
    SELECT id FROM wikitongues."LexEntry"
    WHERE "glossFolded" LIKE 'respect%' LIMIT 12
  `,
  );
  for (const r of likePlan) console.log(r["QUERY PLAN"]);
}

async function main() {
  const counts = await prisma.$queryRaw<{ t: string; n: bigint }[]>(Prisma.sql`
    SELECT 'LexEntry' t, count(*) n FROM wikitongues."LexEntry"
    UNION ALL SELECT 'ParallelPair', count(*) FROM wikitongues."ParallelPair"
    UNION ALL SELECT 'ColdAuthorAnswer', count(*) FROM wikitongues."ColdAuthorAnswer"
  `);
  console.log("corpus:", counts.map((c) => `${c.t}=${c.n}`).join(" "), "\n");

  const totals: number[] = [];
  for (let rep = 1; rep <= REPS; rep++) {
    for (const p of PROMPTS) totals.push(await benchOne(p.label, p.text, rep));
  }
  const sorted = [...totals].sort((a, b) => a - b);
  console.log(
    `\nbuildRetrievalV2 across ${totals.length} runs: min ${sorted[0].toFixed(0)}ms / median ${sorted[sorted.length >> 1].toFixed(0)}ms / max ${sorted[sorted.length - 1].toFixed(0)}ms`,
  );

  if (process.argv.includes("explain")) await explainHotQueries();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
