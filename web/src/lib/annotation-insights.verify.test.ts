import { describe, it, expect } from "vitest";
import {
  bothInadequateTagCounts,
  losingTagCounts,
  pairingSummaries,
  poolHeadline,
  weeklyInadequacy,
  type ComparisonRow,
} from "./annotation-insights";

/**
 * Adversarial cross-check of the Speakers' Verdict math: twenty mocked
 * comparisons whose aggregates were computed BY HAND, independently of the
 * implementation, then asserted against the library. The fixture deliberately
 * mixes every edge case at once - ties carrying (ignored) failure tags,
 * both-inadequate rows tagged on both sides, off-pool arms, a null-name
 * legacy row on each side, a self-pairing, and a silent gap week - so a
 * regression in any one aggregation cannot hide behind a clean fixture.
 */

const R = { name: "RAG v4", pool: true, taught: true };
const B = { name: "Baseline", pool: true, taught: false };
const O = { name: "Old SFT", pool: false, taught: true };
const N = { name: null, pool: false, taught: false };

type Arm = { name: string | null; pool: boolean; taught: boolean };

function row(
  a: Arm,
  b: Arm,
  winner: string,
  tagsA: string[],
  tagsB: string[],
  createdAt: Date,
): ComparisonRow {
  return {
    winner,
    failureTagsA: tagsA,
    failureTagsB: tagsB,
    createdAt,
    aName: a.name,
    bName: b.name,
    aInPool: a.pool,
    bInPool: b.pool,
    aCommunityTaught: a.taught,
    bCommunityTaught: b.taught,
  };
}

// Three observed weeks with a silent one between weeks 2 and 4.
const W1 = (d: number) => new Date(Date.UTC(2026, 1, d)); // week of 2026-02-02
const W2 = (d: number) => new Date(Date.UTC(2026, 1, d)); // week of 2026-02-09
const W4 = (d: number) => new Date(Date.UTC(2026, 1, d)); // week of 2026-02-23

const ROWS: ComparisonRow[] = [
  // ── rows 1-10: the pool pairing, week 1 ──────────────────────────────────
  row(R, B, "a", [], ["grammar"], W1(2)), // 1  R wins
  row(B, R, "b", ["grammar", "tone"], [], W1(2)), // 2  R wins as side b
  row(R, B, "a", [], ["wrong_word"], W1(3)), // 3  R wins
  row(B, R, "a", [], ["hallucination"], W1(3)), // 4  B wins, R (side b) tagged
  row(R, B, "b", ["grammar"], [], W1(4)), // 5  B wins as side b
  row(R, B, "tie", ["grammar"], ["tone"], W1(4)), // 6  tie - tags must NOT count
  row(R, B, "both_inadequate", ["not_igala"], ["not_igala", "grammar"], W1(5)), // 7
  row(R, B, "both_inadequate", [], ["english_mixed"], W1(5)), // 8
  row(R, B, "tie", [], [], W1(6)), // 9
  row(R, B, "a", [], ["tone"], W1(6)), // 10 R wins
  // ── rows 11-15: off-pool matchups, week 2 ────────────────────────────────
  row(R, O, "a", [], ["english_mixed"], W2(9)), // 11 R beats retired arm
  row(O, R, "a", [], ["grammar"], W2(10)), // 12 O wins, R tagged
  row(B, O, "b", ["wrong_word"], [], W2(11)), // 13 O wins as side b
  row(O, B, "tie", [], [], W2(12)), // 14
  row(O, R, "both_inadequate", ["not_igala"], ["grammar"], W2(13)), // 15
  // ── rows 16-20: legacy null-name rows and a self-pairing, week 4 ─────────
  row(N, B, "a", [], ["tone"], W4(23)), // 16 winner has no candidate row
  row(O, O, "a", [], ["grammar"], W4(24)), // 17 self-pairing, no verdict
  row(O, N, "b", ["hallucination"], [], W4(25)), // 18 null-name winner side
  row(O, B, "both_inadequate", ["tone"], ["tone"], W4(26)), // 19
  row(O, R, "b", ["english_mixed"], [], W4(27)), // 20 R beats retired arm
];

it("fixture really is the promised twenty comparisons", () => {
  expect(ROWS).toHaveLength(20);
});

describe("hand-computed pool headline", () => {
  // Pool matchups are rows 1-10 only (every other row has an off-pool or
  // null-name side). By hand: 6 decided (R wins 1,2,3,10; B wins 4,5),
  // 2 ties, 2 both-inadequate.
  it("matches the hand count", () => {
    const h = poolHeadline(ROWS);
    expect(h.poolComparisons).toBe(10);
    expect(h.poolDecided).toBe(6);
    expect(h.poolTies).toBe(2);
    expect(h.poolBothInadequate).toBe(2);
    expect(h.leaderName).toBe("RAG v4");
    expect(h.leaderWins).toBe(4);
    expect(h.leaderCommunityTaught).toBe(true);
    expect(h.runnerUpName).toBe("Baseline");
    expect(h.runnerUpWins).toBe(2);
  });
});

describe("hand-computed pairings", () => {
  it("only RAG v4 vs Baseline reaches five decided; sides merge across a/b", () => {
    const pairings = pairingSummaries(ROWS);
    // R::O has 3 decided, O::B has 1, the self-pairing and null-name rows
    // carry no pairing at all - so exactly one survives the threshold.
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toEqual({
      aName: "RAG v4",
      bName: "Baseline",
      aWins: 4,
      bWins: 2,
      ties: 2,
      bothInadequate: 2,
      decided: 6,
      total: 10,
      isCurrentPool: true,
    });
  });
});

describe("hand-computed tag counts", () => {
  it("losing-side tags: grammar 5, tone 3, then the three two-counts", () => {
    // Losers by hand: 1→B(grammar), 2→A(grammar,tone), 3→B(wrong_word),
    // 4→B(hallucination), 5→A(grammar), 10→B(tone), 11→B(english_mixed),
    // 12→B(grammar), 13→A(wrong_word), 16→B(tone), 17→B(grammar),
    // 18→A(hallucination), 20→A(english_mixed). Ties and both-inadequate
    // rows (6,7,8,9,14,15,19) contribute nothing here.
    expect(losingTagCounts(ROWS)).toEqual([
      { key: "grammar", count: 5 },
      { key: "tone", count: 3 },
      { key: "english_mixed", count: 2 },
      { key: "hallucination", count: 2 },
      { key: "wrong_word", count: 2 },
    ]);
  });

  it("both-inadequate tags come only from rows 7, 8, 15, 19 - both sides", () => {
    expect(bothInadequateTagCounts(ROWS)).toEqual([
      { key: "not_igala", count: 3 },
      { key: "grammar", count: 2 },
      { key: "tone", count: 2 },
      { key: "english_mixed", count: 1 },
    ]);
  });
});

describe("hand-computed weekly buckets", () => {
  it("counts per week and fills the silent week of Feb 16 with zeros", () => {
    expect(weeklyInadequacy(ROWS)).toEqual([
      { weekStart: "2026-02-02", total: 10, bothInadequate: 2 },
      { weekStart: "2026-02-09", total: 5, bothInadequate: 1 },
      { weekStart: "2026-02-16", total: 0, bothInadequate: 0 },
      { weekStart: "2026-02-23", total: 5, bothInadequate: 1 },
    ]);
  });
});
