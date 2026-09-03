import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { generateForCandidate, type RagChunk } from "@/lib/arena/providers";
import { searchRag } from "@/lib/rag";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";
import { buildRetrievalV2 } from "@/lib/arena/retrieval-v2";
import { buildRetrievalV4 } from "@/lib/arena/retrieval-v4";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";
import { generateWithRepairRound } from "@/lib/arena/repair-round";
import { buildV4FamilyTurn } from "@/lib/arena/frozen-exam";

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
  // Finding 11: provider failures (including an empty-output "success") are
  // recorded here and surfaced in the run's configSnapshot, never silently
  // absorbed into a scored ModelOutput.
  const failures: { promptId: string; reason: string }[] = [];

  for (const prompt of prompts) {
    try {
      let result;
      let ragContextIds: string[];
      let repairInfo: {
        repaired: boolean;
        firstPassText: string | null;
        repairViolations: unknown;
      } | null = null;
      if (
        candidate.versionLabel === "rag-v4" ||
        candidate.versionLabel === "rag-v4-1"
      ) {
        // The v4 serving path: v2's composition plus the corrections block
        // and the register-guarded, source-diversified parallel retrieval,
        // under IGALA_SYSTEM_V4. Its own buildRetrievalV4 call - never shared
        // with v2/v3, whose composition is frozen for comparability. The
        // audit trail gains edit:<id> entries for served corrections.
        //
        // rag-v4-1 = the SAME retrieval (buildRetrievalV4, unchanged) with
        // the v4.1 system prompt and the deterministic repair round: a dirty
        // first answer (allowlist / hyphen-prefix / tone-saturation) is
        // re-asked ONCE with the violations named, and the second answer is
        // kept regardless. generateWithRepairRound is a no-op passthrough
        // for rag-v4 (unit-tested), so the v4 arm's serving and accounting
        // stay byte-identical.
        const v4 = await buildRetrievalV4(prisma, {
          promptId: prompt.promptId,
          text: prompt.text,
          bucket: prompt.bucket,
          isHoldout: prompt.isHoldout,
        });
        //
        // The request assembly (user turn, exemplars, system prompt, and the
        // R8.3 allowTone gate on the raw question) lives in
        // src/lib/arena/frozen-exam.ts, shared with the frozen-exam runner,
        // so an output stored by an offline exam and one stored here cannot
        // drift apart.
        const { args, opts } = buildV4FamilyTurn(
          candidate.versionLabel,
          prompt,
          v4,
        );
        result = await generateWithRepairRound(
          candidate,
          args,
          (a) => generateForCandidate(candidate, a),
          opts,
        );
        ragContextIds = v4.contextIds;
        repairInfo = {
          repaired: result.repaired,
          firstPassText: result.firstPassText,
          repairViolations: result.repaired ? result.repairViolations : null,
        };
      } else if (
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

      // Finding 11: never persist an empty or whitespace-only provider output
      // as an answer - a provider failure recorded as a zero-scored
      // ModelOutput is a language failure that never happened.
      if (result.text.trim().length === 0) {
        failed++;
        failures.push({
          promptId: prompt.promptId,
          reason: "empty provider output",
        });
        console.error(
          `eval-run ${id}: empty output for prompt ${prompt.id} (not stored)`,
        );
        continue;
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
          ...(repairInfo
            ? {
                repaired: repairInfo.repaired,
                repairFirstPassText: repairInfo.firstPassText,
                repairViolations:
                  repairInfo.repairViolations !== null
                    ? (repairInfo.repairViolations as object)
                    : undefined,
              }
            : {}),
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
      failures.push({
        promptId: prompt.promptId,
        reason: (e as Error).message?.slice(0, 200) ?? "unknown error",
      });
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
      // The run log: every failure (including empty-output non-persists) is
      // recorded here, never inferred after the fact from a missing row.
      configSnapshot: {
        ...(typeof run.configSnapshot === "object" && run.configSnapshot
          ? (run.configSnapshot as object)
          : {}),
        generateFailureCount: failed,
        generateFailures: failures,
      },
    },
  });

  return NextResponse.json({ generated, failed, total: prompts.length });
}
