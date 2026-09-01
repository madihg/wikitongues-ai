import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  bothInadequateTagCounts,
  computeAnnotationInsights,
  corpusSplit,
  isCommunityTaught,
  losingTagCounts,
  pairingSummaries,
  poolHeadline,
  weekStartUtc,
  weeklyInadequacy,
  type ComparisonRow,
} from "./annotation-insights";

/**
 * The Speakers' Verdict page promises every number is computed live. These
 * tests pin down WHAT is computed: demo rows and seed accounts excluded in
 * the WHERE clause, the headline scoped to pool-arm matchups, losing-side
 * tags attributed to the correct side, both-inadequate tags kept separate,
 * weekly buckets with gap weeks filled, and recent examples carrying no
 * annotator identity.
 *
 * Prisma is injected, so a recorder fake stands in for the database - the
 * same pattern as src/lib/method-metrics.test.ts.
 */

interface RecordedCall {
  model: string;
  args: {
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
  };
}

const POOL_RAG = {
  name: "Gemini + RAG v3",
  kind: "rag",
  inPairingPool: true,
};
const POOL_BASE = {
  name: "Bare Gemini",
  kind: "baseline",
  inPairingPool: true,
};
const OLD_ARM = { name: "Old Claude", kind: "baseline", inPairingPool: false };

const t = (n: number) => new Date(Date.UTC(2026, 0, n));

/**
 * Fixture world: two pool arms (a community-taught RAG system vs an untouched
 * baseline) plus one retired arm. Six comparisons:
 *  1. pool, RAG wins (as "a"), loser tagged grammar+tone
 *  2. pool, RAG wins (as "b"), loser tagged grammar
 *  3. pool, baseline wins (as "a"), loser tagged wrong_word
 *  4. pool, tie
 *  5. pool, both_inadequate, both sides tagged
 *  6. old arm vs pool arm, RAG wins - must NOT count toward the headline
 */
function comparisonFixtures() {
  const out = (
    cm: typeof POOL_RAG | null,
    text: string,
    model = "legacy-model",
  ) => ({ outputText: text, model, candidateModel: cm });
  return [
    {
      winner: "a",
      failureTagsA: [],
      failureTagsB: ["grammar", "tone_marks"],
      explanation: "The second one is not how we say it.",
      createdAt: t(5),
      promptId: "P1",
      modelOutputA: out(POOL_RAG, "ẹ̀là kcírísítì"),
      modelOutputB: out(POOL_BASE, "greeting text"),
    },
    {
      winner: "b",
      failureTagsA: ["grammar"],
      failureTagsB: [],
      explanation: "B reads like real Igala.",
      createdAt: t(6),
      promptId: "P2",
      modelOutputA: out(POOL_BASE, "wrong order"),
      modelOutputB: out(POOL_RAG, "ójó dá"),
    },
    {
      winner: "a",
      failureTagsA: [],
      failureTagsB: ["wrong_word"],
      explanation: "A used the right word.",
      createdAt: t(7),
      promptId: "P1",
      modelOutputA: out(POOL_BASE, "short answer"),
      modelOutputB: out(POOL_RAG, "wrong word answer"),
    },
    {
      winner: "tie",
      failureTagsA: [],
      failureTagsB: [],
      explanation: "Both are fine.",
      createdAt: t(8),
      promptId: "P2",
      modelOutputA: out(POOL_RAG, "x"),
      modelOutputB: out(POOL_BASE, "y"),
    },
    {
      winner: "both_inadequate",
      failureTagsA: ["not_igala"],
      failureTagsB: ["grammar"],
      explanation: "Neither is usable.",
      createdAt: t(9),
      promptId: "P1",
      modelOutputA: out(POOL_RAG, "bad"),
      modelOutputB: out(POOL_BASE, "worse"),
    },
    // Off-pool matchup, decided in week 3: in pairings/tags/weekly/recent,
    // NOT in the pool headline.
    {
      winner: "a",
      failureTagsA: [],
      failureTagsB: ["english_mixed"],
      explanation: "The old model mixed English in.",
      createdAt: t(15),
      promptId: "P3",
      modelOutputA: out(POOL_RAG, "ágádá"),
      modelOutputB: out(OLD_ARM, "the old answer"),
    },
  ];
}

function fakePrisma(calls: RecordedCall[]): PrismaClient {
  return {
    pairwiseComparison: {
      findMany: async (args: RecordedCall["args"]) => {
        calls.push({ model: "pairwiseComparison", args });
        return comparisonFixtures();
      },
    },
    prompt: {
      findMany: async (args: RecordedCall["args"]) => {
        calls.push({ model: "prompt", args });
        return [
          { id: "P1", text: "How do you greet an elder in the morning?" },
          { id: "P2", text: "Say 'the rain has stopped'." },
          { id: "P3", text: "Name this tool." },
        ];
      },
    },
  } as unknown as PrismaClient;
}

async function run() {
  const calls: RecordedCall[] = [];
  const insights = await computeAnnotationInsights(fakePrisma(calls));
  return { calls, insights };
}

describe("computeAnnotationInsights - what the query enforces", () => {
  it("excludes demo rows and @test.com seed accounts in the WHERE clause", async () => {
    const { calls } = await run();
    const q = calls.find((c) => c.model === "pairwiseComparison")!;
    expect(q.args.where?.isDemo).toBe(false);
    expect(q.args.where?.annotator).toEqual({
      email: { not: { endsWith: "@test.com" } },
    });
  });

  it("never selects the annotator's identity for display", async () => {
    const { calls, insights } = await run();
    const q = calls.find((c) => c.model === "pairwiseComparison")!;
    expect(q.args.select).not.toHaveProperty("annotator");
    expect(q.args.select).not.toHaveProperty("annotatorId");
    for (const r of insights.recent) {
      expect(JSON.stringify(r)).not.toContain("annotator");
    }
  });
});

describe("poolHeadline", () => {
  it("counts only matchups where BOTH sides are current pool arms", async () => {
    const { insights } = await run();
    const h = insights.headline;
    // Comparison 6 (old arm on one side) is excluded everywhere here.
    expect(h.poolComparisons).toBe(5);
    expect(h.poolDecided).toBe(3);
    expect(h.poolTies).toBe(1);
    expect(h.poolBothInadequate).toBe(1);
  });

  it("names the leader by computed wins, on whichever side it appeared", async () => {
    const { insights } = await run();
    const h = insights.headline;
    // RAG won once as "a" and once as "b"; the baseline won once.
    expect(h.leaderName).toBe("Gemini + RAG v3");
    expect(h.leaderWins).toBe(2);
    expect(h.leaderCommunityTaught).toBe(true);
    expect(h.runnerUpName).toBe("Bare Gemini");
    expect(h.runnerUpWins).toBe(1);
  });

  it("degrades to no leader when nothing is decided", () => {
    const rows: ComparisonRow[] = [
      {
        winner: "both_inadequate",
        failureTagsA: [],
        failureTagsB: [],
        createdAt: t(1),
        aName: "X",
        bName: "Y",
        aInPool: true,
        bInPool: true,
        aCommunityTaught: false,
        bCommunityTaught: false,
      },
    ];
    const h = poolHeadline(rows);
    expect(h.poolComparisons).toBe(1);
    expect(h.poolDecided).toBe(0);
    expect(h.leaderName).toBeNull();
    expect(h.leaderWins).toBe(0);
  });
});

describe("pairingSummaries", () => {
  const row = (over: Partial<ComparisonRow>, winner = "a"): ComparisonRow => ({
    winner,
    failureTagsA: [],
    failureTagsB: [],
    createdAt: t(1),
    aName: "Alpha",
    bName: "Beta",
    aInPool: true,
    bInPool: true,
    aCommunityTaught: true,
    bCommunityTaught: false,
    ...over,
  });

  it("drops pairings under the decided threshold", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row({})),
      // Only 4 decided for Gamma vs Delta - below the threshold of 5.
      ...Array.from({ length: 4 }, () =>
        row({ aName: "Gamma", bName: "Delta", aInPool: false, bInPool: false }),
      ),
    ];
    const pairings = pairingSummaries(rows);
    expect(pairings).toHaveLength(1);
    expect(pairings[0].aName).toBe("Alpha");
  });

  it("merges both orderings of a pairing and puts the winner side first", () => {
    const rows = [
      // Zed wins 3 times as "a", twice as "b" -> 5 decided, Zed first.
      ...Array.from({ length: 3 }, () => row({ aName: "Zed", bName: "Ann" })),
      ...Array.from({ length: 2 }, () =>
        row({ aName: "Ann", bName: "Zed" }, "b"),
      ),
      row({ aName: "Ann", bName: "Zed" }, "tie"),
      row({ aName: "Zed", bName: "Ann" }, "both_inadequate"),
    ];
    const [p] = pairingSummaries(rows);
    expect(p.aName).toBe("Zed");
    expect(p.aWins).toBe(5);
    expect(p.bName).toBe("Ann");
    expect(p.bWins).toBe(0);
    expect(p.ties).toBe(1);
    expect(p.bothInadequate).toBe(1);
    expect(p.decided).toBe(5);
    expect(p.total).toBe(7);
  });

  it("features the current pool pairing first regardless of volume", () => {
    const rows = [
      // Big retired pairing: 10 decided.
      ...Array.from({ length: 10 }, () =>
        row({ aName: "OldA", bName: "OldB", aInPool: false, bInPool: false }),
      ),
      // Smaller pool pairing: 5 decided.
      ...Array.from({ length: 5 }, () => row({})),
    ];
    const pairings = pairingSummaries(rows);
    expect(pairings.map((p) => p.isCurrentPool)).toEqual([true, false]);
    expect(pairings[0].aName).toBe("Alpha");
  });

  it("skips rows without candidate names instead of inventing a pairing", () => {
    const rows = [row({ aName: null })];
    expect(pairingSummaries(rows, 0)).toHaveLength(0);
  });
});

describe("failure-tag aggregation", () => {
  it("attributes losing tags to the side that actually lost", async () => {
    const { insights } = await run();
    // Losers: comp1 side B (grammar, tone_marks), comp2 side A (grammar),
    // comp3 side B (wrong_word), comp6 side B (english_mixed).
    expect(insights.losingTags).toEqual([
      { key: "grammar", count: 2 },
      { key: "english_mixed", count: 1 },
      { key: "tone_marks", count: 1 },
      { key: "wrong_word", count: 1 },
    ]);
  });

  it("keeps both-inadequate tags separate from losing tags", async () => {
    const { insights } = await run();
    expect(insights.bothInadequateTags).toEqual([
      { key: "grammar", count: 1 },
      { key: "not_igala", count: 1 },
    ]);
  });

  it("counts nothing from ties", () => {
    const rows: ComparisonRow[] = [
      {
        winner: "tie",
        failureTagsA: ["grammar"],
        failureTagsB: ["grammar"],
        createdAt: t(1),
        aName: "X",
        bName: "Y",
        aInPool: true,
        bInPool: true,
        aCommunityTaught: false,
        bCommunityTaught: false,
      },
    ];
    expect(losingTagCounts(rows)).toEqual([]);
    expect(bothInadequateTagCounts(rows)).toEqual([]);
  });
});

describe("weekly inadequacy buckets", () => {
  it("weekStartUtc maps any day to its UTC Monday", () => {
    expect(weekStartUtc(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05"); // a Monday
    expect(weekStartUtc(new Date(Date.UTC(2026, 0, 8)))).toBe("2026-01-05"); // Thursday
    expect(weekStartUtc(new Date(Date.UTC(2026, 0, 11)))).toBe("2026-01-05"); // Sunday
    expect(weekStartUtc(new Date(Date.UTC(2026, 0, 12)))).toBe("2026-01-12"); // next Monday
  });

  it("buckets by week and fills gap weeks with zero totals", async () => {
    const { insights } = await run();
    // Fixtures span Jan 5-9 (week of Dec 29 for Jan 1-4? no: all Jan 5-9 ->
    // week 2026-01-05) and Jan 15 (week 2026-01-12).
    expect(insights.weekly).toEqual([
      { weekStart: "2026-01-05", total: 5, bothInadequate: 1 },
      { weekStart: "2026-01-12", total: 1, bothInadequate: 0 },
    ]);
  });

  it("fills a silent middle week so the axis never compresses time", () => {
    const rows: ComparisonRow[] = [1, 15].map((day) => ({
      winner: "both_inadequate",
      failureTagsA: [],
      failureTagsB: [],
      createdAt: t(day),
      aName: "X",
      bName: "Y",
      aInPool: true,
      bInPool: true,
      aCommunityTaught: false,
      bCommunityTaught: false,
    }));
    expect(weeklyInadequacy(rows)).toEqual([
      { weekStart: "2025-12-29", total: 1, bothInadequate: 1 },
      { weekStart: "2026-01-05", total: 0, bothInadequate: 0 },
      { weekStart: "2026-01-12", total: 1, bothInadequate: 1 },
    ]);
  });

  it("returns nothing for no rows", () => {
    expect(weeklyInadequacy([])).toEqual([]);
  });
});

describe("recent decided examples", () => {
  it("returns the newest decided comparisons with winner/loser resolved", async () => {
    const { insights } = await run();
    expect(insights.recent).toHaveLength(4); // only 4 decided exist
    const [newest] = insights.recent;
    expect(newest.promptText).toBe("Name this tool.");
    expect(newest.winnerName).toBe("Gemini + RAG v3");
    expect(newest.loserName).toBe("Old Claude");
    expect(newest.winnerOutput).toBe("ágádá");
    expect(newest.loserOutput).toBe("the old answer");
    expect(newest.explanation).toBe("The old model mixed English in.");
    expect(newest.loserTags).toEqual(["english_mixed"]);
    // Newest first.
    expect(insights.recent.map((r) => r.createdAt.slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-01-07",
      "2026-01-06",
      "2026-01-05",
    ]);
  });

  it("resolves winner/loser when the winner sat on side B", async () => {
    const { insights } = await run();
    const sideB = insights.recent.find(
      (r) => r.explanation === "B reads like real Igala.",
    )!;
    expect(sideB.winnerName).toBe("Gemini + RAG v3");
    expect(sideB.winnerOutput).toBe("ójó dá");
    expect(sideB.loserName).toBe("Bare Gemini");
    expect(sideB.loserTags).toEqual(["grammar"]);
  });
});

describe("corpusSplit", () => {
  it("splits every comparison into current-pool and retired-arm halves", async () => {
    const { insights } = await run();
    const c = insights.corpus;
    // Five pool matchups (3 decided, 1 tie, 1 both-inadequate) plus one
    // decided matchup against the retired arm.
    expect(c.allComparisons).toBe(6);
    expect(c.allDecided).toBe(4);
    expect(c.allBothInadequate).toBe(1);
    expect(c.poolComparisons).toBe(5);
    expect(c.poolDecided).toBe(3);
    expect(c.poolBothInadequate).toBe(1);
    expect(c.legacyComparisons).toBe(1);
    expect(c.legacyDecided).toBe(1);
    expect(c.legacyBothInadequate).toBe(0);
  });

  it("keeps the halves exhaustive, so the reconciliation sentence adds up", async () => {
    const { insights } = await run();
    const c = insights.corpus;
    expect(c.poolComparisons + c.legacyComparisons).toBe(c.allComparisons);
    expect(c.poolDecided + c.legacyDecided).toBe(c.allDecided);
    expect(c.poolBothInadequate + c.legacyBothInadequate).toBe(
      c.allBothInadequate,
    );
  });

  it("agrees with poolHeadline on the pool-side counts", async () => {
    const { insights } = await run();
    expect(insights.corpus.poolComparisons).toBe(
      insights.headline.poolComparisons,
    );
    expect(insights.corpus.poolDecided).toBe(insights.headline.poolDecided);
    expect(insights.corpus.poolBothInadequate).toBe(
      insights.headline.poolBothInadequate,
    );
  });

  it("counts a matchup as legacy when either side is off the pool", () => {
    const row = (
      aInPool: boolean,
      bInPool: boolean,
      winner: string,
    ): ComparisonRow => ({
      winner,
      failureTagsA: [],
      failureTagsB: [],
      createdAt: new Date(Date.UTC(2026, 0, 1)),
      aName: "A",
      bName: "B",
      aInPool,
      bInPool,
      aCommunityTaught: false,
      bCommunityTaught: false,
    });
    const c = corpusSplit([
      row(true, false, "a"),
      row(false, true, "both_inadequate"),
      row(false, false, "tie"),
      row(true, true, "b"),
    ]);
    expect(c.legacyComparisons).toBe(3);
    expect(c.poolComparisons).toBe(1);
    expect(c.poolDecided).toBe(1);
    expect(c.legacyDecided).toBe(1);
    expect(c.legacyBothInadequate).toBe(1);
  });

  it("returns all zeros for an empty corpus rather than NaN", () => {
    expect(corpusSplit([])).toEqual({
      allComparisons: 0,
      allDecided: 0,
      allBothInadequate: 0,
      poolComparisons: 0,
      poolDecided: 0,
      poolBothInadequate: 0,
      legacyComparisons: 0,
      legacyDecided: 0,
      legacyBothInadequate: 0,
    });
  });
});

describe("isCommunityTaught", () => {
  it("is false only for untouched baselines and unknown candidates", () => {
    expect(isCommunityTaught("baseline")).toBe(false);
    expect(isCommunityTaught(undefined)).toBe(false);
    for (const kind of ["rag", "sft", "dpo", "continued_pretrain", "composite"])
      expect(isCommunityTaught(kind)).toBe(true);
  });
});
