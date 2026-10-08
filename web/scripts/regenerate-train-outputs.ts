import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { isV4FamilyVersionLabel } from "../src/lib/arena/frozen-exam";
import {
  generateV4FamilyTrainAnswer,
  trainMaxTokensFor,
  unstorableReason,
} from "../src/lib/arena/v4-family-train";

/**
 * Regenerate named v4-family TRAIN outputs in place, through the same shared
 * assembly the fill uses (src/lib/arena/v4-family-train.ts).
 *
 * Written 2026-09-28 for the three v4.4 rows whose repair round was given
 * partly false instructions before the quoted-source fix
 * (scripts/replay-quoted-source-fix.ts, verdict CHANGED): their stored second
 * answer is not what v4.4 serves, and one of them ends in the task framing
 * ("Wikipedia Write."). Replacing, not adding: the queue neither filters nor
 * dedupes answers by version, so a second row for the same prompt and arm
 * would double that arm's share of pairs.
 *
 * Refuses: frozen-exam rows (the published scoreboard is re-scored by
 * decision, never by side effect), rows a speaker has already judged (what
 * was judged stays as it was; re-checked row by row right before each write,
 * because a speaker may judge while the model is generating), non-v4-family
 * arms, and any answer the fill itself would refuse to store (empty, or a
 * served pass pinned at the cap). Writes a backup of every row it will touch
 * before touching any, and refuses to overwrite an existing backup.
 *
 * Token counts are SUMMED with the stored ones: both the old and the new
 * calls were made and paid for, and measured spend reads these columns.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/regenerate-train-outputs.ts --backup <path> <outputId> [outputId ...]
 */

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--backup");
  const backupPath = at >= 0 ? argv[at + 1] : undefined;
  const ids = argv.filter((a, i) => a !== "--backup" && i !== at + 1);
  if (!backupPath || ids.length === 0) {
    throw new Error(
      "usage: regenerate-train-outputs.ts --backup <path> <outputId> [outputId ...]",
    );
  }

  const rows = await prisma.modelOutput.findMany({
    where: { id: { in: ids }, isDemo: false },
    include: {
      prompt: {
        select: { promptId: true, text: true, bucket: true, isHoldout: true },
      },
      candidateModel: true,
    },
  });
  if (rows.length !== ids.length) {
    throw new Error(
      `found ${rows.length} of ${ids.length} rows - check the ids`,
    );
  }
  const isJudged = async (id: string) =>
    (await prisma.pairwiseComparison.count({
      where: { OR: [{ modelOutputAId: id }, { modelOutputBId: id }] },
    })) > 0;
  for (const r of rows) {
    if (r.prompt.isHoldout)
      throw new Error(`${r.id} is a frozen-exam row - refusing`);
    if (await isJudged(r.id))
      throw new Error(`${r.id} has been judged by a speaker - refusing`);
    if (
      !r.candidateModel ||
      !isV4FamilyVersionLabel(r.candidateModel.versionLabel)
    ) {
      throw new Error(`${r.id} is not a v4-family output - refusing`);
    }
  }

  // "wx": refuse an existing path, so a rerun never overwrites the record of
  // what the rows held before the first run.
  writeFileSync(backupPath, JSON.stringify(rows, null, 1), { flag: "wx" });
  console.log(`backup of ${rows.length} row(s) written to ${backupPath}`);

  for (const r of rows) {
    const c = r.candidateModel!;
    const label = c.versionLabel;
    if (!isV4FamilyVersionLabel(label)) continue;
    const maxTokens = trainMaxTokensFor(c.provider);
    const answer = await generateV4FamilyTrainAnswer(
      prisma,
      c,
      label,
      r.prompt,
      maxTokens,
    );
    const refusal = unstorableReason(
      answer.gen.text,
      answer.servedPassTokensOut ?? answer.gen.tokensOut,
      maxTokens,
    );
    if (refusal) {
      console.log(
        `  KEPT ${r.prompt.promptId}: new answer refused (${refusal}); the stored row is unchanged`,
      );
      continue;
    }
    // The generation took time; a speaker may have judged the row meanwhile.
    if (await isJudged(r.id)) {
      console.log(
        `  KEPT ${r.prompt.promptId}: judged by a speaker during generation; the stored row is unchanged`,
      );
      continue;
    }
    await prisma.modelOutput.update({
      where: { id: r.id },
      data: {
        outputText: answer.gen.text,
        modelId: answer.gen.modelId,
        ragContextIds: answer.ragContextIds,
        tokenCountIn: (r.tokenCountIn ?? 0) + (answer.gen.tokensIn ?? 0),
        tokenCountOut: (r.tokenCountOut ?? 0) + (answer.gen.tokensOut ?? 0),
        latencyMs: answer.gen.latencyMs,
        repaired: answer.gen.repaired,
        repairFirstPassText: answer.gen.firstPassText,
        repairViolations: answer.gen.repaired
          ? (answer.gen.repairViolations as unknown as object)
          : [],
      },
    });
    console.log(
      `  replaced ${r.prompt.promptId.padEnd(22)} ${answer.gen.repaired ? "repaired " + (answer.gen.repairViolations ?? []).map((v) => v.kind).join("+") : "clean"}  ${answer.gen.text.replace(/\s+/g, " ").slice(0, 70)}`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
