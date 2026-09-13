/**
 * Does the repair round's copied-word exemption change any MEASURED output?
 *
 * The exemption (2026-09-07 fix, see src/lib/arena/repair-round.ts) makes
 * check (a) skip words the question already contained, because the check
 * exists to catch the model's own inventions and a copied proper noun is not
 * one. That is a bug fix, not a version change - but it applies to rag-v4-1,
 * whose exam numbers are published. So it has to be shown harmless where the
 * numbers came from, not merely argued to be.
 *
 * This replays the CHECKER (never the model) over every stored output of the
 * given version labels, once with the old behaviour and once with the new,
 * and reports every row whose violation set differs. It writes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/replay-repair-check.ts [label ...]
 *
 * Exits 1 if any stored output's verdict changes, so it can gate a merge.
 */
import { prisma } from "../src/lib/prisma";
import { checkIgalaOutput } from "../src/lib/arena/repair-round";

async function main() {
  const labels = process.argv.slice(2);
  const versionLabels = labels.length ? labels : ["rag-v4-1", "rag-v4"];
  const rows = await prisma.modelOutput.findMany({
    where: {
      isDemo: false,
      candidateModel: { versionLabel: { in: versionLabels } },
    },
    select: {
      id: true,
      outputText: true,
      prompt: { select: { promptId: true, text: true, isHoldout: true } },
      candidateModel: { select: { slug: true } },
    },
  });
  console.log(`replaying ${rows.length} stored outputs for ${versionLabels.join(", ")}`);

  let changed = 0;
  let exemptedRows = 0;
  const kinds = (vs: { kind: string }[]) => vs.map((v) => v.kind).sort().join("+") || "clean";
  for (const r of rows) {
    const question = r.prompt?.text ?? "";
    const allowTone = /\btone/i.test(question);
    // Old behaviour: no sourceText, so no exemption and no name check.
    const before = checkIgalaOutput(r.outputText, { allowTone });
    // New behaviour on a v4.1 arm: exemption on, name check OFF (v4.2 only).
    const after = checkIgalaOutput(r.outputText, { allowTone, sourceText: question });
    if (kinds(before) !== kinds(after)) {
      changed++;
      console.log(
        `CHANGED ${r.candidateModel?.slug} ${r.prompt?.promptId}${r.prompt?.isHoldout ? " [frozen]" : ""}: ${kinds(before)} -> ${kinds(after)}`,
      );
    } else if (
      JSON.stringify(before.map((v) => v.detail)) !==
      JSON.stringify(after.map((v) => v.detail))
    ) {
      exemptedRows++;
    }
  }
  console.log(
    `verdict changes: ${changed}; same verdict but fewer words named: ${exemptedRows}`,
  );
  console.log(
    changed === 0
      ? "OK: the exemption changes no stored output's verdict - the published numbers stand"
      : `DIFFERS: ${changed} stored outputs would have been treated differently`,
  );
  await prisma.$disconnect();
  process.exit(changed === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
