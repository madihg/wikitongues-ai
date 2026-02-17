import { prisma } from "@/lib/prisma";
import { translate } from "./translator";
import { review } from "./reviewer";

// ─── Interfaces ─────────────────────────────────────────────

export interface OrchestratorInput {
  conversationId: string;
  learnerMessage: string;
  language: string;
}

export interface OrchestratorResult {
  responseText: string;
  confidenceScore: number;
  disposition: "returned" | "escalated";
  pipelineRunId: string;
  source: "ai" | "ai_pending_review";
}

// ─── Confidence scoring (US-014) ────────────────────────────

function computeCompositeConfidence(
  reviewerConfidence: number,
  ragContextUsed: boolean,
  translatorSelfReported: "high" | "medium" | "low",
  reviewerPassed: boolean,
): number {
  let score = reviewerConfidence;

  if (ragContextUsed) score += 5;

  if (translatorSelfReported === "low") {
    score -= 10;
  } else if (translatorSelfReported === "high" && reviewerPassed) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Reviewer call helper ───────────────────────────────────

async function callReviewer(
  originalMessage: string,
  translatorOutput: string,
  language: string,
  ragContextIds: string[],
) {
  const ragEntries =
    ragContextIds.length > 0
      ? await prisma.ragEntry.findMany({
          where: { id: { in: ragContextIds } },
          select: { id: true, content: true, chunkType: true, topic: true },
        })
      : [];

  return review({
    originalMessage,
    translatorOutput,
    language,
    ragContext: ragEntries,
  });
}

// ─── Main orchestration pipeline ────────────────────────────

export async function orchestrate(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { conversationId, learnerMessage, language } = input;

  // 1. Save user message
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content: learnerMessage,
      source: "human",
    },
  });

  // 2. Fetch recent conversation history (last 10 messages)
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, content: true },
  });
  const conversationHistory = recentMessages.reverse().map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 3. Call translator agent
  const translatorResult = await translate({
    learnerMessage,
    language,
    conversationHistory,
  });

  // 4. Call reviewer agent
  const reviewerResult = await callReviewer(
    learnerMessage,
    translatorResult.outputText,
    language,
    translatorResult.ragContextIds,
  );

  // 5. Compute composite confidence
  const compositeScore = computeCompositeConfidence(
    reviewerResult.confidenceScore,
    translatorResult.ragContextUsed,
    translatorResult.selfReportedConfidence,
    reviewerResult.passed,
  );

  // 6. Confidence branching
  if (reviewerResult.passed && compositeScore >= 70) {
    return await finalize({
      conversationId,
      learnerMessage,
      responseText: translatorResult.outputText,
      confidenceScore: compositeScore,
      disposition: "returned",
      source: "ai",
      translatorResult,
      reviewerResult,
      retryCount: 0,
    });
  }

  if (compositeScore >= 50 && compositeScore < 70) {
    // Retry zone: one retry with reviewer feedback
    const retryTranslator = await translate({
      learnerMessage: `${learnerMessage}\n\n[Reviewer feedback — please address these issues in your revised response]\n${reviewerResult.reasoning}`,
      language,
      conversationHistory,
    });

    const retryReviewer = await callReviewer(
      learnerMessage,
      retryTranslator.outputText,
      language,
      retryTranslator.ragContextIds,
    );

    const retryComposite = computeCompositeConfidence(
      retryReviewer.confidenceScore,
      retryTranslator.ragContextUsed,
      retryTranslator.selfReportedConfidence,
      retryReviewer.passed,
    );

    if (retryReviewer.passed && retryComposite >= 70) {
      return await finalize({
        conversationId,
        learnerMessage,
        responseText: retryTranslator.outputText,
        confidenceScore: retryComposite,
        disposition: "returned",
        source: "ai",
        translatorResult: retryTranslator,
        reviewerResult: retryReviewer,
        retryCount: 1,
      });
    }

    // Retry failed — escalate
    return await finalize({
      conversationId,
      learnerMessage,
      responseText: retryTranslator.outputText,
      confidenceScore: retryComposite,
      disposition: "escalated",
      source: "ai_pending_review",
      translatorResult: retryTranslator,
      reviewerResult: retryReviewer,
      retryCount: 1,
    });
  }

  // Low confidence (< 50) or reviewer error — escalate immediately
  return await finalize({
    conversationId,
    learnerMessage,
    responseText: translatorResult.outputText,
    confidenceScore: compositeScore,
    disposition: "escalated",
    source: "ai_pending_review",
    translatorResult,
    reviewerResult,
    retryCount: 0,
  });
}

// ─── Finalize: persist message, pipeline run, handoff ───────

interface FinalizeParams {
  conversationId: string;
  learnerMessage: string;
  responseText: string;
  confidenceScore: number;
  disposition: "returned" | "escalated";
  source: "ai" | "ai_pending_review";
  translatorResult: {
    outputText: string;
    ragContextIds: string[];
    ragContextUsed: boolean;
    selfReportedConfidence: "high" | "medium" | "low";
    model: string;
    modelId: string;
    latencyMs: number;
  };
  reviewerResult: {
    passed: boolean;
    confidenceScore: number;
    reasoning: string;
    gapCategory: string | null;
    issues: string[];
    latencyMs: number;
  };
  retryCount: number;
}

async function finalize(params: FinalizeParams): Promise<OrchestratorResult> {
  const {
    conversationId,
    learnerMessage,
    responseText,
    confidenceScore,
    disposition,
    source,
    translatorResult,
    reviewerResult,
    retryCount,
  } = params;

  const content =
    disposition === "escalated"
      ? `${responseText}\n\n---\n_This response has not been fully verified and may contain inaccuracies. A human reviewer will check it shortly._`
      : responseText;

  // Save assistant message
  const message = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      source,
      confidenceScore,
    },
  });

  // Create PipelineRun
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      messageId: message.id,
      translatorModel: `${translatorResult.model}:${translatorResult.modelId}`,
      translatorOutput: translatorResult.outputText,
      translatorLatencyMs: translatorResult.latencyMs,
      reviewerOutput: JSON.stringify(reviewerResult),
      reviewerConfidence: confidenceScore,
      reviewerReasoning: reviewerResult.reasoning,
      ragContextIds: translatorResult.ragContextIds,
      retryCount,
      finalDisposition: disposition,
      gapCategory: reviewerResult.gapCategory,
    },
  });

  // Link message to pipeline run
  await prisma.message.update({
    where: { id: message.id },
    data: { pipelineRunId: pipelineRun.id },
  });

  // If escalated, create HandoffItem linked to this pipeline run
  if (disposition === "escalated") {
    await prisma.handoffItem.create({
      data: {
        learnerRequest: learnerMessage,
        modelAnswer: translatorResult.outputText,
        confidenceScore,
        reviewerReasoning: reviewerResult.reasoning,
        gapCategory: reviewerResult.gapCategory as
          | "missing_vocabulary"
          | "missing_cultural_context"
          | "missing_dialect_knowledge"
          | "missing_translation_pair"
          | undefined,
        status: "pending",
        pipelineRunId: pipelineRun.id,
      },
    });
  }

  return {
    responseText: content,
    confidenceScore,
    disposition,
    pipelineRunId: pipelineRun.id,
    source,
  };
}
