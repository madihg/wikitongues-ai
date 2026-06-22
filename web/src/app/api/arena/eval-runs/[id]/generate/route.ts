import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { generateForCandidate, type RagChunk } from "@/lib/arena/providers";
import { searchRag } from "@/lib/rag";

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
    select: { id: true, text: true, bucket: true },
  });

  await prisma.evalRun.update({
    where: { id },
    data: { status: "generating" },
  });

  let generated = 0;
  let failed = 0;

  for (const prompt of prompts) {
    try {
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

      const result = await generateForCandidate(candidate, {
        userMessage: prompt.text,
        ragContext,
      });

      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: candidate.family,
          modelId: result.modelId,
          candidateModelId: candidate.id,
          evalRunId: run.id,
          bucket: prompt.bucket,
          outputText: result.text,
          ragContextIds: result.ragContextIds,
          tokenCountIn: result.tokensIn ?? null,
          tokenCountOut: result.tokensOut ?? null,
          latencyMs: result.latencyMs,
          epochId: run.epochId,
        },
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
    data: { status: generated > 0 ? "awaiting_human" : "failed" },
  });

  return NextResponse.json({ generated, failed, total: prompts.length });
}
