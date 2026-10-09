/**
 * SCOPE-A LEAK CHECK for the reference-form second pass: REFERENCE_FORM_SYSTEM
 * and the user-turn frame (src/lib/arena/reference-form.ts), the text that
 * ships on every second-pass call, against the REAL frozen protected set.
 * IGALA_SYSTEM_V4_4 runs beside it as a passing control.
 *
 * The instruction cites one Igala pair, ki ọla / k'ọla, the authors' own
 * example from the Sep 25 write-up, and is otherwise procedure in English. So
 * this is expected to pass, which is exactly why the NEGATIVE CONTROL below
 * matters: it spikes a real frozen gold into a synthetic block and requires
 * the detector to flag it, so a PASS means "checked and clean", never "the
 * checker was asleep". Same shape as static-leak-check-v4-4.ts.
 *
 * Run after ANY edit to REFERENCE_FORM_SYSTEM or buildReferenceFormTurn:
 *
 *   npx tsx --env-file=.env.local scripts/static-leak-check-reference-form.ts
 *
 * Exit code 1 on any Scope-A hit OR on a dead negative control.
 */

import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import {
  REFERENCE_FORM_SYSTEM,
  buildReferenceFormTurn,
} from "../src/lib/arena/reference-form";
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

    // The frame is what the user turn carries around the answer; checked
    // with an empty answer so only the static text is under test.
    const frame = buildReferenceFormTurn("").userMessage;

    // Whole blocks first (the real serving shape), then per line for triage.
    const blocks = [
      { where: "REFERENCE_FORM_SYSTEM", text: REFERENCE_FORM_SYSTEM },
      { where: "reference-form user-turn frame", text: frame },
      { where: "IGALA_SYSTEM_V4_4 (control)", text: IGALA_SYSTEM_V4_4 },
      ...REFERENCE_FORM_SYSTEM.split("\n")
        .map((line, i) => ({
          where: `reference-form line ${i + 1}: ${line.slice(0, 48)}`,
          text: line,
        }))
        .filter((b) => b.text.trim().length > 0),
    ];
    const report = checkStatic(blocks, protectedSet);
    if (report.pass) {
      console.log(
        "SCOPE A: PASS - no frozen gold answer appears in the reference-form instruction, its user-turn frame, or the v4.4 control.",
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
