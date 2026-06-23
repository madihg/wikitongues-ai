import { describe, it, expect } from "vitest";
import { bradleyTerry, type PairwiseObservation } from "./bradley-terry";

function games(
  a: string,
  b: string,
  aWins: number,
  bWins: number,
): PairwiseObservation[] {
  const out: PairwiseObservation[] = [];
  for (let i = 0; i < aWins; i++) out.push({ a, b, winner: "a" });
  for (let i = 0; i < bWins; i++) out.push({ a, b, winner: "b" });
  return out;
}

describe("bradleyTerry", () => {
  it("returns empty result for no observations", () => {
    const r = bradleyTerry([]);
    expect(r.candidates).toHaveLength(0);
    expect(r.distinguishable).toBe(false);
    expect(r.nObservations).toBe(0);
  });

  it("ranks a clear winner first with a clean dominant record", () => {
    // X beats Y decisively, many games.
    const obs = games("X", "Y", 18, 2);
    const r = bradleyTerry(obs);
    expect(r.nCandidates).toBe(2);
    expect(r.candidates[0].id).toBe("X");
    expect(r.candidates[0].rank).toBe(1);
    expect(r.candidates[0].prob).toBeGreaterThan(r.candidates[1].prob);
    expect(r.candidates[0].wins).toBe(18);
    expect(r.candidates[0].losses).toBe(2);
    expect(r.distinguishable).toBe(true);
  });

  it("marks a near-tie as not distinguishable", () => {
    // X and Y split evenly — CIs should overlap.
    const obs = games("X", "Y", 10, 10);
    const r = bradleyTerry(obs);
    expect(r.distinguishable).toBe(false);
    // strengths should be close
    expect(Math.abs(r.candidates[0].prob - r.candidates[1].prob)).toBeLessThan(
      0.2,
    );
  });

  it("treats ties as half a win to each side", () => {
    const obs: PairwiseObservation[] = Array.from({ length: 12 }, () => ({
      a: "X",
      b: "Y",
      winner: "tie" as const,
    }));
    const r = bradleyTerry(obs);
    expect(r.candidates[0].ties).toBe(12);
    expect(Math.abs(r.candidates[0].prob - r.candidates[1].prob)).toBeLessThan(
      0.05,
    );
    expect(r.distinguishable).toBe(false);
  });

  it("is underpowered (not distinguishable) below the minimum-observations floor", () => {
    const obs = games("X", "Y", 3, 0); // only 3 games
    const r = bradleyTerry(obs);
    expect(r.nObservations).toBe(3);
    expect(r.distinguishable).toBe(false);
  });

  it("produces a transitive ranking across three candidates", () => {
    // A > B > C
    const obs = [
      ...games("A", "B", 15, 5),
      ...games("B", "C", 15, 5),
      ...games("A", "C", 18, 2),
    ];
    const r = bradleyTerry(obs);
    const order = r.candidates.map((c) => c.id);
    expect(order).toEqual(["A", "B", "C"]);
    expect(r.candidates[0].prob).toBeGreaterThan(r.candidates[2].prob);
  });

  it("is order-invariant: swapping which side is A/B does not change the ranking", () => {
    const forward = games("X", "Y", 16, 4);
    const swapped: PairwiseObservation[] = forward.map((o) => ({
      a: o.b,
      b: o.a,
      winner: o.winner === "a" ? "b" : o.winner === "b" ? "a" : "tie",
    }));
    const r1 = bradleyTerry(forward);
    const r2 = bradleyTerry(swapped);
    expect(r1.candidates[0].id).toBe("X");
    expect(r2.candidates[0].id).toBe("X");
    expect(
      Math.abs(r1.candidates[0].prob - r2.candidates[0].prob),
    ).toBeLessThan(0.05);
  });
});
