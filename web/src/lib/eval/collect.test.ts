import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { collectEvalBundle } from "./collect";

/**
 * REGRESSION GUARD FOR A CONSENT RULE.
 *
 * `ColdAuthorAnswer.consentBenchmark` is a permission a speaker actually
 * withholds: "you may NOT use my answer to benchmark models". It defaults to
 * true, it has a writer (the annotation submit route), and until this eval
 * harness existed it had ZERO readers - so the flag looked implemented from
 * every angle except the only one that counts.
 *
 * `collect.ts` now enforces it in the QUERY. That enforcement is one careless
 * refactor away from disappearing, and nothing else in the codebase would
 * notice: no number moves, no other test breaks, and the excluded speakers'
 * text would quietly re-enter the benchmark. A comment in a file header is not
 * a control. These tests are.
 *
 * The Prisma client is injected (`collectEvalBundle(prisma)`), so we can hand it
 * a recorder and assert on the WHERE clauses it actually issues, with no
 * database involved.
 */

interface RecordedCall {
  model: string;
  args: unknown;
}

function recorderPrisma(calls: RecordedCall[]) {
  const record = (model: string, result: unknown) => ({
    findMany: async (args: unknown) => {
      calls.push({ model, args });
      return result;
    },
    count: async (args: unknown) => {
      calls.push({ model: `${model}.count`, args });
      return 0;
    },
  });

  return {
    prompt: record("prompt", [
      {
        id: "db1",
        promptId: "ig_bank_orth_001",
        bucket: "orthography",
        text: "Give the Igala word for 'water'.",
      },
    ]),
    coldAuthorAnswer: record("coldAuthorAnswer", [
      { promptId: "db1", answerText: "Omi", englishGloss: "water" },
      { promptId: "db1", answerText: "Ómi", englishGloss: "water" },
    ]),
    modelOutput: record("modelOutput", [
      {
        promptId: "db1",
        outputText: "Omi",
        candidateModel: { id: "c1", name: "Test candidate", archived: false },
      },
    ]),
    pairwiseComparison: record("pairwiseComparison", []),
  } as unknown as PrismaClient;
}

function whereFor(
  calls: RecordedCall[],
  model: string,
): Record<string, unknown> {
  const call = calls.find((c) => c.model === model);
  expect(call, `no query issued against ${model}`).toBeDefined();
  return (call!.args as { where: Record<string, unknown> }).where;
}

describe("collectEvalBundle - consent is enforced in the query", () => {
  it("only ever reads gold whose author consented to BENCHMARK use", async () => {
    const calls: RecordedCall[] = [];
    await collectEvalBundle(recorderPrisma(calls));

    const where = whereFor(calls, "coldAuthorAnswer");
    // The rule. If this assertion is ever "fixed" by deleting it, read the
    // header of this file first: 8 real speakers withheld this permission.
    expect(where.consentBenchmark).toBe(true);
    expect(where.isDemo).toBe(false);
  });

  it("issues exactly ONE gold query, so the filter cannot be bypassed elsewhere", async () => {
    const calls: RecordedCall[] = [];
    await collectEvalBundle(recorderPrisma(calls));

    // Both uses of gold in this module - scoring references AND the Igala
    // language profile - are fed from the same consented result set. A second,
    // unfiltered gold read would be the obvious way to reintroduce the bug.
    const goldReads = calls.filter((c) => c.model === "coldAuthorAnswer");
    expect(goldReads).toHaveLength(1);
  });

  it("counts the excluded answers instead of dropping them silently", async () => {
    const calls: RecordedCall[] = [];
    const bundle = await collectEvalBundle(recorderPrisma(calls));

    const countWhere = whereFor(calls, "coldAuthorAnswer.count");
    expect(countWhere.consentBenchmark).toBe(false);
    expect(countWhere.isDemo).toBe(false);
    expect(bundle.corpus).toHaveProperty("goldExcludedNoBenchmarkConsent");
  });

  it("never reads demo records into the benchmark", async () => {
    const calls: RecordedCall[] = [];
    await collectEvalBundle(recorderPrisma(calls));

    for (const model of [
      "coldAuthorAnswer",
      "modelOutput",
      "pairwiseComparison",
    ]) {
      expect(whereFor(calls, model).isDemo, `${model} must exclude demo`).toBe(
        false,
      );
    }
  });

  it("scores only held-out prompts", async () => {
    const calls: RecordedCall[] = [];
    await collectEvalBundle(recorderPrisma(calls));

    const where = whereFor(calls, "prompt");
    expect(where.isHoldout).toBe(true);
    expect(where.language).toBe("igala");
  });
});

describe("collectEvalBundle - end to end on injected data", () => {
  it("produces a scored report from the recorder's rows", async () => {
    const bundle = await collectEvalBundle(recorderPrisma([]));

    expect(bundle.corpus.holdoutPrompts).toBe(1);
    expect(bundle.report.nPromptsWithGold).toBe(1);
    expect(bundle.report.candidates).toHaveLength(1);
    // "Omi" exactly matches one of the two gold answers.
    const chrf = bundle.report.candidates[0].overall.find(
      (c) => c.metric === "chrf",
    )!;
    expect(chrf.best.mean).toBeCloseTo(1, 6);
    // One gold prompt with 2 answers yields a computable ceiling.
    expect(bundle.report.ceiling.nPromptsWithCeiling).toBe(1);
    // No human labels supplied, so the autorater must say it is unvalidated.
    expect(bundle.autorater.overall.n).toBe(0);
    expect(bundle.autorater.headline).toMatch(/entirely unvalidated/);
  });
});
