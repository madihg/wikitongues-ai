/**
 * The ONE impure file in src/lib/eval: it reads Prisma and hands plain objects
 * to the pure scorers. Everything else in this directory is unit-testable
 * without a database, and the API route and scripts/run-eval.ts both go through
 * here so a report from the UI and a report from the CLI are the same report.
 *
 * WHAT IT READS, and why each choice matters:
 *   - Prompt where isHoldout = true. The frozen benchmark (tasks/eval-freeze-v1.json,
 *     43 prompts). Never the training split.
 *   - ColdAuthorAnswer where isDemo = false AND consentBenchmark = true.
 *     Community gold, the references.
 *
 *     CONSENT. `consentBenchmark` is a per-answer flag an annotator sets when
 *     they author gold: it means "you may use my answer to benchmark models".
 *     It is a SEPARATE permission from `consentTraining`, which is what
 *     sft-source.ts and gold-retrieval.ts honour. This harness is a benchmark,
 *     so it is the consumer `consentBenchmark` was written for - and until this
 *     module existed, nothing in the codebase read that flag at all. We honour
 *     it for BOTH uses of gold here: as a scoring reference, and as training
 *     text for the Igala language profile. The profile is a component of the
 *     benchmark, so a speaker who withheld benchmark consent should not be in
 *     it either. Excluded answers are COUNTED and reported (see
 *     `corpus.goldExcludedNoBenchmarkConsent`) rather than silently dropped, so
 *     the number is auditable instead of invisible.
 *   - ModelOutput where isDemo = false and the prompt is held out. Candidate
 *     answers.
 *   - PairwiseComparison where isDemo = false. Human labels for autorater
 *     validation, joined back to their outputs so a comparison carries the same
 *     chrF the eval table used.
 *
 * The language-ID profiles are trained on ALL non-demo gold (937 answers at time
 * of writing), not just the frozen subset, because more Igala is strictly better
 * for the profile - and on the prompt texts plus English glosses for English.
 */

import type { PrismaClient } from "@prisma/client";
import {
  buildLanguageIdModel,
  crossValidateLangId,
  identifyLanguage,
  type CrossValidationResult,
  type LanguageIdModel,
} from "./langid";
import {
  runEval,
  type EvalPromptInput,
  type EvalOutputInput,
  type EvalReport,
} from "./runner";
import {
  calibrateThresholds,
  validateAutorater,
  type HumanCase,
  type AutoraterValidation,
} from "./autorater";
import { scoreAgainstReferences } from "./reference";

export interface EvalBundle {
  report: EvalReport;
  autorater: AutoraterValidation;
  langidCrossValidation: CrossValidationResult;
  corpus: {
    holdoutPrompts: number;
    goldAnswersTotal: number;
    goldAnswersOnHoldout: number;
    candidateOutputs: number;
    humanComparisons: number;
    /** Comparisons dropped because an output's prompt is not in the holdout set. */
    comparisonsOutsideHoldout: number;
    /**
     * Gold answers withheld from this report because their author did not
     * consent to benchmark use. Reported so the exclusion is auditable.
     */
    goldExcludedNoBenchmarkConsent: number;
  };
}

/**
 * Pull everything, score it, and validate the autorater. `prisma` is passed in
 * rather than imported so a script can supply its own client.
 */
export async function collectEvalBundle(
  prisma: PrismaClient,
): Promise<EvalBundle> {
  // ── prompts + gold ───────────────────────────────────────────────────────
  const promptRows = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    orderBy: { promptId: "asc" },
    select: { id: true, promptId: true, bucket: true, text: true },
  });

  // Consent is enforced in the QUERY, not downstream, so no code path in this
  // module can accidentally reach a non-consented answer.
  const allGold = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentBenchmark: true },
    select: { promptId: true, answerText: true, englishGloss: true },
  });
  const goldExcludedNoBenchmarkConsent = await prisma.coldAuthorAnswer.count({
    where: { isDemo: false, consentBenchmark: false },
  });

  const goldByPromptDbId = new Map<string, string[]>();
  for (const g of allGold) {
    if (!goldByPromptDbId.has(g.promptId)) goldByPromptDbId.set(g.promptId, []);
    goldByPromptDbId.get(g.promptId)!.push(g.answerText);
  }

  const prompts: EvalPromptInput[] = promptRows.map((p) => ({
    promptId: p.promptId,
    bucket: p.bucket ?? null,
    text: p.text,
    golds: goldByPromptDbId.get(p.id) ?? [],
  }));

  // ── candidate outputs on the frozen bank ─────────────────────────────────
  const holdoutDbIds = new Set(promptRows.map((p) => p.id));
  const promptIdByDbId = new Map(promptRows.map((p) => [p.id, p.promptId]));

  const outputRows = await prisma.modelOutput.findMany({
    where: {
      isDemo: false,
      promptId: { in: Array.from(holdoutDbIds) },
      candidateModelId: { not: null },
    },
    select: {
      promptId: true,
      outputText: true,
      candidateModel: { select: { id: true, name: true, archived: true } },
    },
  });

  const outputs: EvalOutputInput[] = [];
  for (const o of outputRows) {
    const cand = o.candidateModel;
    if (!cand || cand.archived) continue;
    const promptId = promptIdByDbId.get(o.promptId);
    if (!promptId) continue;
    outputs.push({
      candidateId: cand.id,
      candidateName: cand.name,
      promptId,
      text: o.outputText,
    });
  }

  // ── language-ID model, trained on everything we hold ──────────────────────
  const igalaTexts = allGold.map((g) => g.answerText).filter(Boolean);
  const englishTexts = [
    ...promptRows.map((p) => p.text),
    ...allGold
      .map((g) => g.englishGloss)
      .filter((g): g is string => Boolean(g && g.trim().length > 0)),
  ];
  const langModel: LanguageIdModel = buildLanguageIdModel({
    igalaTexts,
    englishTexts,
  });
  const langidCrossValidation = crossValidateLangId(
    igalaTexts,
    englishTexts,
    5,
  );

  const report = runEval({ prompts, outputs, langModel });

  // ── human comparisons -> autorater cases ─────────────────────────────────
  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { isDemo: false },
    select: {
      id: true,
      winner: true,
      failureTagsA: true,
      failureTagsB: true,
      modelOutputA: { select: { promptId: true, outputText: true } },
      modelOutputB: { select: { promptId: true, outputText: true } },
    },
  });

  const goldsByPromptId = new Map(prompts.map((p) => [p.promptId, p.golds]));

  const cases: HumanCase[] = [];
  let outsideHoldout = 0;
  for (const c of comparisons) {
    const aPromptId = promptIdByDbId.get(c.modelOutputA?.promptId ?? "");
    const bPromptId = promptIdByDbId.get(c.modelOutputB?.promptId ?? "");
    // A comparison on a non-frozen prompt still carries a human label and
    // failure tags; we keep it, but with chrf = null (unscorable), and count it
    // so the report can say how much of the label set is un-anchorable.
    if (!aPromptId || !bPromptId) outsideHoldout++;

    const textA = c.modelOutputA?.outputText ?? "";
    const textB = c.modelOutputB?.outputText ?? "";
    const goldsA = aPromptId ? (goldsByPromptId.get(aPromptId) ?? []) : [];
    const goldsB = bPromptId ? (goldsByPromptId.get(bPromptId) ?? []) : [];

    const langA = identifyLanguage(langModel, textA);
    const langB = identifyLanguage(langModel, textB);

    const winner =
      c.winner === "a" ||
      c.winner === "b" ||
      c.winner === "tie" ||
      c.winner === "both_inadequate"
        ? c.winner
        : "both_inadequate";

    cases.push({
      comparisonId: c.id,
      promptId: aPromptId ?? bPromptId ?? "unknown",
      winner,
      a: {
        chrf:
          goldsA.length > 0
            ? scoreAgainstReferences(textA, goldsA).best.chrf
            : null,
        isIgala: langA.isIgala,
        langTop: langA.top,
        langLowConfidence: langA.lowConfidence,
        failureTags: c.failureTagsA ?? [],
      },
      b: {
        chrf:
          goldsB.length > 0
            ? scoreAgainstReferences(textB, goldsB).best.chrf
            : null,
        isIgala: langB.isIgala,
        langTop: langB.top,
        langLowConfidence: langB.lowConfidence,
        failureTags: c.failureTagsB ?? [],
      },
    });
  }

  const thresholds = calibrateThresholds(report.ceiling.allGoldChrf);
  const autorater = validateAutorater(cases, thresholds);

  return {
    report,
    autorater,
    langidCrossValidation,
    corpus: {
      holdoutPrompts: promptRows.length,
      goldAnswersTotal: allGold.length,
      goldAnswersOnHoldout: prompts.reduce((s, p) => s + p.golds.length, 0),
      candidateOutputs: outputs.length,
      humanComparisons: cases.length,
      comparisonsOutsideHoldout: outsideHoldout,
      goldExcludedNoBenchmarkConsent,
    },
  };
}
