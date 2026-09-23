import { describe, it, expect } from "vitest";
import { buildHumanRounds, type HumanRoundRow } from "./human-rounds";
import { POOL_ROUNDS } from "./era";

/**
 * The arithmetic behind the public "out of every 10 questions" chart. What
 * these pin: the stored A/B position never changes which arm a win is
 * credited to; rounds are assigned by the fixed boundaries and reconcile
 * with the all-time count; per-ten is a scaling of the counts, never a
 * derivation that could count a tie as a win; and an empty round is zeros,
 * not NaN.
 */

const PLAIN: HumanRoundRow["a"] = {
  name: "Gemini 3.1 Pro",
  kind: "baseline",
  versionLabel: null,
  provider: "google",
};
const OURS: HumanRoundRow["a"] = {
  name: "Gemini 3.1 Pro + Igala RAG v3",
  kind: "rag",
  versionLabel: "rag-v3",
  provider: "google",
};
const d = (iso: string) => new Date(iso);

function row(
  createdAt: string,
  winner: string,
  a = PLAIN,
  b = OURS,
): HumanRoundRow {
  return { createdAt: d(createdAt), winner, a, b };
}

describe("buildHumanRounds", () => {
  it("credits a win to the ARM regardless of which side it was shown on", () => {
    // Same arm wins four times: twice shown as A, twice shown as B.
    const rows = [
      row("2026-08-25T00:00:00Z", "b", PLAIN, OURS), // ours as B
      row("2026-08-26T00:00:00Z", "a", OURS, PLAIN), // ours as A
      row("2026-09-14T00:00:00Z", "b", PLAIN, OURS),
      row("2026-09-15T00:00:00Z", "a", OURS, PLAIN),
    ];
    const [pair] = buildHumanRounds(rows);
    // Pair orientation is by name sort: "Gemini 3.1 Pro" < "Gemini 3.1 Pro + ..."
    expect(pair.a.name).toBe(PLAIN.name);
    expect(pair.b.name).toBe(OURS.name);
    expect(pair.all.bWins).toBe(4);
    expect(pair.all.aWins).toBe(0);
  });

  it("assigns rounds by the fixed boundaries and reconciles with all-time", () => {
    const rows = [
      row("2026-08-21T00:00:00Z", "b"),
      row("2026-09-12T23:59:59Z", "tie"),
      row("2026-09-13T00:00:00Z", "both_inadequate"), // first instant of round 2
      row("2026-09-20T00:00:00Z", "a"),
    ];
    const [pair] = buildHumanRounds(rows, POOL_ROUNDS);
    const r1 = pair.rounds.find((r) => r.key === "round-1")!;
    const r2 = pair.rounds.find((r) => r.key === "round-2")!;
    expect(r1).toMatchObject({
      n: 2,
      bWins: 1,
      ties: 1,
      aWins: 0,
      bothInadequate: 0,
    });
    expect(r2).toMatchObject({
      n: 2,
      aWins: 1,
      bothInadequate: 1,
      bWins: 0,
      ties: 0,
    });
    expect(pair.all.n).toBe(r1.n + r2.n);
  });

  it("scales counts to 10 with one decimal and never derives a win by subtraction", () => {
    const rows = [
      ...Array.from({ length: 96 }, (_, i) =>
        row(`2026-09-1${4 + (i % 5)}T00:00:00Z`, "b"),
      ),
      ...Array.from({ length: 66 }, () => row("2026-09-16T00:00:00Z", "a")),
      ...Array.from({ length: 77 }, () => row("2026-09-17T00:00:00Z", "tie")),
      ...Array.from({ length: 33 }, () =>
        row("2026-09-18T00:00:00Z", "both_inadequate"),
      ),
    ];
    const [pair] = buildHumanRounds(rows);
    const r2 = pair.rounds.find((r) => r.key === "round-2")!;
    expect(r2.n).toBe(272);
    expect(r2.perTen).toEqual({ a: 2.4, b: 3.5, tie: 2.8, neither: 1.2 });
    // Ties and rejections are counted, so the four shares sum to 10 within rounding.
    const sum = r2.perTen.a + r2.perTen.b + r2.perTen.tie + r2.perTen.neither;
    expect(Math.abs(sum - 10)).toBeLessThan(0.15);
  });

  it("gives an empty round zeros, not NaN, and skips same-arm rows", () => {
    const rows = [
      row("2026-09-14T00:00:00Z", "a"),
      row("2026-09-14T00:00:00Z", "a", PLAIN, PLAIN),
    ];
    const [pair] = buildHumanRounds(rows);
    const r1 = pair.rounds.find((r) => r.key === "round-1")!;
    expect(r1.n).toBe(0);
    expect(r1.perTen).toEqual({ a: 0, b: 0, tie: 0, neither: 0 });
    expect(pair.all.n).toBe(1);
    expect(buildHumanRounds([])).toEqual([]);
  });

  it("orders pairs busiest first, so the public chart draws the main comparison", () => {
    const OTHER = {
      name: "Claude Opus 5",
      kind: "baseline",
      versionLabel: null,
      provider: "openrouter",
    };
    const rows = [
      row("2026-09-14T00:00:00Z", "a", OTHER, OURS),
      row("2026-09-14T00:00:00Z", "b"),
      row("2026-09-15T00:00:00Z", "b"),
    ];
    const pairs = buildHumanRounds(rows);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].all.n).toBe(2);
    expect(pairs[0].a.name).toBe(PLAIN.name);
  });
});
