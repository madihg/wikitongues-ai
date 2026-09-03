/**
 * TRAIN FILL for a single v4-family arm - option (a) pool prep, step 4
 * (2026-09-03 pool-prep task).
 *
 * Generates gemini-3-1-pro-rag-v4-1 outputs on exactly the TRAIN prompts the
 * pairing pool already serves: the 96 prompts train-queue-fill filled for
 * the bare `gemini-3-1-pro` arm (isHoldout=false), which the sibling
 * session's derived tone-stripped arm (`gemini-3-1-pro-tonestrip`) mirrors
 * exactly. Serving == measurement: this reuses the SAME shared assembly the
 * frozen exam and the live routes use
 * (src/lib/arena/frozen-exam.ts -> buildV4FamilyTurn, runsRepairRound), so an
 * output stored here is indistinguishable from one the chat route or
 * scripts/exam-rag-v4-1.ts would produce for the same prompt - repair round
 * included, first-pass text stored on repair, exactly as the exam does.
 *
 * Why not extend train-queue-fill.ts: that script's generateOne only knows
 * the v1/v2/v3 serving branches (buildUserTurnV2 / IGALA_SYSTEM_V2/V3) - it
 * has no v4-family branch, and retrofitting one inline would duplicate the
 * exact assembly frozen-exam.ts exists to keep singular. This script is
 * train-queue-fill's generate() narrowed to one v4-family arm and one fixed
 * prompt set, with the v4 retrieval + repair-round assembly swapped in.
 *
 * BUDGET: hard stop $3 (expected ~$1, per the task). Enforced by measuring
 * real spend from stored ModelOutput token counts after every call and
 * refusing the next call once measured + worst-case(next call) > $3 -
 * same rule shape as train-queue-fill's slice stop, at call granularity
 * since this run is small enough that a whole slice isn't needed.
 *
 * Idempotent: prompts that already have a non-demo output for this
 * candidate are skipped.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/train-fill-arm.ts
 */

import { prisma } from "@/lib/prisma";
import { generateForCandidate } from "@/lib/arena/providers";
import { buildRetrievalV4 } from "@/lib/arena/retrieval-v4";
import {
  buildV4FamilyTurn,
  runsRepairRound,
  type V4FamilyVersionLabel,
} from "@/lib/arena/frozen-exam";
import { generateWithRepairRound } from "@/lib/arena/repair-round";
import {
  estimateGenerationCostUsd,
  priceForModel,
  roundUsd,
} from "@/lib/arena/pricing";

const SLUG = "gemini-3-1-pro-rag-v4-1";
const VERSION_LABEL: V4FamilyVersionLabel = "rag-v4-1";
/** The bare Gemini arm whose train-prompt coverage defines the target set:
 * the 96 prompts already served to the pool, mirrored exactly by the
 * sibling session's tone-stripped arm. */
const REFERENCE_SLUG = "gemini-3-1-pro";

const HARD_CAP_USD = 3;
const MAX_TOKENS = 4096; // same Gemini train budget as train-queue-fill.ts
const WORST_CASE_IN = 4096; // same worst-case input assumption

function isTransient(message: string): boolean {
  return /\b(429|500|502|503|504|529)\b|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|overloaded|temporarily|resource.*exhausted|unavailable/i.test(
    message,
  );
}

/**
 * Scoped to TRAIN prompts only (isHoldout: false) - the frozen 43's exam
 * spend (scripts/exam-rag-v4-1.ts) is a separate budget and must not eat
 * into this script's $3 train cap. (Found live: the unscoped version
 * counted the pre-existing $0.29 frozen-exam spend against this cap and
 * halted one call early - harmless, since the cap is a safety margin, not
 * a target, but worth fixing before the next resume.)
 */
async function measuredSpendUsd(candidateId: string): Promise<number> {
  const outputs = await prisma.modelOutput.findMany({
    where: {
      candidateModelId: candidateId,
      isDemo: false,
      prompt: { isHoldout: false },
    },
    select: { modelId: true, tokenCountIn: true, tokenCountOut: true },
  });
  let usd = 0;
  for (const o of outputs) {
    usd += estimateGenerationCostUsd({
      modelId: o.modelId,
      tokensIn: o.tokenCountIn,
      tokensOut: o.tokenCountOut,
    });
  }
  return usd;
}

async function main() {
  const candidate = await prisma.candidateModel.findUnique({
    where: { slug: SLUG },
  });
  if (!candidate) {
    throw new Error(
      `${SLUG} not registered - run scripts/register-rag-v4-1.ts`,
    );
  }
  if (candidate.archived) throw new Error(`${SLUG} is archived`);
  if (candidate.versionLabel !== VERSION_LABEL) {
    throw new Error(
      `${SLUG} versionLabel is ${String(candidate.versionLabel)}, expected ${VERSION_LABEL}`,
    );
  }
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
  if (!runsRepairRound(VERSION_LABEL)) {
    // Defensive: this script exists specifically to exercise the repair
    // round on stored output. If the label stops running it, the "serving
    // == measurement" claim this script makes would be false.
    throw new Error(`${VERSION_LABEL} does not run the repair round`);
  }

  const reference = await prisma.candidateModel.findUnique({
    where: { slug: REFERENCE_SLUG },
  });
  if (!reference) {
    throw new Error(`reference arm ${REFERENCE_SLUG} not registered`);
  }
  const referenceOutputs = await prisma.modelOutput.findMany({
    where: {
      candidateModelId: reference.id,
      isDemo: false,
      prompt: { isHoldout: false },
    },
    select: { promptId: true },
  });
  const targetPromptIds = new Set(referenceOutputs.map((o) => o.promptId));
  console.log(
    `target set: ${targetPromptIds.size} train prompts (${REFERENCE_SLUG}'s train coverage)`,
  );

  // One cheap probe before committing to real spend.
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
    where: {
      id: { in: [...targetPromptIds] },
      isHoldout: false,
      language: "igala",
    },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  if (prompts.length !== targetPromptIds.size) {
    console.log(
      `  !! resolved ${prompts.length} prompt rows for ${targetPromptIds.size} target ids ` +
        `(a prompt may have been deleted or reclassified since ${REFERENCE_SLUG} was generated)`,
    );
  }

  const existing = await prisma.modelOutput.findMany({
    where: { candidateModelId: candidate.id, isDemo: false },
    select: { promptId: true },
  });
  const done = new Set(existing.map((e) => e.promptId));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let repaired = 0;
  let costUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  const price = priceForModel(candidate.baseModelId);
  const worstCaseCallUsd =
    (WORST_CASE_IN / 1_000_000) * price.input +
    (MAX_TOKENS / 1_000_000) * price.output;

  for (const prompt of prompts) {
    if (done.has(prompt.id)) {
      skipped++;
      continue;
    }

    const measured = await measuredSpendUsd(candidate.id);
    if (measured + worstCaseCallUsd > HARD_CAP_USD) {
      console.log(
        `HALT: $${measured.toFixed(2)} measured + $${worstCaseCallUsd.toFixed(2)} worst case ` +
          `would risk the $${HARD_CAP_USD} cap. Re-run to continue once spend is reviewed.`,
      );
      break;
    }

    const v4 = await buildRetrievalV4(prisma, {
      promptId: prompt.promptId,
      text: prompt.text,
      bucket: prompt.bucket,
      isHoldout: false,
    });
    const turn = buildV4FamilyTurn(VERSION_LABEL, prompt, v4);
    const args = {
      ...turn.args,
      // Same Gemini train budget as train-queue-fill.ts - the hidden
      // reasoning trace bills against the completion budget.
      decodingParams: { ...decoding, maxTokens: MAX_TOKENS },
    };

    let retried = false;
    try {
      let result;
      try {
        result = await generateWithRepairRound(
          candidate,
          args,
          (a) => generateForCandidate(candidate, a),
          turn.opts,
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
          turn.opts,
        );
      }

      costUsd += estimateGenerationCostUsd({
        modelId: result.modelId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      tokensIn += result.tokensIn ?? 0;
      tokensOut += result.tokensOut ?? 0;

      // Finding 11: never persist an empty/whitespace-only provider output
      // as an answer.
      if (result.text.trim().length === 0) {
        failed++;
        console.log(
          `  ERR ${prompt.promptId}: provider returned empty output (not stored)`,
        );
        continue;
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
          repaired: result.repaired,
          repairFirstPassText: result.firstPassText,
          repairViolations: result.repaired
            ? (result.repairViolations as unknown as object)
            : undefined,
        },
      });
      created++;
      if (result.repaired) repaired++;
      const tag = result.repaired
        ? `REPAIRED (${(result.repairViolations ?? []).map((v) => v.kind).join(", ")})`
        : "clean";
      console.log(
        `  ok  ${prompt.promptId.padEnd(24)} ${tag.padEnd(50)}${retried ? " [retried]" : ""}`,
      );
    } catch (e) {
      failed++;
      console.log(
        `  ERR ${prompt.promptId}${retried ? " (after 1 retry)" : ""}: ${(e as Error).message.slice(0, 200)}`,
      );
    }
  }

  const finalMeasured = await measuredSpendUsd(candidate.id);
  console.log(`\nTRAIN FILL SUMMARY - ${SLUG}`);
  console.log(
    `  created=${created} existing=${skipped} failed=${failed} repaired=${repaired}`,
  );
  console.log(
    `  this run: ~$${roundUsd(costUsd).toFixed(2)} (${tokensIn} in / ${tokensOut} out); ` +
      `measured total on this candidate: $${finalMeasured.toFixed(2)} of the $${HARD_CAP_USD} cap`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
