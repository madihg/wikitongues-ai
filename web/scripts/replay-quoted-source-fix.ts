import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import {
  checkIgalaOutput,
  labelRunsRepairRound,
  type RepairViolation,
} from "../src/lib/arena/repair-round";
import {
  checksNames,
  isV4FamilyVersionLabel,
} from "../src/lib/arena/frozen-exam";

/**
 * REPLAY OF THE 2026-09-28 QUOTED-SOURCE FIX, over every stored repaired
 * v4-family output. Read-only unless --apply-train is passed.
 *
 * The repair round re-asks only when its checker flags the FIRST answer, and
 * it stores that first answer (repairFirstPassText) with the violations it
 * saw. So the fix can be replayed exactly, with no model call: run the fixed
 * checker on the stored first answer, with the options the serving path uses.
 *
 *   CLEARED  the fixed checker finds nothing: the re-ask should never have
 *            happened, and the answer this version serves IS the first pass.
 *   SAME     the fixed checker finds the same violations: the re-ask was
 *            right, and the stored second answer stands.
 *   CHANGED  it finds real violations but not the same ones: the re-ask was
 *            told something false, so the second answer is not exactly what
 *            the version serves. Only a regeneration can say what it would
 *            have written.
 *
 * --apply-train rewrites the CLEARED rows on TRAIN prompts only: outputText
 * becomes the first pass, repaired false, repairViolations [] (checked and
 * clean), repairFirstPassText null. Token counts are left as stored: both
 * calls were made and paid for, and measured spend reads these columns.
 * Frozen-exam rows are never touched here: they are the published
 * scoreboard, and re-scoring them is a decision, not a side effect. A
 * backup of every row the run would touch is written first
 * (--backup <path>, required with --apply-train).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/replay-quoted-source-fix.ts
 *   npx tsx --env-file=.env.local scripts/replay-quoted-source-fix.ts --apply-train --slug <slug> --backup ../tasks/backups/x.json
 */

type Verdict = "CLEARED" | "SAME" | "CHANGED";

const key = (vs: RepairViolation[] | null | undefined) =>
  JSON.stringify((vs ?? []).map((v) => `${v.kind}:${v.detail}`).sort());

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply-train");
  const at = argv.indexOf("--backup");
  const backupPath = at >= 0 ? argv[at + 1] : undefined;
  if (apply && !backupPath) {
    throw new Error("--apply-train needs --backup <path>");
  }
  // --slug limits what --apply-train may rewrite (the report still covers
  // every arm).
  const st = argv.indexOf("--slug");
  const onlySlug = st >= 0 ? argv[st + 1] : undefined;

  const rows = await prisma.modelOutput.findMany({
    where: { isDemo: false, repaired: true },
    select: {
      id: true,
      outputText: true,
      repairFirstPassText: true,
      repairViolations: true,
      prompt: { select: { promptId: true, text: true, isHoldout: true } },
      candidateModel: { select: { slug: true, versionLabel: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: {
    id: string;
    slug: string;
    promptId: string;
    frozen: boolean;
    verdict: Verdict;
    before: string[];
    after: string[];
  }[] = [];
  for (const r of rows) {
    const label = r.candidateModel?.versionLabel ?? null;
    if (!isV4FamilyVersionLabel(label) || !labelRunsRepairRound(label))
      continue;
    if (!r.repairFirstPassText) continue;
    const question = r.prompt?.text ?? "";
    const after = checkIgalaOutput(r.repairFirstPassText, {
      allowTone: /\btone/i.test(question),
      sourceText: question,
      checkNames: checksNames(label),
    });
    const before = (r.repairViolations ?? []) as unknown as RepairViolation[];
    const verdict: Verdict =
      after.length === 0
        ? "CLEARED"
        : key(after) === key(before)
          ? "SAME"
          : "CHANGED";
    results.push({
      id: r.id,
      slug: r.candidateModel!.slug,
      promptId: r.prompt?.promptId ?? "?",
      frozen: r.prompt?.isHoldout ?? false,
      verdict,
      before: before.map((v) => v.kind),
      after: after.map((v) => v.kind),
    });
  }

  const tally = new Map<string, number>();
  for (const x of results) {
    const k = `${x.slug} ${x.frozen ? "frozen" : "train"} ${x.verdict}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  console.log(`repaired v4-family rows replayed: ${results.length}`);
  for (const [k, n] of [...tally.entries()].sort())
    console.log(`  ${k.padEnd(52)} ${n}`);
  console.log("");
  for (const x of results.filter((y) => y.verdict !== "SAME")) {
    console.log(
      `  ${x.verdict.padEnd(8)} ${x.slug.padEnd(26)} ${x.promptId.padEnd(22)}${x.frozen ? " [frozen]" : ""}  ${x.before.join("+")} -> ${x.after.join("+") || "clean"}`,
    );
  }

  if (!apply) {
    console.log("\nread-only run: nothing written");
    await prisma.$disconnect();
    return;
  }

  const targets = results.filter(
    (x) =>
      x.verdict === "CLEARED" &&
      !x.frozen &&
      (!onlySlug || x.slug === onlySlug),
  );
  const full = await prisma.modelOutput.findMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  // "wx": refuse an existing path, so a rerun never overwrites the record of
  // what the rows held before the first run.
  writeFileSync(backupPath!, JSON.stringify(full, null, 1), { flag: "wx" });
  console.log(`\nbackup of ${full.length} row(s) written to ${backupPath}`);
  // A row already referenced by a comparison was SERVED as it stands; never
  // rewrite what a speaker judged.
  const judged = await prisma.pairwiseComparison.findMany({
    where: {
      OR: [
        { modelOutputAId: { in: targets.map((t) => t.id) } },
        { modelOutputBId: { in: targets.map((t) => t.id) } },
      ],
    },
    select: { modelOutputAId: true, modelOutputBId: true },
  });
  const judgedIds = new Set(
    judged.flatMap((j) => [j.modelOutputAId, j.modelOutputBId]),
  );
  let rewritten = 0;
  for (const row of full) {
    if (judgedIds.has(row.id)) {
      console.log(`  skip ${row.id}: already judged by a speaker`);
      continue;
    }
    await prisma.modelOutput.update({
      where: { id: row.id },
      data: {
        outputText: row.repairFirstPassText!,
        repaired: false,
        repairViolations: [],
        repairFirstPassText: null,
      },
    });
    rewritten++;
  }
  console.log(`rewrote ${rewritten} train row(s) to their first pass`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
