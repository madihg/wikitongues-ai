/**
 * Recompute the automatic eval on demand and print it as a table.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/run-eval.ts
 *   npx tsx --env-file=.env.local scripts/run-eval.ts --json > tasks/eval-auto.json
 *   npx tsx --env-file=.env.local scripts/run-eval.ts --write
 *
 * Flags:
 *   --json    print the full report as JSON instead of the table
 *   --write   also write tasks/eval-auto-v1.json (a durable snapshot)
 *
 * It calls exactly the same collectEvalBundle() the /api/arena/eval route calls,
 * so the CLI and the researcher page can never disagree.
 *
 * Everything printed here carries an n and a 95% interval. Where a comparison
 * cannot be supported at the current sample size it prints "not distinguishable"
 * instead of a rank. That is deliberate and must not be "fixed".
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { collectEvalBundle } from "@/lib/eval/collect";
import { METRIC_LABELS, type ReferenceMetric } from "@/lib/eval/reference";
import { bucketShort } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";
import type { Interval } from "@/lib/eval/stats";

const HEADLINE_METRICS: ReferenceMetric[] = [
  "chrf",
  "chrfpp",
  "exactMatch",
  "toneInsensitiveMatch",
  "tokenEditSimilarity",
];

function pct(x: number): string {
  return (x * 100).toFixed(1);
}

function fmt(i: Interval): string {
  if (i.n === 0) return "  n/a  ";
  if (i.underpowered) return `${pct(i.mean)} (n=${i.n}, no CI)`;
  return `${pct(i.mean)} [${pct(i.ciLow)}-${pct(i.ciHigh)}]`;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function rule(width = 100): string {
  return "-".repeat(width);
}

async function main() {
  const json = process.argv.includes("--json");
  const write = process.argv.includes("--write");

  const bundle = await collectEvalBundle(prisma);
  const { report, autorater, langidCrossValidation: cv, corpus } = bundle;

  if (json) {
    console.log(JSON.stringify(bundle, null, 2));
  }

  if (write) {
    const path = resolve(process.cwd(), "../tasks/eval-auto-v1.json");
    writeFileSync(path, JSON.stringify(bundle, null, 2));
    console.error(`wrote ${path}`);
  }

  if (json) return;

  console.log(`\nAUTOMATIC EVAL - frozen Igala benchmark`);
  console.log(`generated ${report.generatedAt}`);
  console.log(rule());
  console.log(
    `corpus: ${corpus.holdoutPrompts} held-out prompts, ` +
      `${report.nPromptsWithGold} with community gold, ` +
      `${corpus.goldAnswersOnHoldout} gold answers on those prompts ` +
      `(${corpus.goldAnswersTotal} in the whole corpus), ` +
      `${corpus.candidateOutputs} candidate outputs, ` +
      `${corpus.humanComparisons} human comparisons.`,
  );

  // ── 1. the ceiling, printed FIRST so no model number is read without it ──
  console.log(
    `\n\nINTER-GOLD CEILING (how well native speakers match EACH OTHER)`,
  );
  console.log(rule());
  console.log(
    `Computed on ${report.ceiling.nPromptsWithCeiling} prompts with 2+ gold answers ` +
      `(${report.ceiling.nPromptsWithoutCeiling} prompts have too few to compute one).`,
  );
  console.log(
    `Leave-one-out: each gold answer scored against the others, exactly as a model is.`,
  );
  console.log("");
  console.log(pad("metric", 30) + "human vs human, best-of-refs");
  for (const m of HEADLINE_METRICS) {
    const cell = report.ceiling.overall.find((c) => c.metric === m)!;
    console.log(pad(METRIC_LABELS[m], 30) + fmt(cell.best));
  }
  console.log(
    `\n  ^ THIS IS THE LIMIT. A model cannot meaningfully exceed the rate at which\n` +
      `    speakers agree with each other, and a model score below it is not\n` +
      `    automatically a failure.`,
  );

  // ── 2. per-candidate table ───────────────────────────────────────────────
  console.log(
    `\n\nCANDIDATES (best-of-references, 95% bootstrap CI, n = scored prompts)`,
  );
  console.log(rule(140));
  const nameW = 38;
  console.log(
    pad("candidate", nameW) +
      padLeft("n", 4) +
      "  " +
      HEADLINE_METRICS.map((m) => pad(METRIC_LABELS[m], 22)).join(""),
  );
  console.log(rule(140));
  for (const c of report.candidates) {
    const n = c.overall.find((x) => x.metric === "chrf")!.best.n;
    console.log(
      pad(c.candidateName.slice(0, nameW - 1), nameW) +
        padLeft(String(n), 4) +
        "  " +
        HEADLINE_METRICS.map((m) =>
          pad(fmt(c.overall.find((x) => x.metric === m)!.best), 22),
        ).join(""),
    );
  }
  console.log(rule(140));

  // ── 3. language gate ─────────────────────────────────────────────────────
  console.log(`\n\nLANGUAGE GATE (share of outputs the gate calls Igala)`);
  console.log(rule());
  console.log(
    pad("candidate", nameW) +
      pad("Igala", 24) +
      pad("English-like", 24) +
      pad("foreign-orthography", 20) +
      "abstained",
  );
  for (const c of report.candidates) {
    console.log(
      pad(c.candidateName.slice(0, nameW - 1), nameW) +
        pad(fmt(c.language.igalaShare), 24) +
        pad(fmt(c.language.englishLikeShare), 24) +
        pad(String(c.language.signatureFlagged), 20) +
        `${pct(c.language.lowConfidenceShare)}%`,
    );
  }
  console.log(
    `\nGate reliability, measured by 5-fold cross-validation on held-out text:\n` +
      `  Igala vs English (the only labelled axis): ${pct(cv.overallAccuracy)}% ` +
      `(n=${cv.overallTotal}; Igala ${pct(cv.perClass.igala.accuracy)}% of ${cv.perClass.igala.total}, ` +
      `English ${pct(cv.perClass.english.accuracy)}% of ${cv.perClass.english.total})\n` +
      `  Binary "is it Igala?": ${pct(cv.igalaVsNotIgala.accuracy)}% (n=${cv.igalaVsNotIgala.total})\n` +
      `  UNVALIDATED classes (seed lexicons, no labelled data): ${cv.unvalidatedClasses.join(", ")}`,
  );

  // ── 4. per-category ──────────────────────────────────────────────────────
  console.log(`\n\nchrF BY PROMPT CATEGORY (best-of-references)`);
  console.log(rule(140));
  const buckets = Array.from(
    new Set(
      report.candidates.flatMap((c) => c.byCategory.map((b) => b.bucket)),
    ),
  ).sort();
  console.log(
    pad("candidate", nameW) +
      buckets.map((b) => pad(bucketShort(b as EvalBucket), 20)).join(""),
  );
  for (const c of report.candidates) {
    console.log(
      pad(c.candidateName.slice(0, nameW - 1), nameW) +
        buckets
          .map((b) => {
            const cat = c.byCategory.find((x) => x.bucket === b);
            if (!cat) return pad("-", 20);
            const cell = cat.metrics.find((m) => m.metric === "chrf")!;
            return pad(`${pct(cell.best.mean)} (n=${cat.n})`, 20);
          })
          .join(""),
    );
  }
  const ceilingRow = buckets
    .map((b) => {
      const cat = report.ceiling.byCategory.find((x) => x.bucket === b);
      if (!cat) return pad("-", 20);
      const cell = cat.metrics.find((m) => m.metric === "chrf")!;
      return pad(`${pct(cell.best.mean)} (n=${cat.n})`, 20);
    })
    .join("");
  console.log(rule(140));
  console.log(pad("HUMAN CEILING", nameW) + ceilingRow);

  // ── 5. head-to-head ──────────────────────────────────────────────────────
  console.log(`\n\nHEAD-TO-HEAD, PAIRED (delta in chrF, A minus B, 95% CI)`);
  console.log(rule(120));
  const seen = new Set<string>();
  const nameById = new Map(
    report.candidates.map((c) => [c.candidateId, c.candidateName]),
  );
  for (const h of report.headToHead) {
    const key = [h.candidateA, h.candidateB].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = h.cells.find((c) => c.metric === "chrf")!;
    const d = cell.delta;
    const verdict = d.distinguishable
      ? d.mean > 0
        ? "A BETTER"
        : "B BETTER"
      : "NOT DISTINGUISHABLE";
    console.log(
      `${pad(nameById.get(h.candidateA)!.slice(0, 34), 35)} vs ${pad(
        nameById.get(h.candidateB)!.slice(0, 34),
        35,
      )} n=${padLeft(String(h.nPaired), 3)}  ` +
        `delta ${padLeft(pct(d.mean), 6)} [${pct(d.ciLow)}, ${pct(d.ciHigh)}]  ${verdict}`,
    );
  }

  // ── 6. autorater validation ──────────────────────────────────────────────
  console.log(`\n\nAUTORATER vs HUMAN JUDGMENT`);
  console.log(rule());
  console.log(autorater.headline);
  console.log("");
  console.log(
    `thresholds (fixed a priori from the ceiling, NOT tuned on these labels):\n` +
      `  inadequate below chrF ${pct(autorater.thresholds.inadequate)} ` +
      `(= the ${autorater.thresholds.quantile * 100}th percentile of ${autorater.thresholds.nCeilingSamples} human-vs-human scores)\n` +
      `  tie within ${pct(autorater.thresholds.tieMargin)} chrF points`,
  );
  console.log("");
  for (const [label, s] of [
    ["all labels", autorater.overall],
    ["human named a winner", autorater.decided],
    ["  ...of those, scorable", autorater.decidedScorable],
    ["human rejected both", autorater.bothInadequate],
    ["human called it a tie", autorater.ties],
  ] as const) {
    console.log(
      `${pad(label, 24)} n=${padLeft(String(s.n), 4)}  agree=${padLeft(String(s.agree), 4)}  ` +
        `${s.n > 0 ? fmt(s.accuracy) : "n/a"}`,
    );
    console.log(`${pad("", 24)} ${s.note}`);
  }
  console.log(
    `\nmajority baseline: always predicting "${autorater.majorityBaseline.label}" scores ` +
      `${pct(autorater.majorityBaseline.accuracy)}% on this label set.`,
  );
  console.log(
    `Cohen's kappa (inadequate vs not): ${autorater.kappaInadequate.toFixed(3)}`,
  );
  console.log(
    `\nlanguage gate vs human failure tags: ${autorater.langGate.nTaggedDetected}/${autorater.langGate.nTagged} detected.`,
  );
  console.log(`  ${autorater.langGate.note}`);

  console.log(`\n\nCAVEATS`);
  console.log(rule());
  for (const c of report.caveats) console.log(`  * ${c}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
