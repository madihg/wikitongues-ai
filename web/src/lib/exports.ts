import { prisma } from "@/lib/prisma";
import {
  buildCsv,
  joinList,
  annotatorLabel,
  type CsvColumn,
} from "@/lib/export-csv";

/**
 * The downloadable research exports, kept out of the route file so they can be
 * unit-tested and run from a script. The route is a thin dispatcher.
 *
 * Every export excludes `isDemo` rows: demo and testing sessions never leave
 * the building. Every export that carries community text also carries the
 * consent flags and the train/test split beside it, because a collaborator
 * cannot honour a permission or avoid the held-out set if the file does not
 * say which rows those are.
 */

/**
 * The prompt bank. Included because every other export references prompts by
 * id, and without this file a recipient cannot tell which questions exist but
 * have no answers yet, nor which ones are the frozen benchmark.
 */
export async function exportPrompts(): Promise<string> {
  const rows = await prisma.prompt.findMany({
    select: {
      promptId: true,
      text: true,
      bucket: true,
      language: true,
      split: true,
      isHoldout: true,
      difficultyLevel: true,
      provenance: true,
      sourceLanguage: true,
      targetCulture: true,
      expectedCulturalContext: true,
      createdAt: true,
      _count: { select: { coldAuthorAnswers: true, modelOutputs: true } },
    },
    orderBy: { promptId: "asc" },
  });

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { key: "prompt_ref", get: (r) => r.promptId },
    { key: "prompt_text", get: (r) => r.text },
    { key: "category", get: (r) => r.bucket },
    { key: "language", get: (r) => r.language },
    { key: "split", get: (r) => r.split },
    { key: "is_holdout", get: (r) => r.isHoldout },
    { key: "difficulty", get: (r) => r.difficultyLevel },
    // Who wrote the question. Most of this bank is LLM-authored, which a
    // recipient should be able to see rather than infer.
    { key: "provenance", get: (r) => r.provenance },
    { key: "source_language", get: (r) => r.sourceLanguage },
    { key: "target_culture", get: (r) => r.targetCulture },
    { key: "expected_cultural_context", get: (r) => r.expectedCulturalContext },
    { key: "n_gold_answers", get: (r) => r._count.coldAuthorAnswers },
    { key: "n_model_outputs", get: (r) => r._count.modelOutputs },
    { key: "created_at", get: (r) => r.createdAt.toISOString() },
  ];

  return buildCsv(columns, rows);
}

/** The Igala corpus itself: cold-authored gold, with its metadata. */
export async function exportGold(): Promise<string> {
  const rows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false },
    include: {
      prompt: {
        select: {
          promptId: true,
          text: true,
          bucket: true,
          language: true,
          split: true,
          isHoldout: true,
        },
      },
      annotator: { select: { id: true, name: true } },
    },
    orderBy: [{ promptId: "asc" }, { createdAt: "asc" }],
  });

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { key: "id", get: (r) => r.id },
    { key: "prompt_ref", get: (r) => r.prompt.promptId },
    { key: "prompt_text", get: (r) => r.prompt.text },
    { key: "category", get: (r) => r.bucket ?? r.prompt.bucket },
    { key: "language", get: (r) => r.prompt.language },
    // The answer, then immediately the two things Lydia asked for, then the
    // permissions that govern what may be done with them.
    { key: "igala_answer", get: (r) => r.answerText },
    { key: "english_translation", get: (r) => r.englishGloss },
    { key: "dialect", get: (r) => r.dialect },
    { key: "consent_training", get: (r) => r.consentTraining },
    { key: "consent_benchmark", get: (r) => r.consentBenchmark },
    { key: "instruction_igala", get: (r) => r.instructionIg },
    { key: "provenance", get: (r) => r.provenance },
    { key: "verification_status", get: (r) => r.verificationStatus },
    { key: "split", get: (r) => r.prompt.split },
    { key: "is_holdout", get: (r) => r.prompt.isHoldout },
    { key: "contributor", get: (r) => annotatorLabel(r.annotator) },
    { key: "contributor_id", get: (r) => r.annotator.id },
    { key: "created_at", get: (r) => r.createdAt.toISOString() },
  ];

  return buildCsv(columns, rows);
}

/** Annotator corrections to model output - the other half of the corpus. */
export async function exportEdits(): Promise<string> {
  const rows = await prisma.outputEdit.findMany({
    where: { isDemo: false },
    include: {
      modelOutput: {
        select: {
          model: true,
          modelId: true,
          prompt: {
            select: {
              promptId: true,
              text: true,
              language: true,
              split: true,
              isHoldout: true,
            },
          },
        },
      },
      annotator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { key: "id", get: (r) => r.id },
    { key: "prompt_ref", get: (r) => r.modelOutput.prompt.promptId },
    { key: "prompt_text", get: (r) => r.modelOutput.prompt.text },
    { key: "category", get: (r) => r.bucket },
    { key: "language", get: (r) => r.modelOutput.prompt.language },
    { key: "model", get: (r) => r.modelOutput.model },
    { key: "model_id", get: (r) => r.modelOutput.modelId },
    { key: "model_output", get: (r) => r.originalText },
    { key: "corrected_igala", get: (r) => r.correctedText },
    { key: "rationale", get: (r) => r.rationale },
    { key: "consent_training", get: (r) => r.consentTraining },
    { key: "consent_benchmark", get: (r) => r.consentBenchmark },
    { key: "provenance", get: (r) => r.provenance },
    { key: "verification_status", get: (r) => r.verificationStatus },
    { key: "split", get: (r) => r.modelOutput.prompt.split },
    { key: "is_holdout", get: (r) => r.modelOutput.prompt.isHoldout },
    { key: "contributor", get: (r) => annotatorLabel(r.annotator) },
    { key: "contributor_id", get: (r) => r.annotator.id },
    { key: "created_at", get: (r) => r.createdAt.toISOString() },
  ];

  return buildCsv(columns, rows);
}

export async function exportPairwise(): Promise<string> {
  const rows = await prisma.pairwiseComparison.findMany({
    where: { isDemo: false },
    include: {
      modelOutputA: {
        select: {
          model: true,
          modelId: true,
          outputText: true,
          candidateModel: { select: { name: true } },
          prompt: {
            select: {
              promptId: true,
              text: true,
              language: true,
              split: true,
              isHoldout: true,
            },
          },
        },
      },
      modelOutputB: {
        select: {
          model: true,
          modelId: true,
          outputText: true,
          candidateModel: { select: { name: true } },
        },
      },
      annotator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { key: "id", get: (r) => r.id },
    { key: "prompt_ref", get: (r) => r.modelOutputA.prompt.promptId },
    { key: "prompt_text", get: (r) => r.modelOutputA.prompt.text },
    { key: "category", get: (r) => r.bucket ?? "" },
    { key: "language", get: (r) => r.modelOutputA.prompt.language },
    {
      key: "model_a",
      get: (r) => r.modelOutputA.candidateModel?.name ?? r.modelOutputA.model,
    },
    { key: "model_a_id", get: (r) => r.modelOutputA.modelId },
    // Without the texts the file records a verdict on evidence it does not
    // contain, and no one downstream can check or re-analyse the judgement.
    { key: "output_a", get: (r) => r.modelOutputA.outputText },
    {
      key: "model_b",
      get: (r) => r.modelOutputB.candidateModel?.name ?? r.modelOutputB.model,
    },
    { key: "model_b_id", get: (r) => r.modelOutputB.modelId },
    { key: "output_b", get: (r) => r.modelOutputB.outputText },
    { key: "winner", get: (r) => r.winner },
    { key: "confidence_1_to_4", get: (r) => r.confidence },
    { key: "explanation_english", get: (r) => r.explanation },
    { key: "failure_tags_a", get: (r) => joinList(r.failureTagsA) },
    { key: "failure_tags_b", get: (r) => joinList(r.failureTagsB) },
    { key: "split", get: (r) => r.modelOutputA.prompt.split },
    { key: "is_holdout", get: (r) => r.modelOutputA.prompt.isHoldout },
    { key: "contributor", get: (r) => annotatorLabel(r.annotator) },
    { key: "contributor_id", get: (r) => r.annotator.id },
    { key: "created_at", get: (r) => r.createdAt.toISOString() },
  ];

  return buildCsv(columns, rows);
}

export async function exportRubric(): Promise<string> {
  const rows = await prisma.rubricAxisScore.findMany({
    where: { isDemo: false },
    include: {
      modelOutput: {
        select: {
          model: true,
          modelId: true,
          outputText: true,
          candidateModel: { select: { name: true } },
          prompt: {
            select: {
              promptId: true,
              text: true,
              language: true,
              split: true,
              isHoldout: true,
            },
          },
        },
      },
      annotator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { key: "id", get: (r) => r.id },
    { key: "prompt_ref", get: (r) => r.modelOutput.prompt.promptId },
    { key: "prompt_text", get: (r) => r.modelOutput.prompt.text },
    { key: "language", get: (r) => r.modelOutput.prompt.language },
    {
      key: "model",
      get: (r) => r.modelOutput.candidateModel?.name ?? r.modelOutput.model,
    },
    { key: "model_id", get: (r) => r.modelOutput.modelId },
    { key: "model_output", get: (r) => r.modelOutput.outputText },
    { key: "axis", get: (r) => r.axis },
    // "NA" is an explicit not-applicable judgement, distinct from the axis
    // simply not having been scored - an empty cell would conflate them.
    { key: "score", get: (r) => (r.score === null ? "NA" : r.score) },
    { key: "note", get: (r) => r.note },
    { key: "rubric_version", get: (r) => r.rubricVersion },
    { key: "split", get: (r) => r.modelOutput.prompt.split },
    { key: "is_holdout", get: (r) => r.modelOutput.prompt.isHoldout },
    { key: "contributor", get: (r) => annotatorLabel(r.annotator) },
    { key: "contributor_id", get: (r) => r.annotator.id },
    { key: "created_at", get: (r) => r.createdAt.toISOString() },
  ];

  return buildCsv(columns, rows);
}

/** The existing markdown summary. Unchanged in content; kept so the download
 *  a researcher already relies on does not disappear. */
export async function exportReport(): Promise<string> {
  const [promptCount, modelOutputCount, pairwiseCount, rubricCount, gapCount] =
    await Promise.all([
      prisma.prompt.count(),
      // isDemo:false, to match every other count in this report. Without it
      // the report mixed real and demo-session totals in one table, so the
      // output count was on a different basis from the ones beside it.
      prisma.modelOutput.count({ where: { isDemo: false } }),
      prisma.pairwiseComparison.count({ where: { isDemo: false } }),
      prisma.rubricAxisScore.count({ where: { isDemo: false } }),
      prisma.handoffItem.count({ where: { gapBucket: { not: null } } }),
    ]);

  const languages = await prisma.prompt.findMany({
    select: { language: true },
    distinct: ["language"],
  });
  const models = await prisma.modelOutput.findMany({
    where: { isDemo: false },
    select: { model: true },
    distinct: ["model"],
  });
  const resolvedGaps = await prisma.handoffItem.count({
    where: {
      gapBucket: { not: null },
      status: { in: ["approved", "corrected"] },
    },
  });

  return [
    "# Wikitongues AI Benchmark Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Overview",
    "",
    `- **Languages:** ${languages.map((l) => l.language).join(", ") || "None"}`,
    `- **Models evaluated:** ${models.map((m) => m.model).join(", ") || "None"}`,
    `- **Total prompts:** ${promptCount}`,
    `- **Model outputs:** ${modelOutputCount}`,
    `- **Pairwise comparisons:** ${pairwiseCount}`,
    `- **Rubric scores:** ${rubricCount}`,
    "",
    "## Gap Analysis",
    "",
    `- **Total gaps identified:** ${gapCount}`,
    `- **Gaps resolved:** ${resolvedGaps}`,
    `- **Gaps remaining:** ${gapCount - resolvedGaps}`,
    "",
    "---",
    "",
    "*Report generated by Wikitongues AI admin dashboard.*",
  ].join("\n");
}

/**
 * A README that ships beside the CSVs so the columns are not guessed at.
 *
 * Every figure in it is counted at generation time. Hardcoding coverage numbers
 * into documentation is how a file ends up confidently describing a corpus that
 * has since doubled - the gold count moved while this feature was being built.
 */
export async function exportReadme(): Promise<string> {
  const [total, withEnglish, withDialect, noTrain, noBench] = await Promise.all(
    [
      prisma.coldAuthorAnswer.count({ where: { isDemo: false } }),
      prisma.coldAuthorAnswer.count({
        where: {
          isDemo: false,
          NOT: { englishGloss: null },
          englishGloss: { not: "" },
        },
      }),
      prisma.coldAuthorAnswer.count({
        where: { isDemo: false, NOT: { dialect: null }, dialect: { not: "" } },
      }),
      prisma.coldAuthorAnswer.count({
        where: { isDemo: false, consentTraining: false },
      }),
      prisma.coldAuthorAnswer.count({
        where: { isDemo: false, consentBenchmark: false },
      }),
    ],
  );
  const pct = (n: number) =>
    total ? `${n} of ${total} (${((100 * n) / total).toFixed(1)}%)` : `${n}`;

  return `# Wikitongues Igala data exports - column reference

Generated ${new Date().toISOString()}

Every export excludes demo and testing sessions. Every export that carries
community-authored text carries the consent flags and the train/test split
beside it.

## READ THIS BEFORE USING THE DATA

**consent_training** - the contributor permits this text to be used to train a
model. **consent_benchmark** - the contributor permits it to be used to
evaluate models. These are set per answer and they are NOT interchangeable:
contributors have withheld one while granting the other. Filter on the flag
that matches your use. "The community consented" is not a statement that can be
made about any of these files as a whole.

Right now ${noTrain} answer(s) withhold training consent and ${noBench}
withhold benchmark consent, and the two sets do not overlap.

**is_holdout / split** - rows marked \`is_holdout = true\` (equivalently
\`split = test\`) are the frozen evaluation benchmark. Training on them destroys
the only measurement of progress this project has. Exclude them from any
training set.

**contributor / contributor_id** - these answers are authored work by named
members of the Igala community. Attribution is intended. Email addresses are
deliberately not exported.

## igala_prompts.csv - the question bank

One row per prompt, with counts of how many gold answers and model outputs it
has. Use it to see which questions are still unanswered, and note the
\`provenance\` column: most of this bank is LLM-authored rather than
community-authored.

## gold_answers.csv - the Igala corpus

One row per community-authored answer. This is the primary artifact.

| column | meaning |
|---|---|
| prompt_ref, prompt_text | the question the contributor was answering |
| category | prompt category (orthography, lexicon, register, ...) |
| igala_answer | the contributor's Igala, written before seeing any model output |
| english_translation | the contributor's English gloss, where given |
| dialect | self-reported dialect, where given |
| instruction_igala | contributor's note written in Igala, where given |
| provenance | how the answer was produced |
| verification_status | single_annotator, or verified by others |

Coverage caveat, so it is not discovered mid-analysis. Both english_translation
and dialect are optional fields added partway through collection, so they are
present on some rows and blank on the rest. As of this download:

- english_translation: ${pct(withEnglish)}
- dialect: ${pct(withDialect)}

Filter on non-empty rather than assuming presence. The dialect column in
particular is too thin to support a dialect-level claim - treat it as a lead
for follow-up with contributors, not as a variable to group by.

## edits.csv - corrections to model output

One row per annotator correction, with the original model text beside the
corrected Igala.

## pairwise.csv - blind head-to-head judgements

One row per comparison, carrying BOTH model outputs so the verdict can be
re-checked against the evidence it was made on. \`winner\` is a, b, tie, or
both_inadequate. Note that both_inadequate dominates this file: the models are
mostly not good enough to rank, and that is itself the finding.

## rubric.csv - per-axis scores

Long format, one row per scored axis. \`score = NA\` is an explicit
not-applicable judgement, distinct from an unscored axis.
`;
}
