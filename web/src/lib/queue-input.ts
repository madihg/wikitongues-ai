import { prisma } from "@/lib/prisma";
import {
  EDIT_SKIP_REASON,
  pairingEligibleOutputs,
  qualifyCorrectionTargets,
  type CorrectionInputs,
  type QueuePrompt,
  type ServableTarget,
} from "@/lib/pairing";

/**
 * THE ONE loader behind both queue consumers (/api/annotations/next and
 * /api/annotator/summary). Each route used to run its own copy of the prompt
 * query; with the pivot's pairing-pool filter that duplication becomes a
 * correctness risk - if one route filtered outputs to pool arms and the other
 * did not, "Queue Remaining" and what the queue actually serves would count
 * different things. Both routes now feed computeQueueState through this
 * module, so they cannot drift.
 *
 * Everything is computed from the DB per request (house rule: no hardcoded
 * counts or arm lists):
 *   - poolActive: does any unarchived CandidateModel carry inPairingPool?
 *     When false (pre-pivot), all outputs are pairable and old behaviour
 *     holds end to end.
 *   - pairableOutputs: the prompt's outputs in the deterministic serving
 *     order, filtered to pool arms when the pool is active. assignedPair's
 *     indices address THIS list.
 *   - goldCount / isLongForm / isHoldout: the lane metadata computeQueueState
 *     orders the queue by (see src/lib/pairing.ts).
 */

export interface QueuePromptDetail {
  id: string;
  promptId: string;
  bucket: import("@prisma/client").EvalBucket | null;
  language: string;
  text: string;
  targetCulture: string | null;
  expectedCulturalContext: string | null;
  isHoldout: boolean;
  isLongForm: boolean;
  goldCount: number;
  /** Pairing-eligible outputs, deterministic order. `slug` is the owning
   *  CandidateModel's slug - what assignedPair's ALLOWED_PAIRINGS whitelist
   *  matches against. */
  pairableOutputs: { id: string; outputText: string; slug: string }[];
}

export interface QueueInputs {
  poolActive: boolean;
  /** Full detail per prompt, keyed for the serving route. */
  byPromptId: Map<string, QueuePromptDetail>;
  /** The exact input computeQueueState expects, same order as the query. */
  queuePrompts: QueuePrompt[];
}

export async function loadQueueInputs(): Promise<QueueInputs> {
  const [poolCount, promptRows] = await Promise.all([
    prisma.candidateModel.count({
      where: { inPairingPool: true, archived: false },
    }),
    prisma.prompt.findMany({
      where: { modelOutputs: { some: {} } },
      select: {
        id: true,
        promptId: true,
        bucket: true,
        language: true,
        text: true,
        targetCulture: true,
        expectedCulturalContext: true,
        isHoldout: true,
        provenance: true,
        // Deterministic order (id as a tiebreak on equal timestamps) so the
        // assigned-pair index picked by /next matches /summary exactly.
        modelOutputs: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            outputText: true,
            candidateModel: {
              select: { inPairingPool: true, archived: true, slug: true },
            },
          },
        },
        _count: {
          select: { coldAuthorAnswers: { where: { isDemo: false } } },
        },
      },
    }),
  ]);

  const poolActive = poolCount > 0;
  const byPromptId = new Map<string, QueuePromptDetail>();
  const queuePrompts: QueuePrompt[] = [];

  for (const p of promptRows) {
    const pairableOutputs = pairingEligibleOutputs(
      p.modelOutputs.map((o) => ({
        id: o.id,
        outputText: o.outputText,
        slug: o.candidateModel?.slug ?? "",
        inPool:
          o.candidateModel?.inPairingPool === true &&
          o.candidateModel.archived === false,
      })),
      poolActive,
    ).map(({ id, outputText, slug }) => ({ id, outputText, slug }));

    const detail: QueuePromptDetail = {
      id: p.id,
      promptId: p.promptId,
      bucket: p.bucket,
      language: p.language,
      text: p.text,
      targetCulture: p.targetCulture,
      expectedCulturalContext: p.expectedCulturalContext,
      isHoldout: p.isHoldout,
      isLongForm: (p.provenance ?? "").includes("longform"),
      goldCount: p._count.coldAuthorAnswers,
      pairableOutputs,
    };
    byPromptId.set(p.promptId, detail);
    queuePrompts.push({
      promptId: p.promptId,
      outputCount: pairableOutputs.length,
      goldCount: detail.goldCount,
      isLongForm: detail.isLongForm,
      isHoldout: detail.isHoldout,
    });
  }

  return { poolActive, byPromptId, queuePrompts };
}

// ─── The editing ground: corrections-lane inputs ─────────────────────────────

export interface CorrectionInputsResult {
  /** What computeQueueState consumes to derive the `corrections` list. */
  correctionInputs: CorrectionInputs;
  /** Full servable-target detail per prompt, in serving order (verdict age;
   *  within one comparison winner side first, else A before B) - what
   *  /api/edits/next walks. */
  servableByPromptId: Map<string, ServableTarget[]>;
}

/**
 * THE ONE loader behind every corrections-lane consumer (/api/edits/next,
 * /api/annotator/summary, the all-caught-up link) - the same single-loader
 * contract loadQueueInputs holds for the pairwise queue, for the same reason:
 * two routes counting "corrections waiting" from different queries would
 * drift.
 *
 * Servability is own-verdicts-only (v1): U's non-demo comparisons, joined to
 * each side's candidateModel pool flags, minus outputs anyone (non-demo) has
 * already edited, minus prompts U edit-skipped. Role qualification itself
 * (winner/tie/both_inadequate servable, pure losers not) is the pure
 * `qualifyCorrectionTargets` in src/lib/pairing.ts, tested there. Holdout
 * exclusion is applied by computeQueueState from the prompt catalogue's
 * isHoldout flag.
 */
export async function loadCorrectionInputs(
  annotatorId: string,
): Promise<CorrectionInputsResult> {
  const sideSelect = {
    select: {
      id: true,
      outputText: true,
      candidateModel: { select: { inPairingPool: true, archived: true } },
    },
  } as const;

  // Verdict-age order (id as a tiebreak on equal timestamps): oldest
  // judgments get corrected first, and refreshing never shuffles.
  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { annotatorId, isDemo: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      promptId: true,
      winner: true,
      explanation: true,
      failureTagsA: true,
      failureTagsB: true,
      modelOutputA: sideSelect,
      modelOutputB: sideSelect,
    },
  });

  const outputIds = [
    ...new Set(
      comparisons.flatMap((c) => [c.modelOutputA.id, c.modelOutputB.id]),
    ),
  ];

  const [editRows, skipFlags] = await Promise.all([
    // ANY non-demo edit (from anyone) retires an output from the lane: v1
    // optimizes breadth over depth across the backlog.
    outputIds.length > 0
      ? prisma.outputEdit.findMany({
          where: { isDemo: false, modelOutputId: { in: outputIds } },
          select: { modelOutputId: true },
        })
      : Promise.resolve([]),
    prisma.promptFlag.findMany({
      where: { annotatorId, reason: EDIT_SKIP_REASON },
      select: { prompt: { select: { promptId: true } } },
    }),
  ]);

  const inPool = (side: {
    candidateModel: { inPairingPool: boolean; archived: boolean } | null;
  }) =>
    side.candidateModel?.inPairingPool === true &&
    side.candidateModel.archived === false;

  const targets = qualifyCorrectionTargets(
    comparisons.map((c) => ({
      comparisonId: c.id,
      promptId: c.promptId,
      winner: c.winner,
      explanation: c.explanation,
      a: {
        modelOutputId: c.modelOutputA.id,
        outputText: c.modelOutputA.outputText,
        inPool: inPool(c.modelOutputA),
        failureTags: c.failureTagsA,
      },
      b: {
        modelOutputId: c.modelOutputB.id,
        outputText: c.modelOutputB.outputText,
        inPool: inPool(c.modelOutputB),
        failureTags: c.failureTagsB,
      },
    })),
    new Set(editRows.map((e) => e.modelOutputId)),
  );

  // Group per prompt, preserving serving order; map insertion order carries
  // the verdict-age ordering into computeQueueState.
  const servableByPromptId = new Map<string, ServableTarget[]>();
  const editableByPromptId = new Map<string, number>();
  for (const target of targets) {
    const list = servableByPromptId.get(target.promptId);
    if (list) list.push(target);
    else servableByPromptId.set(target.promptId, [target]);
    editableByPromptId.set(
      target.promptId,
      (editableByPromptId.get(target.promptId) ?? 0) + 1,
    );
  }

  return {
    correctionInputs: {
      editableByPromptId,
      editSkippedPromptIds: new Set(skipFlags.map((f) => f.prompt.promptId)),
    },
    servableByPromptId,
  };
}
