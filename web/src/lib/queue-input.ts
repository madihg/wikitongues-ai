import { prisma } from "@/lib/prisma";
import { pairingEligibleOutputs, type QueuePrompt } from "@/lib/pairing";

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
  /** Pairing-eligible outputs, deterministic order. */
  pairableOutputs: { id: string; outputText: string }[];
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
              select: { inPairingPool: true, archived: true },
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
        inPool:
          o.candidateModel?.inPairingPool === true &&
          o.candidateModel.archived === false,
      })),
      poolActive,
    ).map(({ id, outputText }) => ({ id, outputText }));

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
