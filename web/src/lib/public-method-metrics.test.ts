import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { computeMethodMetrics, type MethodMetrics } from "./method-metrics";
import {
  toPublicMethodMetrics,
  type PublicMethodMetrics,
} from "./public-method-metrics";
import { buildProtectedSet, checkStatic } from "./eval/leak-guard";

/**
 * GET /api/public/method-metrics is UNAUTHENTICATED. These tests pin down the
 * boundary: the projection carries counts, labels, scores and flags only, and
 * the SERIALIZED payload passes the leak guard's checkStatic against the
 * protected gold set - i.e. no gold answer string and no frozen prompt slug
 * survives into what the marketing site fetches. A negative control proves
 * the guard would actually catch a leak, so a green test means something.
 */

// ─── fake prisma (same fixture world as method-metrics.test.ts) ─────────────
// P1: golds "Omi" (annA, repeated) + "Ọmi" (annB); leaked via exemplar G-LEAK.
// P2: gold "Oji" (annB); clean.

const GOLD_FIXTURES = [
  { promptId: "ig_bank_orth_001", answerText: "Omi" },
  { promptId: "ig_bank_orth_001", answerText: "Ọmi" },
  { promptId: "ig_bank_lex_003", answerText: "Oji" },
];

function fakePrisma(): PrismaClient {
  const t = (n: number) => new Date(2026, 0, n);
  return {
    prompt: {
      findMany: async () => [
        { id: "P1", promptId: "ig_bank_orth_001" },
        { id: "P2", promptId: "ig_bank_lex_003" },
      ],
    },
    coldAuthorAnswer: {
      findMany: async (args: {
        where?: Record<string, unknown>;
        distinct?: string[];
      }) => {
        if (args.where?.consentBenchmark === true) {
          return [
            {
              promptId: "P1",
              answerText: "Omi",
              annotatorId: "annA",
              createdAt: t(1),
            },
            {
              promptId: "P1",
              answerText: "Omi",
              annotatorId: "annA",
              createdAt: t(2),
            },
            {
              promptId: "P1",
              answerText: "Ọmi",
              annotatorId: "annB",
              createdAt: t(3),
            },
            {
              promptId: "P2",
              answerText: "Oji",
              annotatorId: "annB",
              createdAt: t(4),
            },
          ];
        }
        if (args.distinct) {
          return [{ annotatorId: "annA" }, { annotatorId: "annB" }];
        }
        return [{ id: "G-LEAK", answerText: "Omi" }];
      },
      count: async () => 4,
    },
    modelOutput: {
      findMany: async () => {
        const plain = {
          name: "Plain GPT",
          kind: "baseline",
          versionLabel: null,
          archived: false,
        };
        const ragV2 = {
          name: "GPT + RAG v2",
          kind: "rag",
          versionLabel: "rag-v2",
          archived: false,
        };
        return [
          {
            promptId: "P1",
            outputText: "ámẹ́",
            ragContextIds: [],
            candidateModel: plain,
          },
          {
            promptId: "P2",
            outputText: "úchu",
            ragContextIds: [],
            candidateModel: plain,
          },
          {
            promptId: "P1",
            outputText: "Omi",
            ragContextIds: ["gold:G-LEAK"],
            candidateModel: ragV2,
          },
          {
            promptId: "P2",
            outputText: "Oji",
            ragContextIds: ["lex:L1"],
            candidateModel: ragV2,
          },
        ];
      },
    },
    pairwiseComparison: {
      count: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where ?? {};
        if (where.modelOutputA) {
          if (where.winner === "both_inadequate") return 1;
          if (where.winner) return 1;
          return 3;
        }
        return where.winner === "both_inadequate" ? 6 : 7;
      },
      findMany: async () => [{ annotatorId: "annA" }],
    },
    outputEdit: { findMany: async () => [] },
    parallelPair: { count: async () => 10, findMany: async () => [] },
    lexEntry: {
      count: async () => 5,
      findMany: async () => [{ id: "L1", headword: "Ẹga", gloss: "bird" }],
    },
    ragEntry: { findMany: async () => [] },
  } as unknown as PrismaClient;
}

async function publicPayload(): Promise<PublicMethodMetrics> {
  return toPublicMethodMetrics(await computeMethodMetrics(fakePrisma()));
}

// ─── the boundary itself ────────────────────────────────────────────────────

describe("public method-metrics payload - leak guard", () => {
  it("the serialized payload passes checkStatic against the protected set", async () => {
    const payload = await publicPayload();
    const protectedSet = buildProtectedSet(GOLD_FIXTURES);
    expect(protectedSet.length).toBeGreaterThan(0);

    const report = checkStatic(
      [
        {
          where: "GET /api/public/method-metrics",
          text: JSON.stringify(payload),
        },
      ],
      protectedSet,
    );
    expect(report.hits).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it("negative control: a payload that embeds a gold answer FAILS the guard", async () => {
    const payload = await publicPayload();
    const tampered = {
      ...payload,
      candidates: [
        { ...payload.candidates[0], name: "model trained on Omi data" },
      ],
    };
    const report = checkStatic(
      [{ where: "tampered", text: JSON.stringify(tampered) }],
      buildProtectedSet(GOLD_FIXTURES),
    );
    expect(report.pass).toBe(false);
  });

  it("carries no frozen prompt slugs and no per-prompt rows", async () => {
    const json = JSON.stringify(await publicPayload());
    expect(json).not.toContain("ig_bank_orth_001");
    expect(json).not.toContain("ig_bank_lex_003");
    // Cuid-shaped internal ids must not appear either.
    expect(json).not.toContain("G-LEAK");
    expect(json).not.toContain("annA");
    expect(json).not.toContain("annB");
  });
});

// ─── surface pinning: nothing rides across unannounced ──────────────────────

describe("public method-metrics payload - exact public surface", () => {
  it("exposes exactly the documented top-level keys", async () => {
    const payload = await publicPayload();
    expect(Object.keys(payload).sort()).toEqual([
      "agreementCeilingChrf",
      "benchmark",
      "candidates",
      "ceilings",
      "computedAt",
      "corpus",
      "poolPreference",
    ]);
    expect(Object.keys(payload.corpus).sort()).toEqual([
      "annotators",
      "goldAnswers",
      "lexEntries",
      "pairwiseBothInadequate",
      "pairwiseComparisons",
      "parallelPairs",
    ]);
    expect(Object.keys(payload.poolPreference).sort()).toEqual([
      "poolBothInadequate",
      "poolBothInadequateRate",
      "poolComparisons",
      "poolDecided",
    ]);
    expect(Object.keys(payload.benchmark).sort()).toEqual([
      "frozenPrompts",
      "leakFreePrompts",
      "leakedPrompts",
      "promptsWithGold",
    ]);
  });

  it("each candidate row exposes exactly the scoreboard fields", async () => {
    const payload = await publicPayload();
    expect(payload.candidates.length).toBeGreaterThan(0);
    for (const c of payload.candidates) {
      expect(Object.keys(c).sort()).toEqual(
        [
          "agreementCiHigh",
          "agreementCiLow",
          "agreementScore",
          "agreementUnderpowered",
          "approach",
          "n",
          "nClean",
          "strippedChrfAll",
          "strippedChrfClean",
          "name",
        ].sort(),
      );
    }
  });

  it("projects the numbers computeMethodMetrics computed, same order", async () => {
    const metrics = await computeMethodMetrics(fakePrisma());
    const payload = toPublicMethodMetrics(metrics);

    expect(payload.computedAt).toBe(metrics.computedAt);
    expect(payload.corpus.goldAnswers).toBe(4);
    expect(payload.corpus.annotators).toBe(2);
    expect(payload.benchmark).toEqual({
      frozenPrompts: 2,
      promptsWithGold: 2,
      leakedPrompts: 1,
      leakFreePrompts: 1,
    });
    expect(payload.poolPreference).toEqual({
      poolComparisons: 3,
      poolBothInadequate: 1,
      poolDecided: 1,
      poolBothInadequateRate: 0.3333,
    });
    // Best-first order preserved from MethodMetrics.
    expect(payload.candidates.map((c) => c.name)).toEqual(
      metrics.candidates.map((c) => c.name),
    );
    expect(payload.candidates[0].approach).toBe("retrieval v2");
  });
});

// ─── pure projection details ────────────────────────────────────────────────

function baseMetrics(): MethodMetrics {
  return {
    computedAt: "2026-08-28T00:00:00.000Z",
    corpus: {
      goldAnswers: 100,
      pairwiseComparisons: 200,
      pairwiseBothInadequate: 50,
      poolComparisons: 40,
      poolBothInadequate: 7,
      poolDecided: 30,
      parallelPairs: 300,
      lexEntries: 400,
      annotators: 6,
    },
    benchmark: {
      frozenPrompts: 43,
      promptsWithGold: 40,
      leakedPrompts: 17,
      leakFreePrompts: 26,
    },
    ceilings: {
      asShipped: {
        chrfAll: 63.23456,
        chrfClean: 55.55555,
        nPromptsAll: 30,
        nPromptsClean: 20,
      },
      onePerAnnotator: {
        chrfAll: 48.91,
        chrfClean: 46.06789,
        nPromptsAll: 28,
        nPromptsClean: 18,
      },
    },
    agreementCeilingChrf: 46.06789,
    candidates: [
      {
        name: "GPT + RAG v4",
        approach: "retrieval v4",
        n: 40,
        nClean: 26,
        strippedChrfAll: 41.98765,
        strippedChrfClean: 39.44444,
        agreementScore: 85.61234,
        agreementCiLow: 78.049,
        agreementCiHigh: 93.151,
        agreementUnderpowered: false,
      },
    ],
  };
}

describe("toPublicMethodMetrics - rounding", () => {
  it("rounds chrF-scale values to 1 decimal and the pool rate to 4", () => {
    const p = toPublicMethodMetrics(baseMetrics());
    expect(p.ceilings.asShipped.chrfAll).toBe(63.2);
    expect(p.ceilings.asShipped.chrfClean).toBe(55.6);
    expect(p.ceilings.onePerAnnotator.chrfClean).toBe(46.1);
    expect(p.agreementCeilingChrf).toBe(46.1);
    expect(p.candidates[0].strippedChrfAll).toBe(42);
    expect(p.candidates[0].strippedChrfClean).toBe(39.4);
    expect(p.candidates[0].agreementScore).toBe(85.6);
    expect(p.candidates[0].agreementCiLow).toBe(78);
    expect(p.candidates[0].agreementCiHigh).toBe(93.2);
    expect(p.poolPreference.poolBothInadequateRate).toBe(0.175);
  });

  it("passes nulls through untouched - honest degradation, never a made-up 0", () => {
    const m = baseMetrics();
    m.agreementCeilingChrf = null;
    m.ceilings.onePerAnnotator.chrfClean = null;
    m.candidates[0].agreementScore = null;
    m.candidates[0].agreementCiLow = null;
    m.candidates[0].agreementCiHigh = null;
    m.corpus.poolComparisons = 0;
    m.corpus.poolBothInadequate = 0;
    m.corpus.poolDecided = 0;
    const p = toPublicMethodMetrics(m);
    expect(p.agreementCeilingChrf).toBeNull();
    expect(p.ceilings.onePerAnnotator.chrfClean).toBeNull();
    expect(p.candidates[0].agreementScore).toBeNull();
    expect(p.candidates[0].agreementCiLow).toBeNull();
    expect(p.candidates[0].agreementCiHigh).toBeNull();
    expect(p.poolPreference.poolBothInadequateRate).toBe(0);
  });
});
