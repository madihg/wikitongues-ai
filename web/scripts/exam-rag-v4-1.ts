/**
 * FROZEN EXAM for the rag-v4-1 arm ("Gemini 3.1 Pro + Igala RAG v4.1").
 *
 * Mirrors the eval-runs generate route's rag-v4-1 branch EXACTLY
 * (src/app/api/arena/eval-runs/[id]/generate/route.ts): buildRetrievalV4 on
 * the human slug, buildUserTurnV4, IGALA_SYSTEM_V4_1, and the repair round
 * via generateWithRepairRound with allowTone matched on the raw question -
 * an output stored here must be indistinguishable from one the route would
 * store, or the frozen numbers describe a system nobody can chat with.
 *
 * Additions over frontier-fill.ts (which has no rag-v4-1 mode): per-prompt
 * repair accounting (which prompts triggered the one re-ask, and for which
 * violations) printed in the summary, and ONE retry on a transient provider
 * error (5xx/429/timeout shapes), matching the task contract.
 *
 * Preconditions (all verified before any spend):
 *   - scripts/static-leak-check-v4-1.ts PASSES (Scope A over the v4.1 prompt
 *     and the 9 seeded grammar rows) - run it first, every time.
 *   - scripts/register-rag-v4-1.ts has been run (candidate exists, temp 0).
 *
 * Idempotent: existing frozen outputs for the arm are skipped (but their
 * repair history is unknown, so a complete repair count needs a single run).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/exam-rag-v4-1.ts
 */

import { prisma } from "@/lib/prisma";
import { generateForCandidate } from "@/lib/arena/providers";
import { buildRetrievalV4 } from "@/lib/arena/retrieval-v4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";
import { buildUserTurnV4 } from "@/lib/generation-prompt-v4";
import {
  generateWithRepairRound,
  type RepairViolation,
} from "@/lib/arena/repair-round";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";

const SLUG = "gemini-3-1-pro-rag-v4-1";

/** Transient provider failures worth exactly one retry; anything else is a
 * real error and is reported, not papered over. */
function isTransient(message: string): boolean {
  return /\b(429|500|502|503|504|529)\b|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|overloaded|temporarily|resource.*exhausted|unavailable/i.test(
    message,
  );
}

interface PromptRepairRecord {
  slug: string;
  repaired: boolean;
  violations: RepairViolation[];
  retried: boolean;
}

async function main() {
  const candidate = await prisma.candidateModel.findUnique({
    where: { slug: SLUG },
  });
  if (!candidate)
    throw new Error(
      `${SLUG} not registered - run scripts/register-rag-v4-1.ts`,
    );
  if (candidate.archived) throw new Error(`${SLUG} is archived`);
  const decoding = (candidate.decodingParams ?? {}) as Record<string, unknown>;
  if (decoding.temperature !== 0) {
    throw new Error(
      `${SLUG} temperature is ${String(decoding.temperature)}, expected 0`,
    );
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY missing - STOP (no provider substitution)",
    );
  }

  // One cheap probe before committing to 43 calls (frontier-fill policy).
  try {
    await generateForCandidate(
      {
        provider: candidate.provider,
        baseModelId: candidate.baseModelId,
        apiEndpoint: candidate.apiEndpoint,
        decodingParams: { ...decoding, maxTokens: 32 },
      },
      { userMessage: "hi" },
    );
  } catch (e) {
    throw new Error(
      `provider probe failed - STOPPING, no substitution: ${(e as Error).message.slice(0, 300)}`,
    );
  }

  const prompts = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  console.log(`frozen prompts: ${prompts.length}`);

  const existing = await prisma.modelOutput.findMany({
    where: { candidateModelId: candidate.id, isDemo: false },
    select: { promptId: true },
  });
  const done = new Set(existing.map((e) => e.promptId));

  const records: PromptRepairRecord[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let costUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const prompt of prompts) {
    if (done.has(prompt.id)) {
      skipped++;
      console.log(`  skip ${prompt.promptId} (output exists)`);
      continue;
    }

    // The route's retrieval, byte for byte: v4 retrieval, v4 user turn.
    const v4 = await buildRetrievalV4(prisma, {
      promptId: prompt.promptId,
      text: prompt.text,
      bucket: prompt.bucket,
      isHoldout: true,
    });

    const args = {
      userMessage: buildUserTurnV4(prompt.text, v4, prompt.bucket),
      goldExamples: v4.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V4_1,
    };
    // R8.3: tone saturation is the requested behavior when the prompt itself
    // asks for tone marks - same regex as the serving routes.
    const opts = { allowTone: /\btone/i.test(prompt.text) };

    let retried = false;
    try {
      let result;
      try {
        result = await generateWithRepairRound(
          candidate,
          args,
          (a) => generateForCandidate(candidate, a),
          opts,
        );
      } catch (e) {
        const msg = (e as Error).message;
        if (!isTransient(msg)) throw e;
        console.log(
          `  .. transient error on ${prompt.promptId}, retrying once: ${msg.slice(0, 120)}`,
        );
        retried = true;
        result = await generateWithRepairRound(
          candidate,
          args,
          (a) => generateForCandidate(candidate, a),
          opts,
        );
      }

      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: candidate.family,
          modelId: result.modelId,
          candidateModelId: candidate.id,
          bucket: prompt.bucket,
          outputText: result.text,
          ragContextIds: v4.contextIds,
          tokenCountIn: result.tokensIn ?? null,
          tokenCountOut: result.tokensOut ?? null,
          latencyMs: result.latencyMs,
          isDemo: false,
        },
      });
      created++;
      costUsd += estimateGenerationCostUsd({
        modelId: result.modelId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      tokensIn += result.tokensIn ?? 0;
      tokensOut += result.tokensOut ?? 0;
      records.push({
        slug: prompt.promptId,
        repaired: result.repaired,
        violations: result.repairViolations ?? [],
        retried,
      });
      const tag = result.repaired
        ? `REPAIRED (${(result.repairViolations ?? []).map((v) => v.kind).join(", ")})`
        : "clean";
      console.log(
        `  ok  ${prompt.promptId.padEnd(22)} ${tag.padEnd(50)} ${result.text.replace(/\s+/g, " ").slice(0, 50)}`,
      );
    } catch (e) {
      failed++;
      console.log(
        `  ERR ${prompt.promptId}${retried ? " (after 1 retry)" : ""}: ${(e as Error).message.slice(0, 200)}`,
      );
    }
  }

  const repairedRecs = records.filter((r) => r.repaired);
  console.log(`\nEXAM SUMMARY - ${candidate.name}`);
  console.log(
    `  created=${created} existing=${skipped} failed=${failed}  ~$${roundUsd(costUsd).toFixed(2)} (${tokensIn} in / ${tokensOut} out)`,
  );
  console.log(
    `  repair round fired on ${repairedRecs.length}/${records.length} generated prompts:`,
  );
  for (const r of repairedRecs) {
    console.log(
      `    ${r.slug.padEnd(22)} ${r.violations.map((v) => `${v.kind}: ${v.detail.slice(0, 100)}`).join(" | ")}`,
    );
  }
  const retriedRecs = records.filter((r) => r.retried);
  if (retriedRecs.length > 0) {
    console.log(
      `  transient retries: ${retriedRecs.map((r) => r.slug).join(", ")}`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
