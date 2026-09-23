/**
 * v4.4 copy of static-leak-check-v4-2.ts: the served prompt under test is
 * IGALA_SYSTEM_V4_4 (v4.3 serves v4.2's prompt byte for byte, so v4.2's
 * check covers it); every earlier prompt runs as a control.
 *
 * SCOPE-A LEAK CHECK against the REAL frozen protected set for the v4.2
 * system prompt - the text that ships on every rag-v4-2 request - with the
 * v4.1, v4 and v3 prompts as passing controls.
 *
 * v4.2's three added lines quote no Igala at all: they are procedure (names
 * are copied, facts are never dropped) plus a scope clause on the letters
 * rule. The one proper noun they name (Lagos) is an English place name, not
 * attested Igala gold. So this script is expected to pass trivially - which
 * is exactly why the NEGATIVE CONTROL below matters: it spikes a real frozen
 * gold into a synthetic block and requires the detector to flag it, so a PASS
 * here means "checked and clean", never "the checker was asleep".
 *
 * Unlike the v4.1 script this one does NOT require the nine seeded
 * grammar_rule rows: v4.2 changes no RagEntry content, and buildRetrievalV4
 * still reads none. Run scripts/static-leak-check-v4-1.ts for those.
 *
 * Run after ANY edit to generation-prompt-v4-2.ts:
 *
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v4-2.ts
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

    // Whole blocks first (the real serving shape), then per line for triage.
    const blocks = [
      { where: "IGALA_SYSTEM_V4_4", text: IGALA_SYSTEM_V4_4 },
      { where: "IGALA_SYSTEM_V4_2 (control)", text: IGALA_SYSTEM_V4_2 },
      { where: "IGALA_SYSTEM_V4_1 (control)", text: IGALA_SYSTEM_V4_1 },
      { where: "IGALA_SYSTEM_V4 (control)", text: IGALA_SYSTEM_V4 },
      { where: "IGALA_SYSTEM_V3 (control)", text: IGALA_SYSTEM_V3 },
      ...IGALA_SYSTEM_V4_4.split("\n")
        .map((line, i) => ({
          where: `v4.4 line ${i + 1}: ${line.slice(0, 48)}`,
          text: line,
        }))
        .filter((b) => b.text.trim().length > 0),
    ];
    const report = checkStatic(blocks, protectedSet);
    if (report.pass) {
      console.log(
        "SCOPE A: PASS - no frozen gold answer appears in the v4.4 prompt or the v3/v4/v4.1/v4.2 controls.",
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
