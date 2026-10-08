/**
 * v4.5 copy of static-leak-check-v4-4.ts: the served prompt under test is
 * igalaSystemV45(), and the NINE draft rows of prisma/seed-rag-v4-5-grammar.ts
 * (chunkTypes grammar_rule_v4_5 and grammar_rule_v4_5_tone) are checked
 * beside it, together with every row already stored under those chunkTypes
 * (none before the seed runs; after it, the stored text is checked, not only
 * the drafts). The seed runs the same gate itself before inserting. Every
 * earlier prompt is a control.
 *
 * SCOPE-A LEAK CHECK against the REAL frozen protected set for the v4.5
 * system prompt - the text that ships on every rag-v4-5 request - with the
 * v4.4, v4.2, v4.1, v4 and v3 prompts as passing controls.
 *
 * v4.5's amended lines carry Igala forms: the ki-word linkers, the
 * number-agreeing verb pairs, the incompletive examples (a jẹñwu, alọ,
 * ajẹñwu, a'loti), the possessive example ọlawn, and the elision
 * examples v4.2 already carried. The rows carry the write-up's dialect
 * forms as data. None of them
 * is a sentence, but a one-word frozen gold would collide with a one-word
 * form, which is exactly what the inventory warned of (the write-up spells
 * gold words the gate bracketed before: child, pot). So the NEGATIVE CONTROL
 * below matters: it spikes a real frozen gold into a synthetic block and
 * requires the detector to flag it, so a PASS here means "checked and
 * clean", never "the checker was asleep".
 *
 * Run after ANY edit to generation-prompt-v4-5.ts or the v4.5 seed:
 *
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v4-5.ts
 *
 * Exit code 1 on any Scope-A hit OR on a dead negative control.
 */

import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import { IGALA_SYSTEM_V3 } from "../src/lib/generation-prompt-v3";
import { IGALA_SYSTEM_V4 } from "../src/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "../src/lib/generation-prompt-v4-1";
import { IGALA_SYSTEM_V4_2 } from "../src/lib/generation-prompt-v4-2";
import { IGALA_SYSTEM_V4_4 } from "../src/lib/generation-prompt-v4-4";
import { igalaSystemV45 } from "../src/lib/generation-prompt-v4-5";
import { V4_5_GRAMMAR_ENTRIES } from "../prisma/seed-rag-v4-5-grammar";
import { V4_5_ONLY_CHUNK_TYPES } from "../src/lib/arena/grammar-chunk-types";

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

    // Rows already stored under the v4.5 chunkType (0 before the seed).
    const stored = await prisma.ragEntry.findMany({
      where: { language: "igala", chunkType: { in: [...V4_5_ONLY_CHUNK_TYPES] } },
      select: { id: true, topic: true, content: true },
    });
    console.log(
      `stored v4.5-only rows (${V4_5_ONLY_CHUNK_TYPES.join(", ")}): ${stored.length}  draft rows: ${V4_5_GRAMMAR_ENTRIES.length}\n`,
    );

    // Whole blocks first (the real serving shape), then per line and per row
    // for triage.
    const blocks = [
      { where: "igalaSystemV45()", text: igalaSystemV45() },
      { where: "IGALA_SYSTEM_V4_4 (control)", text: IGALA_SYSTEM_V4_4 },
      { where: "IGALA_SYSTEM_V4_2 (control)", text: IGALA_SYSTEM_V4_2 },
      { where: "IGALA_SYSTEM_V4_1 (control)", text: IGALA_SYSTEM_V4_1 },
      { where: "IGALA_SYSTEM_V4 (control)", text: IGALA_SYSTEM_V4 },
      { where: "IGALA_SYSTEM_V3 (control)", text: IGALA_SYSTEM_V3 },
      ...igalaSystemV45().split("\n")
        .map((line, i) => ({
          where: `v4.5 line ${i + 1}: ${line.slice(0, 48)}`,
          text: line,
        }))
        .filter((b) => b.text.trim().length > 0),
      ...V4_5_GRAMMAR_ENTRIES.map((e) => ({
        where: `v4.5 draft row: ${e.topic.slice(0, 64)}`,
        text: `${e.topic}\n${e.content}`,
      })),
      ...stored.map((r) => ({
        where: `v4.5 stored row ${r.id}`,
        text: `${r.topic}\n${r.content}`,
      })),
    ];
    const report = checkStatic(blocks, protectedSet);
    if (report.pass) {
      console.log(
        `SCOPE A: PASS - no frozen gold answer appears in the v4.5 prompt, the ${V4_5_GRAMMAR_ENTRIES.length} v4.5 draft rows, the ${stored.length} stored v4.5 rows, or the v3/v4/v4.1/v4.2/v4.4 controls.`,
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
