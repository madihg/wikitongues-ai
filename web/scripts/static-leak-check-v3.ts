/**
 * SCOPE-A LEAK CHECK against the REAL frozen protected set, for the rag-v3
 * static text (and the v2 static text it inherits from, as a control).
 *
 * The unit test (generation-prompt-v3.test.ts) runs checkStatic against a
 * REPRESENTATIVE protected set, because vitest never touches the database.
 * This script is the other half: it builds the protected set from the actual
 * frozen benchmark gold (consentBenchmark, isHoldout prompts - the exact
 * query loadLeakAudit uses) and checks every LINE of the static prompts
 * separately, so a hit names the offending line without ever printing the
 * protected content (leak-guard's information-hygiene rule: locations and
 * counts, never text).
 *
 * The v3 grammar section is precisely the kind of text Scope A exists for:
 * it ships attested Igala forms on EVERY request, and a form that happens to
 * be a whole frozen gold answer would hand the model that answer key on
 * every query. Run this after ANY edit to generation-prompt-v3.ts (or -v2):
 *
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v3.ts
 *
 * Exit code 1 on any hit, so it can gate a run.
 */

import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import {
  IGALA_SYSTEM_V2,
  igalaTerminalContract,
} from "../src/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "../src/lib/generation-prompt-v3";

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

    // Whole blocks first (the real serving shape), then per line for triage.
    const blocks = [
      { where: "IGALA_SYSTEM_V3", text: IGALA_SYSTEM_V3 },
      { where: "IGALA_SYSTEM_V2", text: IGALA_SYSTEM_V2 },
      { where: "terminalContract", text: igalaTerminalContract(null) },
      ...IGALA_SYSTEM_V3.split("\n")
        .map((line, i) => ({
          where: `v3 line ${i + 1}: ${line.slice(0, 48)}`,
          text: line,
        }))
        .filter((b) => b.text.trim().length > 0),
    ];
    const report = checkStatic(blocks, protectedSet);
    if (report.pass) {
      console.log(
        "SCOPE A: PASS - no frozen gold answer appears in any static block.",
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
