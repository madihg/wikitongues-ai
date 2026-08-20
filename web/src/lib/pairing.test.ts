import { describe, it, expect } from "vitest";
import {
  assignedPair,
  computeQueueState,
  goldFirstFor,
  laneFor,
  orderQueueByLane,
  pairingEligibleOutputs,
  type QueuePrompt,
} from "./pairing";

// Fixed id lists so distribution/coverage assertions are exact re-computations
// of a pure function, never a statistical gamble - same inputs every run.
const PROMPT_IDS = Array.from({ length: 300 }, (_, i) => `prompt_${i}`);
const ANNOTATOR_IDS = ["ann_1", "ann_2", "ann_3", "ann_4", "ann_5"];

describe("assignedPair", () => {
  it("returns null when there are fewer than 2 outputs", () => {
    expect(assignedPair("ann_1", "ig_orth_001", 0)).toBeNull();
    expect(assignedPair("ann_1", "ig_orth_001", 1)).toBeNull();
  });

  it("always returns [0, 1] when there are exactly 2 outputs", () => {
    for (const annotatorId of ANNOTATOR_IDS) {
      for (const promptId of PROMPT_IDS) {
        expect(assignedPair(annotatorId, promptId, 2)).toEqual([0, 1]);
      }
    }
  });

  it("is deterministic: same inputs always yield the same pair", () => {
    const a = assignedPair("ann_1", "ig_orth_001", 3);
    const b = assignedPair("ann_1", "ig_orth_001", 3);
    expect(a).toEqual(b);

    const c = assignedPair("ann_3", "ig_lexicon_042", 4);
    const d = assignedPair("ann_3", "ig_lexicon_042", 4);
    expect(c).toEqual(d);
  });

  it("only ever returns valid index pairs (0 <= i < j < n)", () => {
    for (const n of [2, 3, 4, 5, 8]) {
      for (const annotatorId of ANNOTATOR_IDS) {
        for (const promptId of PROMPT_IDS) {
          const pair = assignedPair(annotatorId, promptId, n);
          expect(pair).not.toBeNull();
          const [i, j] = pair!;
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(j);
          expect(j).toBeLessThan(n);
        }
      }
    }
  });

  it("distributes all 3 pair indices roughly evenly per annotator (n=3)", () => {
    // n=3 -> pairs are [0,1], [0,2], [1,2] in canonical order.
    for (const annotatorId of ANNOTATOR_IDS) {
      const counts = [0, 0, 0];
      for (const promptId of PROMPT_IDS) {
        const [i, j] = assignedPair(annotatorId, promptId, 3)!;
        if (i === 0 && j === 1) counts[0]++;
        else if (i === 0 && j === 2) counts[1]++;
        else counts[2]++;
      }
      // Every pair index shows up, each with at least a 15% share - loose
      // enough to never flake on hash wobble, tight enough to catch a
      // hash that collapses onto one or two indices.
      for (const count of counts) {
        expect(count).toBeGreaterThanOrEqual(PROMPT_IDS.length * 0.15);
      }
    }
  });

  it("spreads a prompt's coverage across annotators (>= 2 distinct pairs on average, n=3)", () => {
    let totalDistinct = 0;
    for (const promptId of PROMPT_IDS) {
      const seen = new Set(
        ANNOTATOR_IDS.map((annotatorId) => {
          const [i, j] = assignedPair(annotatorId, promptId, 3)!;
          return `${i},${j}`;
        }),
      );
      totalDistinct += seen.size;
    }
    const avgDistinct = totalDistinct / PROMPT_IDS.length;
    // With 5 annotators and 3 possible pairs, a single shared pair for
    // everyone would be a hash collapse bug - assert the average clears 2
    // distinct pairs per prompt (loose, not "all 3 every time").
    expect(avgDistinct).toBeGreaterThanOrEqual(2);
  });

  it("touches every model (output index) in every annotator's queue (n=3)", () => {
    for (const annotatorId of ANNOTATOR_IDS) {
      const covered = new Set<number>();
      for (const promptId of PROMPT_IDS) {
        const [i, j] = assignedPair(annotatorId, promptId, 3)!;
        covered.add(i);
        covered.add(j);
      }
      expect([...covered].sort()).toEqual([0, 1, 2]);
    }
  });

  it("different annotators can land on different pairs for the same prompt", () => {
    const pairsForPrompt = ANNOTATOR_IDS.map((annotatorId) =>
      assignedPair(annotatorId, "ig_orth_001", 3)!,
    );
    const distinct = new Set(pairsForPrompt.map(([i, j]) => `${i},${j}`));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("computeQueueState", () => {
  const prompts: QueuePrompt[] = [
    { promptId: "ig_orth_001", outputCount: 3 },
    { promptId: "ig_orth_002", outputCount: 2 },
    { promptId: "ig_gemini_dead", outputCount: 1 }, // < 2 outputs, never eligible
    { promptId: "ig_orth_003", outputCount: 0 },
    { promptId: "ig_orth_004", outputCount: 3 },
  ];

  it("total counts only prompts with >= 2 outputs", () => {
    const state = computeQueueState(prompts, new Set(), new Set());
    expect(state.total).toBe(3); // 001, 002, 004
  });

  it("with no history or skips, every eligible prompt is remaining and none completed", () => {
    const state = computeQueueState(prompts, new Set(), new Set());
    expect(state.completed).toBe(0);
    expect(state.remaining.map((p) => p.promptId)).toEqual([
      "ig_orth_001",
      "ig_orth_002",
      "ig_orth_004",
    ]);
  });

  it("a prompt with any comparison counts as completed and drops out of remaining", () => {
    const state = computeQueueState(
      prompts,
      new Set(["ig_orth_001"]),
      new Set(),
    );
    expect(state.completed).toBe(1);
    expect(state.remaining.map((p) => p.promptId)).toEqual([
      "ig_orth_002",
      "ig_orth_004",
    ]);
  });

  it("a skipped prompt drops out of remaining but is NOT counted as completed", () => {
    const state = computeQueueState(
      prompts,
      new Set(),
      new Set(["ig_orth_002"]),
    );
    expect(state.completed).toBe(0);
    expect(state.remaining.map((p) => p.promptId)).toEqual([
      "ig_orth_001",
      "ig_orth_004",
    ]);
  });

  it("done and skipped both exclude from remaining; ineligible prompts never appear either way", () => {
    const state = computeQueueState(
      prompts,
      new Set(["ig_orth_001"]),
      new Set(["ig_orth_002", "ig_orth_004"]),
    );
    expect(state.total).toBe(3);
    expect(state.completed).toBe(1);
    expect(state.remaining).toEqual([]);
  });

  it("a prompt flagged both done and skipped only counts once, as completed", () => {
    const state = computeQueueState(
      prompts,
      new Set(["ig_orth_001"]),
      new Set(["ig_orth_001"]),
    );
    expect(state.completed).toBe(1);
    expect(state.remaining.map((p) => p.promptId)).toEqual([
      "ig_orth_002",
      "ig_orth_004",
    ]);
  });
});

// ─── the 2026-08-20 pivot: pairing pool, lanes, weighting ───────────────────

describe("pairingEligibleOutputs", () => {
  const outputs = [
    { id: "o1", inPool: false },
    { id: "o2", inPool: true },
    { id: "o3", inPool: true },
    { id: "o4", inPool: false },
  ];

  it("with an active pool, only pool-arm outputs survive", () => {
    expect(pairingEligibleOutputs(outputs, true).map((o) => o.id)).toEqual([
      "o2",
      "o3",
    ]);
  });

  it("without a pool (pre-pivot), every output is pairable", () => {
    expect(pairingEligibleOutputs(outputs, false)).toHaveLength(4);
  });
});

describe("laneFor / goldFirstFor", () => {
  it("zero-gold prompts are the 'both' lane and always cold-first", () => {
    const p = { goldCount: 0, isLongForm: false };
    expect(laneFor(p)).toBe("both");
    expect(goldFirstFor(p, false)).toBe(true);
    expect(goldFirstFor(p, true)).toBe(true);
  });

  it("long-form prompts stay cold-mandatory regardless of coverage", () => {
    const p = { goldCount: 5, isLongForm: true };
    expect(laneFor(p)).toBe("cold_mandatory");
    expect(goldFirstFor(p, false)).toBe(true);
  });

  it("prompts with >= 2 gold answers skip straight to the comparison", () => {
    const p = { goldCount: 2, isLongForm: false };
    expect(laneFor(p)).toBe("strong_pair");
    expect(goldFirstFor(p, true)).toBe(false);
    expect(goldFirstFor(p, false)).toBe(false);
  });

  it("exactly 1 gold falls back to the per-bucket default", () => {
    const p = { goldCount: 1, isLongForm: false };
    expect(goldFirstFor(p, true)).toBe(true);
    expect(goldFirstFor(p, false)).toBe(false);
  });

  it("no lane metadata (old scheme) keeps the bucket default", () => {
    expect(goldFirstFor({}, true)).toBe(true);
    expect(goldFirstFor({}, false)).toBe(false);
  });
});

describe("orderQueueByLane", () => {
  const mk = (
    promptId: string,
    goldCount: number,
    isLongForm = false,
  ): QueuePrompt => ({ promptId, outputCount: 3, goldCount, isLongForm });

  it("serves zero-gold prompts first (max-yield episodes)", () => {
    const ordered = orderQueueByLane([
      mk("strong_1", 2),
      mk("zero_1", 0),
      mk("long_1", 3, true),
      mk("zero_2", 0),
    ]);
    expect(ordered.slice(0, 2).map((p) => p.promptId)).toEqual([
      "zero_1",
      "zero_2",
    ]);
  });

  it("interleaves strong-pair vs long-form cold at 2:1 (the decided weighting)", () => {
    const strong = Array.from({ length: 6 }, (_, i) => mk(`s${i}`, 2));
    const cold = Array.from({ length: 3 }, (_, i) => mk(`c${i}`, 3, true));
    const ordered = orderQueueByLane([...strong, ...cold]);
    expect(ordered.map((p) => p.promptId)).toEqual([
      "s0",
      "s1",
      "c0",
      "s2",
      "s3",
      "c1",
      "s4",
      "s5",
      "c2",
    ]);
  });

  it("keeps the strong-pair share inside 60-70% over a mixed catalogue", () => {
    const strong = Array.from({ length: 40 }, (_, i) => mk(`s${i}`, 2));
    const cold = Array.from({ length: 20 }, (_, i) => mk(`c${i}`, 3, true));
    const ordered = orderQueueByLane([...strong, ...cold]);
    // Any leading window an annotator actually works through should hold the
    // weighting, not just the full list.
    for (const window of [15, 30, 60]) {
      const head = ordered.slice(0, window);
      const strongShare =
        head.filter((p) => laneFor(p) === "strong_pair").length / head.length;
      expect(strongShare).toBeGreaterThanOrEqual(0.6);
      expect(strongShare).toBeLessThanOrEqual(0.7);
    }
  });

  it("is deterministic and stable within each lane", () => {
    const input = [
      mk("s0", 2),
      mk("c0", 3, true),
      mk("s1", 1),
      mk("z0", 0),
      mk("s2", 2),
    ];
    const a = orderQueueByLane(input).map((p) => p.promptId);
    const b = orderQueueByLane(input).map((p) => p.promptId);
    expect(a).toEqual(b);
    // Within-lane relative order preserved.
    const strongOrder = a.filter((id) => id.startsWith("s"));
    expect(strongOrder).toEqual(["s0", "s1", "s2"]);
  });

  it("drains the leftover lane once the other is exhausted", () => {
    const ordered = orderQueueByLane([
      mk("c0", 3, true),
      mk("c1", 3, true),
      mk("c2", 3, true),
    ]);
    expect(ordered.map((p) => p.promptId)).toEqual(["c0", "c1", "c2"]);
  });
});

describe("computeQueueState - pivot behaviour", () => {
  it("held-out (frozen bank) prompts are never pairwise-eligible", () => {
    const state = computeQueueState(
      [
        { promptId: "frozen_1", outputCount: 5, goldCount: 4, isHoldout: true },
        { promptId: "train_1", outputCount: 3, goldCount: 0, isHoldout: false },
      ],
      new Set(),
      new Set(),
    );
    expect(state.total).toBe(1);
    expect(state.remaining.map((p) => p.promptId)).toEqual(["train_1"]);
  });

  it("a completed frozen prompt does not count toward completed either", () => {
    const state = computeQueueState(
      [
        { promptId: "frozen_1", outputCount: 5, goldCount: 4, isHoldout: true },
        { promptId: "train_1", outputCount: 3, goldCount: 0, isHoldout: false },
      ],
      new Set(["frozen_1"]),
      new Set(),
    );
    expect(state.completed).toBe(0);
  });

  it("with lane metadata, remaining comes back lane-ordered", () => {
    const state = computeQueueState(
      [
        { promptId: "strong_1", outputCount: 3, goldCount: 2 },
        { promptId: "zero_1", outputCount: 3, goldCount: 0 },
        {
          promptId: "long_1",
          outputCount: 3,
          goldCount: 3,
          isLongForm: true,
        },
      ],
      new Set(),
      new Set(),
    );
    expect(state.remaining[0].promptId).toBe("zero_1");
  });

  it("a prompt whose pool outputs dropped below 2 is not eligible", () => {
    const state = computeQueueState(
      // outputCount here is ALREADY pool-filtered by the loader; a prompt
      // with 5 legacy outputs but 1 pool output must not be served.
      [{ promptId: "old_only", outputCount: 1, goldCount: 0 }],
      new Set(),
      new Set(),
    );
    expect(state.total).toBe(0);
    expect(state.remaining).toEqual([]);
  });
});
