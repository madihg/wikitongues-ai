import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { generateForCandidate, type RagChunk } from "@/lib/arena/providers";
import { searchRag } from "@/lib/rag";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";
import { buildRetrievalV2 } from "@/lib/arena/retrieval-v2";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";

/**
 * Generate the candidate's answers on the frozen held-out bank. Uses the
 * model-swapping layer (providers.ts) so any registered candidate — closed
 * baseline, +RAG, or a fine-tuned open-weights endpoint — generates the same way.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const { id } = await params;

  const run = await prisma.evalRun.findUnique({
    where: { id },
    include: { candidateModel: true },
  });
  if (!run)
    return NextResponse.json({ error: "Eval run not found" }, { status: 404 });
  if (!run.candidateModel)
    return NextResponse.json({ error: "Candidate missing" }, { status: 400 });

  const candidate = run.candidateModel;

  const prompts = await prisma.prompt.findMany({
    where: { id: { in: run.holdoutPromptIds } },
    // promptId + isHoldout feed the v2 retrieval path (leak guard keys on the
    // slug; isHoldout is read from the row rather than assumed, so a dev-split
    // run through this route is guarded exactly as strictly as it should be).
    select: {
      id: true,
      promptId: true,
      text: true,
      bucket: true,
      isHoldout: true,
    },
  });

  await prisma.evalRun.update({
    where: { id },
    data: { status: "generating" },
  });

  let generated = 0;
  let failed = 0;
  let costUsd = 0;

  for (const prompt of prompts) {
    try {
      let result;
      let ragContextIds: string[];
      if (
        candidate.versionLabel === "rag-v2" ||
        candidate.versionLabel === "rag-v3"
      ) {
        // The v2/v3 serving path: lexicon + parallel examples appended to the
        // user turn (dictionary last, immediately above the question), gold
        // exemplars as prior turns, the version's system prompt (v3 = v2 plus
        // the enshrined closed-class grammar; retrieval is identical), and
        // the leak guard run inside buildRetrievalV2 against this prompt's
        // own gold. The audit trail on the ModelOutput is the v2 contextIds
        // (lex:/pp:/gold:), the complete list of pieces actually served.
        const v2 = await buildRetrievalV2(prisma, {
          promptId: prompt.promptId,
          text: prompt.text,
          bucket: prompt.bucket,
          isHoldout: prompt.isHoldout,
        });
        result = await generateForCandidate(candidate, {
          userMessage: buildUserTurnV2(prompt.text, v2, prompt.bucket),
          goldExamples: v2.exampleTurns,
          systemPromptOverride:
            candidate.versionLabel === "rag-v3"
              ? IGALA_SYSTEM_V3
              : IGALA_SYSTEM_V2,
        });
        ragContextIds = v2.contextIds;
      } else {
        let ragContext: RagChunk[] = [];
        if (candidate.ragEnabled) {
          const entries = await searchRag(prompt.text, "igala", 5);
          ragContext = entries.map((e) => ({
            id: e.id,
            content: e.content,
            topic: e.topic,
            chunkType: e.chunkType,
          }));
        }

        result = await generateForCandidate(candidate, {
          userMessage: prompt.text,
          ragContext,
        });
        ragContextIds = result.ragContextIds;
      }

      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: candidate.family,
          modelId: result.modelId,
          candidateModelId: candidate.id,
          evalRunId: run.id,
          bucket: prompt.bucket,
          outputText: result.text,
          ragContextIds,
          tokenCountIn: result.tokensIn ?? null,
          tokenCountOut: result.tokensOut ?? null,
          latencyMs: result.latencyMs,
          epochId: run.epochId,
        },
      });
      costUsd += estimateGenerationCostUsd({
        modelId: result.modelId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      generated++;
    } catch (e) {
      failed++;
      console.error(
        `eval-run ${id}: generation failed for prompt ${prompt.id}`,
        e,
      );
    }
  }

  await prisma.evalRun.update({
    where: { id },
    data: {
      status: generated > 0 ? "awaiting_human" : "failed",
      costUsd: roundUsd(costUsd),
    },
  });

  return NextResponse.json({ generated, failed, total: prompts.length });
}
