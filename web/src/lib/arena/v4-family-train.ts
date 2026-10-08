import type { PrismaClient } from "@prisma/client";
import {
  generateForCandidate,
  type CandidateLike,
} from "@/lib/arena/providers";
import {
  buildRetrievalV4,
  type RetrievalV4Result,
} from "@/lib/arena/retrieval-v4";
import { buildGrammarBlock } from "@/lib/arena/grammar-block";
import {
  buildV4FamilyTurn,
  servesGrammarBlock,
  type V4FamilyVersionLabel,
} from "@/lib/arena/frozen-exam";
import {
  generateWithRepairRound,
  type RepairedGeneration,
} from "@/lib/arena/repair-round";

/**
 * One v4-family answer to one TRAIN prompt, assembled exactly as the chat
 * route and scripts/exam-frozen-arm.ts assemble it (retrieval v4, the grammar
 * block for the labels that serve it, the label's system prompt, the repair
 * round with its name check), with isHoldout false because nothing frozen is
 * served. Shared by scripts/train-queue-fill.ts (which creates rows) and
 * scripts/regenerate-train-outputs.ts (which replaces rows), so the two can
 * never assemble differently.
 *
 * Returns the served generation plus what the caller needs to store and to
 * guard it. The repair round reports the two passes' output tokens SUMMED;
 * `servedPassTokensOut` is the pass whose text is served, recorded here by
 * wrapping the generator, because a sum cannot tell a truncated second pass
 * from two long reasoning traces.
 */
export interface V4FamilyTrainAnswer {
  gen: RepairedGeneration;
  ragContextIds: string[];
  servedPassTokensOut: number | undefined;
}

export async function generateV4FamilyTrainAnswer(
  prisma: PrismaClient,
  candidate: CandidateLike & { versionLabel: string | null },
  label: V4FamilyVersionLabel,
  prompt: { promptId: string; text: string; bucket: string | null },
  maxTokens: number,
  retrievalCache?: Map<string, RetrievalV4Result>,
): Promise<V4FamilyTrainAnswer> {
  let v4 = retrievalCache?.get(prompt.promptId);
  if (!v4) {
    v4 = await buildRetrievalV4(prisma, {
      promptId: prompt.promptId,
      text: prompt.text,
      bucket: prompt.bucket as Parameters<typeof buildRetrievalV4>[1]["bucket"],
      isHoldout: false,
    });
    retrievalCache?.set(prompt.promptId, v4);
  }
  const grammar = servesGrammarBlock(label)
    ? await buildGrammarBlock(prisma, {
        promptId: prompt.promptId,
        text: prompt.text,
        isHoldout: false,
      })
    : null;
  const { args, opts } = buildV4FamilyTurn(
    label,
    prompt,
    v4,
    grammar ?? undefined,
  );
  const serving = {
    ...candidate,
    decodingParams: {
      ...((candidate.decodingParams ?? {}) as Record<string, unknown>),
      maxTokens,
    },
  } as CandidateLike;
  const passes: { tokensOut?: number }[] = [];
  const gen = await generateWithRepairRound(
    candidate,
    args,
    async (a) => {
      const g = await generateForCandidate(serving, a);
      passes.push({ tokensOut: g.tokensOut });
      return g;
    },
    opts,
  );
  return {
    gen,
    ragContextIds: [...v4.contextIds, ...(grammar?.grammarIds ?? [])],
    servedPassTokensOut: passes[passes.length - 1]?.tokensOut,
  };
}

/**
 * Why a generated answer must not be stored, or null when it may be. Empty
 * text (a reasoning trace ate the whole budget) and a served pass pinned at
 * the cap (truncated mid-answer) both poison the annotation queue. The same
 * rule the fill has applied to bare and v3 since 2026-08-20, now judged on
 * the served pass.
 */
export function unstorableReason(
  text: string | undefined,
  servedPassTokensOut: number | undefined,
  maxTokens: number,
): string | null {
  if (!text?.trim()) {
    return `empty output (maxTokens ${maxTokens} likely consumed by reasoning trace)`;
  }
  if (servedPassTokensOut != null && servedPassTokensOut >= maxTokens - 8) {
    return `truncated output (served pass tokensOut ${servedPassTokensOut} hit the ${maxTokens} cap)`;
  }
  return null;
}

/**
 * The output budget a TRAIN generation gets, by provider. One place, read by
 * the fill (scripts/train-queue-fill.ts) and the regeneration
 * (scripts/regenerate-train-outputs.ts), so the two can never guard the same
 * answer against different caps. Google models spend most of the budget on a
 * reasoning trace before the answer; the others do not.
 */
export function trainMaxTokensFor(provider: string | null | undefined): number {
  return provider === "google" ? 4096 : 1024;
}
