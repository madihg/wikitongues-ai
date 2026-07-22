import { describe, it, expect } from "vitest";
import { assignedPair, computeQueueState, type QueuePrompt } from "./pairing";

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
