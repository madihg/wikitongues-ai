import { describe, it, expect } from "vitest";
import {
  assignedPair,
  computeQueueState,
  goldFirstFor,
  laneFor,
  orderQueueByLane,
  pairingEligibleOutputs,
  qualifyCorrectionTargets,
  type CorrectionComparisonInput,
  type CorrectionInputs,
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

// ─── the editing ground: corrections lane state + target qualification ───────

describe("computeQueueState - corrections lane", () => {
  // A mixed catalogue: done prompts with editable targets, an in-queue prompt,
  // a held-out prompt with an (impossible in prod, but defended) editable
  // count, and an edit-skipped prompt.
  const catalogue: QueuePrompt[] = [
    { promptId: "done_editable_1", outputCount: 2, goldCount: 2 },
    { promptId: "in_queue", outputCount: 3, goldCount: 2 },
    { promptId: "done_editable_2", outputCount: 2, goldCount: 0 },
    { promptId: "frozen", outputCount: 2, goldCount: 4, isHoldout: true },
    { promptId: "done_skipped", outputCount: 2, goldCount: 1 },
    { promptId: "done_exhausted", outputCount: 2, goldCount: 1 },
  ];
  const done = new Set([
    "done_editable_1",
    "done_editable_2",
    "done_skipped",
    "done_exhausted",
    "frozen",
  ]);

  const inputs = (
    editable: [string, number][],
    skipped: string[] = [],
  ): CorrectionInputs => ({
    editableByPromptId: new Map(editable),
    editSkippedPromptIds: new Set(skipped),
  });

  it("without CorrectionInputs, corrections is empty and every existing field is untouched", () => {
    const withOut = computeQueueState(catalogue, done, new Set());
    expect(withOut.corrections).toEqual([]);
    const withIn = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([["done_editable_1", 1]]),
    );
    expect(withIn.total).toBe(withOut.total);
    expect(withIn.completed).toBe(withOut.completed);
    expect(withIn.remaining).toEqual(withOut.remaining);
  });

  it("the lane state survives the no-tab flow: still derivable for the researcher lane and summary card (2026-08-28 rework removed the annotator TAB, not the state)", () => {
    // /api/edits/next and /api/annotator/summary keep calling this exact
    // derivation after the rework - the annotator's route now redirects, but
    // researchers still work the backlog through it, so the corrections
    // field must keep behaving identically.
    const state = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([
        ["done_editable_1", 1],
        ["done_editable_2", 2],
      ]),
    );
    expect(state.corrections.map((p) => p.promptId)).toEqual([
      "done_editable_1",
      "done_editable_2",
    ]);
  });

  it("only prompts with an editable count > 0 appear, in input (verdict-age) order", () => {
    const state = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([
        // Verdict-age order deliberately differs from catalogue order: the
        // MAP order must win (oldest judgment corrected first).
        ["done_editable_2", 2],
        ["done_editable_1", 1],
        ["done_exhausted", 0],
      ]),
    );
    expect(state.corrections.map((p) => p.promptId)).toEqual([
      "done_editable_2",
      "done_editable_1",
    ]);
  });

  it("held-out prompts never appear even with an editable count > 0", () => {
    const state = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([
        ["frozen", 3],
        ["done_editable_1", 1],
      ]),
    );
    expect(state.corrections.map((p) => p.promptId)).toEqual([
      "done_editable_1",
    ]);
  });

  it("edit-skipped prompts never appear", () => {
    const state = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs(
        [
          ["done_editable_1", 1],
          ["done_skipped", 2],
        ],
        ["done_skipped"],
      ),
    );
    expect(state.corrections.map((p) => p.promptId)).toEqual([
      "done_editable_1",
    ]);
  });

  it("corrections and remaining are disjoint on a mixed catalogue", () => {
    const state = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([
        ["done_editable_1", 1],
        ["done_editable_2", 1],
      ]),
    );
    const remainingIds = new Set(state.remaining.map((p) => p.promptId));
    expect(state.remaining.map((p) => p.promptId)).toEqual(["in_queue"]);
    for (const p of state.corrections) {
      expect(remainingIds.has(p.promptId)).toBe(false);
    }
    expect(state.corrections.length).toBeGreaterThan(0);
  });

  it("never re-serves: an editable count dropping to 0 (edit landed) removes the prompt, and so does an edit-skip - pure re-computations", () => {
    const before = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([["done_editable_1", 1]]),
    );
    expect(before.corrections.map((p) => p.promptId)).toEqual([
      "done_editable_1",
    ]);

    const afterEdit = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([["done_editable_1", 0]]),
    );
    expect(afterEdit.corrections).toEqual([]);

    const afterSkip = computeQueueState(
      catalogue,
      done,
      new Set(),
      inputs([["done_editable_1", 1]], ["done_editable_1"]),
    );
    expect(afterSkip.corrections).toEqual([]);
  });

  it("a single-pool-output prompt (never pairwise-eligible) can still carry corrections", () => {
    const state = computeQueueState(
      [{ promptId: "single_output", outputCount: 1, goldCount: 1 }],
      new Set(["single_output"]),
      new Set(),
      inputs([["single_output", 1]]),
    );
    expect(state.total).toBe(0); // not pairwise-eligible
    expect(state.corrections.map((p) => p.promptId)).toEqual(["single_output"]);
  });
});

describe("qualifyCorrectionTargets", () => {
  const side = (id: string, inPool = true, failureTags: string[] = []) => ({
    modelOutputId: id,
    outputText: `text of ${id}`,
    inPool,
    failureTags,
  });

  // One annotator, four comparisons covering all four winner values.
  const comparisons: CorrectionComparisonInput[] = [
    {
      comparisonId: "cmp_win_a",
      promptId: "p1",
      winner: "a",
      explanation: "A is closer to real Igala",
      a: side("out_a1"),
      b: side("out_b1", true, ["grammar"]),
    },
    {
      comparisonId: "cmp_win_b",
      promptId: "p2",
      winner: "b",
      explanation: "B got the greeting right",
      a: side("out_a2", true, ["wrong_word"]),
      b: side("out_b2"),
    },
    {
      comparisonId: "cmp_tie",
      promptId: "p3",
      winner: "tie",
      explanation: "both fine",
      a: side("out_a3"),
      b: side("out_b3"),
    },
    {
      comparisonId: "cmp_both",
      promptId: "p4",
      winner: "both_inadequate",
      explanation: "neither is Igala",
      a: side("out_a4", true, ["not_igala"]),
      b: side("out_b4", true, ["wrong_language"]),
    },
  ];

  it("serves exactly the winner / tie-both / both-inadequate-both set with the right roles - pure losers are never served", () => {
    const targets = qualifyCorrectionTargets(comparisons, new Set());
    expect(targets.map((t) => [t.modelOutputId, t.role])).toEqual([
      ["out_a1", "winner"],
      ["out_b2", "winner"],
      ["out_a3", "tie"],
      ["out_b3", "tie"],
      ["out_a4", "both_inadequate"],
      ["out_b4", "both_inadequate"],
    ]);
    // The losing sides of a/b verdicts are absent.
    const ids = new Set(targets.map((t) => t.modelOutputId));
    expect(ids.has("out_b1")).toBe(false);
    expect(ids.has("out_a2")).toBe(false);
  });

  it("replays the annotator's own verdict context: explanation and THIS side's failure tags", () => {
    const targets = qualifyCorrectionTargets(comparisons, new Set());
    const a4 = targets.find((t) => t.modelOutputId === "out_a4")!;
    expect(a4.explanation).toBe("neither is Igala");
    expect(a4.failureTags).toEqual(["not_igala"]);
    expect(a4.comparisonId).toBe("cmp_both");
    const b4 = targets.find((t) => t.modelOutputId === "out_b4")!;
    expect(b4.failureTags).toEqual(["wrong_language"]);
  });

  it("drops outputs that already have an edit (from anyone), keeping the rest", () => {
    const targets = qualifyCorrectionTargets(
      comparisons,
      new Set(["out_a1", "out_b3"]),
    );
    expect(targets.map((t) => t.modelOutputId)).toEqual([
      "out_b2",
      "out_a3",
      "out_a4",
      "out_b4",
    ]);
  });

  it("drops non-pool outputs (editing dead weak-arm text is wasted budget)", () => {
    const withNonPool: CorrectionComparisonInput[] = [
      {
        comparisonId: "cmp_pool_mixed",
        promptId: "p5",
        winner: "both_inadequate",
        explanation: "x",
        a: side("out_a5", false),
        b: side("out_b5", true),
      },
    ];
    expect(
      qualifyCorrectionTargets(withNonPool, new Set()).map(
        (t) => t.modelOutputId,
      ),
    ).toEqual(["out_b5"]);
  });

  it("NFC-normalizes the served output text", () => {
    const nfd = "Ọjọ ki".normalize("NFD");
    const input: CorrectionComparisonInput[] = [
      {
        comparisonId: "cmp_nfd",
        promptId: "p6",
        winner: "a",
        explanation: "x",
        a: {
          modelOutputId: "out_nfd",
          outputText: nfd,
          inPool: true,
          failureTags: [],
        },
        b: side("out_other"),
      },
    ];
    const [t] = qualifyCorrectionTargets(input, new Set());
    expect(t.outputTextNfc).toBe(nfd.normalize("NFC"));
    expect(t.outputTextNfc).not.toBe(nfd);
  });

  it("dedupes an output judged in two old-scheme comparisons - the oldest verdict wins", () => {
    const dup: CorrectionComparisonInput[] = [
      {
        comparisonId: "cmp_old",
        promptId: "p7",
        winner: "a",
        explanation: "first verdict",
        a: side("out_shared"),
        b: side("out_x"),
      },
      {
        comparisonId: "cmp_new",
        promptId: "p7",
        winner: "tie",
        explanation: "second verdict",
        a: side("out_shared"),
        b: side("out_y"),
      },
    ];
    const targets = qualifyCorrectionTargets(dup, new Set());
    const shared = targets.filter((t) => t.modelOutputId === "out_shared");
    expect(shared).toHaveLength(1);
    expect(shared[0].comparisonId).toBe("cmp_old");
    expect(shared[0].role).toBe("winner");
  });

  it("an unknown winner value serves nothing (defensive)", () => {
    const weird: CorrectionComparisonInput[] = [
      {
        comparisonId: "cmp_weird",
        promptId: "p8",
        winner: "banana",
        explanation: "x",
        a: side("out_a8"),
        b: side("out_b8"),
      },
    ];
    expect(qualifyCorrectionTargets(weird, new Set())).toEqual([]);
  });
});
