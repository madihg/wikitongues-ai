/**
 * SCOPE-A LEAK CHECK against the REAL frozen protected set, for ALL static
 * text the v4.1 iteration introduced: the v4.1 system prompt (shipped on
 * every rag-v4-1 request) whole and line by line, PLUS the nine seeded v4.1
 * grammar_rule RagEntry rows read back from the database - servable today
 * only via the v1 searchRag path (buildRetrievalV4 reads no RagEntry rows),
 * but checked here so any future retrieval wiring inherits a clean store -
 * with the v4 and v3 prompts as passing controls.
 *
 * The unit test (generation-prompt-v4-1.test.ts) runs checkStatic against a
 * REPRESENTATIVE protected set, because vitest never touches the database.
 * This script is the other half: it builds the protected set from the actual
 * frozen benchmark gold (consentBenchmark, isHoldout prompts - the exact
 * query loadLeakAudit uses) and checks every LINE separately, so a hit names
 * the offending line without ever printing the protected content
 * (leak-guard's information-hygiene rule: locations and counts, never text).
 *
 * NEGATIVE CONTROL: the script also spikes one real frozen gold answer into
 * a synthetic block and requires checkStatic to FLAG it. A guard that passes
 * everything proves nothing; the spike proves the detector is live against
 * this database's protected set. The spiked text is built and discarded in
 * memory - it is never printed, logged, or written anywhere.
 *
 * The spec's named leak-risk strings (lia ke jenwu, the blessing gold,
 * Wola'ule, Ch'ugba t'ugba, Abu wele - in their dotted spellings) are exactly
 * what this script exists to adjudicate: train-attested is allowed, frozen
 * gold is not, and only the real protected set can tell them apart. Run after
 * ANY edit to generation-prompt-v4-1.ts or the seeded grammar rows:
 *
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v4-1.ts
 *
 * Exit code 1 on any Scope-A hit OR on a dead negative control, so it can
 * gate a run.
 */

import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import { IGALA_SYSTEM_V3 } from "../src/lib/generation-prompt-v3";
import { IGALA_SYSTEM_V4 } from "../src/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "../src/lib/generation-prompt-v4-1";

/** How the nine seeded rows identify themselves (their source citation). */
const SEED_SOURCE_MARK = "grammar-failure-analysis-v4-1.md";
const EXPECTED_SEED_ROWS = 9;

async function main() {
  const prisma = new PrismaClient();
  try {
    const frozen = await prisma.prompt.findMany({
      where: { isHoldout: true, language: "igala" },
      select: { id: true, promptId: true },
    });
    const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));
    const golds = await prisma.coldAuthorAnswer.findMany({
      where: {
        promptId: { in: frozen.map((p) => p.id) },
        isDemo: false,
        consentBenchmark: true,
      },
      select: { promptId: true, answerText: true },
    });
    const protectedSet = buildProtectedSet(
      golds.map((g) => ({
        promptId: slugOf.get(g.promptId) ?? g.promptId,
        answerText: g.answerText,
      })),
    );
    console.log(
      `frozen prompts: ${frozen.length}  gold answers: ${golds.length}  protected strings: ${protectedSet.length}\n`,
    );
    if (protectedSet.length === 0) {
      console.error(
        "FAIL: protected set is empty - nothing to check against. Wrong database?",
      );
      process.exitCode = 1;
      return;
    }

    // ── Negative control: a spiked gold MUST be flagged ─────────────────────
    // Built in memory from the first gold answer, checked, discarded. Never
    // printed (information hygiene).
    const spike = `harmless preamble ${golds[0].answerText} harmless coda`;
    const spikeReport = checkStatic(
      [{ where: "spiked-gold negative control", text: spike }],
      protectedSet,
    );
    if (spikeReport.pass) {
      console.error(
        "NEGATIVE CONTROL: DEAD - a block spiked with a real frozen gold answer was NOT flagged. The detector is not working; every PASS below would be meaningless.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `negative control: LIVE - spiked gold flagged (${spikeReport.hitCount} hit(s), as required)\n`,
    );

    // ── The nine seeded v4.1 grammar rows, read back from the database ──────
    const seeded = await prisma.ragEntry.findMany({
      where: {
        language: "igala",
        chunkType: "grammar_rule",
        source: { contains: SEED_SOURCE_MARK },
      },
      select: { topic: true, content: true },
      orderBy: { topic: "asc" },
    });
    if (seeded.length !== EXPECTED_SEED_ROWS) {
      console.error(
        `FAIL: expected ${EXPECTED_SEED_ROWS} seeded v4.1 grammar rows, found ${seeded.length}. Run prisma/seed-rag-v4-1-grammar.ts first (or investigate duplicates).`,
      );
      process.exitCode = 1;
      return;
    }

    // Whole blocks first (the real serving shape), then per line for triage.
    const blocks = [
      { where: "IGALA_SYSTEM_V4_1", text: IGALA_SYSTEM_V4_1 },
      { where: "IGALA_SYSTEM_V4 (control)", text: IGALA_SYSTEM_V4 },
      { where: "IGALA_SYSTEM_V3 (control)", text: IGALA_SYSTEM_V3 },
      ...seeded.map((r) => ({
        where: `RagEntry: ${r.topic}`,
        text: `${r.topic}\n${r.content}`,
      })),
      ...IGALA_SYSTEM_V4_1.split("\n")
        .map((line, i) => ({
          where: `v4.1 line ${i + 1}: ${line.slice(0, 48)}`,
          text: line,
        }))
        .filter((b) => b.text.trim().length > 0),
    ];
    const report = checkStatic(blocks, protectedSet);
    if (report.pass) {
      console.log(
        `SCOPE A: PASS - no frozen gold answer appears in the v4.1 prompt, the ${EXPECTED_SEED_ROWS} seeded grammar rows, or the v3/v4 controls.`,
      );
    } else {
      console.log(`SCOPE A: FAIL - ${report.hitCount} hit(s):`);
      for (const h of report.hits) {
        console.log(`  [${h.tier}] prompt ${h.promptId}  in  ${h.where}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
