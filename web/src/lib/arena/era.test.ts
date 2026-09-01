import { describe, it, expect } from "vitest";
import {
  ARENA_ERA_LABELS,
  DEFAULT_ARENA_ERA,
  MIN_DECIDED_PER_CANDIDATE,
  buildEraSlice,
  decidedByCandidate,
  derivePivotAt,
  eraSplit,
  selectEra,
  type ArenaComparisonRow,
} from "./era";

/**
 * What these tests hold in place is the difference between the old table and
 * the fixed one: which rows the fit sees, which candidates earn a row, and
 * whether an empty window says so in words instead of drawing a grid of 50s.
 *
 * The fixture is the shape of the real corpus in miniature: a long early era
 * where speakers rejected both answers, then a pivot after which two pool arms
 * are actually decided between, plus one straggler with a single decided vote.
 */

const day = (d: number) => new Date(Date.UTC(2026, 7, d, 12, 0, 0));

function row(
  a: string,
  b: string,
  outcome: string,
  d: number,
  opts: {
    bucket?: ArenaComparisonRow["bucket"];
    aInPool?: boolean;
    bInPool?: boolean;
  } = {},
): ArenaComparisonRow {
  return {
    candidateA: a,
    candidateB: b,
    outcome,
    bucket: opts.bucket ?? "authenticity",
    createdAt: day(d),
    aInPool: opts.aInPool ?? false,
    bInPool: opts.bInPool ?? false,
  };
}

const POOL = { aInPool: true, bInPool: true };

/** 6 pre-pivot comparisons between retired arms (1 decided, the rest both
 * rejected), then 12 post-pivot pool comparisons (10 decided), then one
 * straggler comparison involving a retired arm after the pivot. */
function corpus(): ArenaComparisonRow[] {
  const rows: ArenaComparisonRow[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push(row("old-x", "old-y", "both_inadequate", 1 + i));
  }
  rows.push(row("old-x", "old-y", "a", 6));
  for (let i = 0; i < 7; i++) {
    rows.push(row("pool-rag", "pool-base", "a", 20 + i, POOL));
  }
  for (let i = 0; i < 3; i++) {
    rows.push(row("pool-rag", "pool-base", "b", 27 + i, POOL));
  }
  rows.push(row("pool-rag", "pool-base", "tie", 30, POOL));
  rows.push(row("pool-rag", "pool-base", "both_inadequate", 30, POOL));
  // A straggler: one decided vote for a retired arm, after the pivot.
  rows.push(row("pool-rag", "old-x", "a", 28, { aInPool: true }));
  return rows;
}

const CANDIDATES = ["pool-rag", "pool-base", "old-x", "old-y", "never-run"];

describe("derivePivotAt", () => {
  it("is the first comparison involving a candidate in the pairing pool", () => {
    const pivot = derivePivotAt(corpus());
    expect(pivot).not.toBeNull();
    // Day 20 is the first pool comparison; days 1-6 are the retired era.
    expect(pivot?.toISOString()).toBe(day(20).toISOString());
  });

  it("ignores earlier comparisons between retired arms", () => {
    const rows = [
      row("old-x", "old-y", "both_inadequate", 1),
      row("pool-rag", "pool-base", "a", 9, POOL),
      row("old-x", "old-y", "a", 5),
    ];
    expect(derivePivotAt(rows)?.toISOString()).toBe(day(9).toISOString());
  });

  it("counts a comparison where only one side is a pool arm", () => {
    const rows = [
      row("old-x", "old-y", "a", 4),
      row("pool-rag", "old-x", "a", 7, { aInPool: true }),
      row("pool-rag", "pool-base", "a", 12, POOL),
    ];
    expect(derivePivotAt(rows)?.toISOString()).toBe(day(7).toISOString());
  });

  it("is null when no pool arm has been compared yet", () => {
    expect(derivePivotAt([row("old-x", "old-y", "a", 3)])).toBeNull();
  });
});

describe("selectEra", () => {
  it("keeps everything at or after the pivot, and nothing before it", () => {
    const rows = corpus();
    const pivot = derivePivotAt(rows);
    const since = selectEra(rows, "since_pivot", pivot);
    expect(since).toHaveLength(13); // 12 pool + 1 straggler
    expect(since.every((r) => r.createdAt >= (pivot as Date))).toBe(true);
    // The pivot comparison itself is inside the window, not before it.
    expect(
      since.some((r) => r.createdAt.getTime() === (pivot as Date).getTime()),
    ).toBe(true);
  });

  it("returns every row for all time", () => {
    const rows = corpus();
    expect(selectEra(rows, "all_time", derivePivotAt(rows))).toHaveLength(
      rows.length,
    );
  });

  it("is empty rather than silently all-time when there is no pivot", () => {
    const rows = [row("old-x", "old-y", "a", 3)];
    expect(selectEra(rows, "since_pivot", null)).toHaveLength(0);
  });
});

describe("decidedByCandidate", () => {
  it("counts a picked side, never a tie or a rejection of both answers", () => {
    const rows = [
      row("x", "y", "a", 1),
      row("x", "y", "tie", 2),
      row("x", "y", "both_inadequate", 3),
      row("x", "y", "b", 4),
    ];
    const counts = decidedByCandidate(rows);
    expect(counts.get("x")).toEqual({ decided: 2, games: 4 });
    expect(counts.get("y")).toEqual({ decided: 2, games: 4 });
  });
});

describe("buildEraSlice - the era filter", () => {
  const rows = corpus();
  const pivotAt = derivePivotAt(rows);

  it("fits the post-pivot window on the post-pivot rows only", () => {
    const slice = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    expect(slice.comparisons).toBe(13);
    expect(slice.decided).toBe(11); // 10 pool + 1 straggler
    expect(slice.ties).toBe(1);
    expect(slice.bothInadequate).toBe(1);
    expect(slice.windowStart).toBe(day(20).toISOString());
    expect(slice.rows.map((r) => r.candidateId).sort()).toEqual([
      "pool-base",
      "pool-rag",
    ]);
  });

  it("keeps the retired era when asked for all time", () => {
    const slice = buildEraSlice(rows, {
      era: "all_time",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    expect(slice.comparisons).toBe(rows.length);
    expect(slice.decided).toBe(12); // 11 post-pivot + 1 pre-pivot
    expect(slice.bothInadequate).toBe(6);
    expect(slice.windowStart).toBeNull();
  });

  it("does not let the pre-pivot era into the default window's counts", () => {
    const since = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    const all = buildEraSlice(rows, {
      era: "all_time",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    // The whole point: the decided rate is far higher inside the window.
    expect(since.decided / since.comparisons).toBeGreaterThan(
      all.decided / all.comparisons,
    );
  });
});

describe("buildEraSlice - the sparsity gate", () => {
  const rows = corpus();
  const pivotAt = derivePivotAt(rows);
  const slice = buildEraSlice(rows, {
    era: "since_pivot",
    pivotAt,
    candidateIds: CANDIDATES,
  });

  it("carries the threshold it used, single-sourced from the constant", () => {
    expect(slice.minDecided).toBe(MIN_DECIDED_PER_CANDIDATE);
  });

  it("gives a row only to candidates at or above the threshold", () => {
    for (const r of slice.rows) {
      expect(r.decided).toBeGreaterThanOrEqual(MIN_DECIDED_PER_CANDIDATE);
    }
    expect(slice.rows.map((r) => r.candidateId)).toContain("pool-rag");
  });

  it("collapses the ones below it into counts, hiding nobody", () => {
    const below = new Map(
      slice.belowGate.map((s) => [s.candidateId, s.decided]),
    );
    // old-x has exactly one decided vote inside the window: shown as 1, not
    // as a strength and not as a missing row.
    expect(below.get("old-x")).toBe(1);
    // A candidate with no comparisons at all in the window is still listed.
    expect(below.get("never-run")).toBe(0);
    expect(below.get("old-y")).toBe(0);
    // Every registered candidate is either a row or a counted shortfall.
    const accounted = [
      ...slice.rows.map((r) => r.candidateId),
      ...slice.belowGate.map((s) => s.candidateId),
    ].sort();
    expect(accounted).toEqual([...CANDIDATES].sort());
  });

  it("counts games as well as decided votes for the shortfall list", () => {
    const oldX = slice.belowGate.find((s) => s.candidateId === "old-x");
    expect(oldX).toEqual({ candidateId: "old-x", decided: 1, games: 1 });
  });

  it("honours a custom threshold, so the gate is a parameter not a guess", () => {
    const loose = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt,
      candidateIds: CANDIDATES,
      minDecided: 1,
    });
    expect(loose.minDecided).toBe(1);
    expect(loose.rows.map((r) => r.candidateId)).toContain("old-x");
  });

  it("lets a below-gate candidate's votes still count in the fit", () => {
    // pool-rag's straggler win over old-x is inside the window, so its game
    // count includes it even though old-x has no row.
    const rag = slice.rows.find((r) => r.candidateId === "pool-rag");
    expect(rag?.games).toBe(13);
    expect(rag?.decided).toBe(11);
  });
});

describe("buildEraSlice - the empty window", () => {
  it("produces no rows and full counts when nothing clears the gate", () => {
    const rows = [
      row("pool-rag", "pool-base", "both_inadequate", 20, POOL),
      row("pool-rag", "pool-base", "tie", 21, POOL),
      row("pool-rag", "pool-base", "a", 22, POOL),
    ];
    const slice = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt: derivePivotAt(rows),
      candidateIds: ["pool-rag", "pool-base"],
    });
    expect(slice.rows).toHaveLength(0);
    expect(slice.comparisons).toBe(3);
    expect(slice.decided).toBe(1);
    expect(slice.belowGate).toEqual([
      { candidateId: "pool-base", decided: 1, games: 3 },
      { candidateId: "pool-rag", decided: 1, games: 3 },
    ]);
  });

  it("is empty, with zero counts, when the pivot has not happened", () => {
    const rows = [row("old-x", "old-y", "a", 3)];
    const slice = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt: derivePivotAt(rows),
      candidateIds: ["old-x", "old-y"],
    });
    expect(slice.windowStart).toBeNull();
    expect(slice.comparisons).toBe(0);
    expect(slice.rows).toHaveLength(0);
    expect(slice.belowGate.map((s) => s.decided)).toEqual([0, 0]);
  });
});

describe("buildEraSlice - categories", () => {
  it("separates the categories with votes in the window from those without", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        row("pool-rag", "pool-base", "a", 20 + i, {
          ...POOL,
          bucket: "authenticity",
        }),
      ),
      row("pool-rag", "pool-base", "a", 26, {
        ...POOL,
        bucket: "cultural_values",
      }),
      // Pre-pivot only: this category must not appear in the window.
      row("old-x", "old-y", "a", 2, { bucket: "orthography" }),
    ];
    const pivotAt = derivePivotAt(rows);
    const since = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt,
      candidateIds: ["pool-rag", "pool-base", "old-x", "old-y"],
    });
    expect(since.bucketsWithVotes).toEqual(["cultural_values", "authenticity"]);
    expect(since.bucketsWithoutVotes).toContain("orthography");

    const all = buildEraSlice(rows, {
      era: "all_time",
      pivotAt,
      candidateIds: ["pool-rag", "pool-base", "old-x", "old-y"],
    });
    expect(all.bucketsWithVotes).toContain("orthography");
  });

  it("gives every gated row one cell per category, with its own counts", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row("pool-rag", "pool-base", i < 5 ? "a" : "b", 20 + i, {
        ...POOL,
        bucket: "authenticity",
      }),
    );
    const slice = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt: derivePivotAt(rows),
      candidateIds: ["pool-rag", "pool-base"],
    });
    const rag = slice.rows.find((r) => r.candidateId === "pool-rag");
    const auth = rag?.cells.find((c) => c.bucket === "authenticity");
    const ortho = rag?.cells.find((c) => c.bucket === "orthography");
    expect(auth?.games).toBe(6);
    expect(auth?.decided).toBe(6);
    expect(auth?.strength).not.toBeNull();
    // No votes in that category: a dash, never a neutral 50.
    expect(ortho?.strength).toBeNull();
    expect(ortho?.games).toBe(0);
  });
});

describe("eraSplit", () => {
  it("reconciles: before the pivot plus since the pivot equals all time", () => {
    const rows = corpus();
    const pivotAt = derivePivotAt(rows);
    const all = buildEraSlice(rows, {
      era: "all_time",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    const since = buildEraSlice(rows, {
      era: "since_pivot",
      pivotAt,
      candidateIds: CANDIDATES,
    });
    const split = eraSplit(all, since);
    expect(split.beforeComparisons + split.sinceComparisons).toBe(
      split.allComparisons,
    );
    expect(split.beforeDecided + split.sinceDecided).toBe(split.allDecided);
    expect(split.beforeComparisons).toBe(6);
    expect(split.beforeDecided).toBe(1);
  });
});

describe("era vocabulary", () => {
  it("defaults to the post-pivot window and labels both windows", () => {
    expect(DEFAULT_ARENA_ERA).toBe("since_pivot");
    expect(ARENA_ERA_LABELS.since_pivot).toBe("Since the annotation pivot");
    expect(ARENA_ERA_LABELS.all_time).toBe("All time");
  });
});
