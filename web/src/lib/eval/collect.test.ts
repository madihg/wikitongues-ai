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

/**
 * REGRESSION GUARD FOR THE PIVOT'S HARD INVARIANT
 * (tasks/annotation-pivot-decision.md): edited text
 * (OutputEdit.correctedText) must NEVER enter the frozen benchmark's gold.
 * Today that is structurally true - the collector reads references only from
 * ColdAuthorAnswer - but "structurally true" survives exactly until someone
 * adds a second reader. This proxy records EVERY delegate the collector
 * touches on the injected client, so a future `prisma.outputEdit.*` call (or
 * any new table read) fails here loudly instead of silently widening the
 * gold path.
 */
function proxyRecorder(
  calls: RecordedCall[],
  accessedModels: Set<string>,
): PrismaClient {
  const inner = recorderPrisma(calls) as unknown as Record<string, unknown>;
  return new Proxy(inner, {
    get(target, prop) {
      const name = String(prop);
      accessedModels.add(name);
      if (name in target) return target[name];
      // An unknown delegate still records its calls (so the assertion below
      // reports WHAT was queried) instead of crashing with a vague TypeError.
      return {
        findMany: async (args: unknown) => {
          calls.push({ model: name, args });
          return [];
        },
        count: async (args: unknown) => {
          calls.push({ model: `${name}.count`, args });
          return 0;
        },
      };
    },
  }) as unknown as PrismaClient;
}

describe("collectEvalBundle - edited text can never reach the benchmark gold", () => {
  it("never queries OutputEdit anywhere in the eval collection path", async () => {
    const calls: RecordedCall[] = [];
    const accessed = new Set<string>();
    await collectEvalBundle(proxyRecorder(calls, accessed));

    expect(accessed.has("outputEdit")).toBe(false);
    expect(calls.some((c) => c.model.startsWith("outputEdit"))).toBe(false);
  });

  it("reads ONLY the four sanctioned tables, so any new reader fails loudly", async () => {
    const calls: RecordedCall[] = [];
    const accessed = new Set<string>();
    await collectEvalBundle(proxyRecorder(calls, accessed));

    const allowed = new Set([
      "prompt",
      "coldAuthorAnswer",
      "modelOutput",
      "pairwiseComparison",
    ]);
    for (const model of accessed) {
      expect(
        allowed.has(model),
        `collectEvalBundle read "${model}" - a table outside the benchmark's ` +
          `sanctioned gold path. If this is intentional, prove the new read ` +
          `cannot carry OutputEdit/edited text before widening this list.`,
      ).toBe(true);
    }
  });

  it("gold references come exclusively from ColdAuthorAnswer", async () => {
    const calls: RecordedCall[] = [];
    const accessed = new Set<string>();
    const bundle = await collectEvalBundle(proxyRecorder(calls, accessed));

    // The one gold read, and the report scores against it: an OutputEdit row
    // has no path into `golds` because its table is never touched at all.
    expect(calls.filter((c) => c.model === "coldAuthorAnswer")).toHaveLength(1);
    expect(bundle.report.nPromptsWithGold).toBe(1);
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
