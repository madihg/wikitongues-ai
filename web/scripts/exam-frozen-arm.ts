/**
 * FROZEN EXAM for any v4-family arm, on any provider.
 *
 * The generalization of scripts/exam-rag-v4-1.ts (which stays in the tree,
 * untouched, as the frozen reference implementation of the v4.1 assembly that
 * produced the gemini-3-1-pro-rag-v4-1 numbers). Everything that decides what
 * gets SENT now lives in src/lib/arena/frozen-exam.ts, which the eval-runs
 * generate route imports too, so an output stored by this script and an output
 * stored by the route are assembled by the same code, not by two copies of it:
 *
 *   rag-v4    -> buildRetrievalV4 + buildUserTurnV4 + IGALA_SYSTEM_V4
 *                and NO repair round
 *   rag-v4-1  -> the SAME retrieval and user turn + IGALA_SYSTEM_V4_1
 *                and the one-shot repair round
 *
 * "No repair round for rag-v4" is not re-implemented here: every arm goes
 * through generateWithRepairRound, which is a documented, unit-tested no-op
 * passthrough for every label but rag-v4-1 - exactly as in the route. The
 * summary ASSERTS that a rag-v4 arm reported zero repairs, so the claim is
 * checked against what actually happened rather than asserted in a comment.
 *
 * PROVIDER-AGNOSTIC: the key precondition is derived from the candidate's own
 * provider column (openrouter -> OPENROUTER_API_KEY, google ->
 * GOOGLE_GENERATIVE_AI_API_KEY, ...). A missing key STOPS the run; nothing
 * here ever substitutes another provider or another key.
 *
 * DECODING: temperature must be deterministic (0) or DELIBERATELY OMITTED
 * (JSON null - the sanctioned opt-out for Claude Opus 5, which rejects the
 * parameter). Any other value stops the run: a frozen exam at an unpinned
 * temperature is not reproducible.
 *
 * BUDGET: a hard running-total ceiling (--budget, default $8). The estimate
 * uses pricing.ts and is checked BEFORE each prompt, so the ceiling can be
 * crossed by at most one prompt's spend.
 *
 * Preconditions to run first, every time (they are not run from here, so a
 * green exam can never be mistaken for a green leak check):
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v4.ts
 *   npx tsx --env-file=.env.local scripts/static-leak-check-v4-1.ts
 *
 * Idempotent: existing frozen outputs for an arm are skipped (their repair
 * history is unknown, so a complete repair count needs a single clean run).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/exam-frozen-arm.ts <slug> [slug ...] [--budget 8]
 */

import { prisma } from "@/lib/prisma";
import { generateForCandidate } from "@/lib/arena/providers";
import { buildRetrievalV4 } from "@/lib/arena/retrieval-v4";
import {
  buildV4FamilyTurn,
  isV4FamilyVersionLabel,
  runsRepairRound,
} from "@/lib/arena/frozen-exam";
import {
  generateWithRepairRound,
  type RepairViolation,
} from "@/lib/arena/repair-round";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";

/** Which environment key each provider path reads. Mirrors providers.ts;
 * checked up front so a dead key costs zero calls instead of 43 failures. */
const KEY_FOR_PROVIDER: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
};

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

class BudgetExceeded extends Error {}

function parseArgs(argv: string[]): { slugs: string[]; budgetUsd: number } {
  const slugs: string[] = [];
  let budgetUsd = 8;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--budget") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0)
        throw new Error("--budget needs a positive number of dollars");
      budgetUsd = v;
    } else {
      slugs.push(argv[i]);
    }
  }
  if (slugs.length === 0)
    throw new Error(
      "usage: exam-frozen-arm.ts <candidate-slug> [slug ...] [--budget 8]",
    );
  return { slugs, budgetUsd };
}

/** Running total across EVERY arm in this invocation - the budget is one
 * ceiling for the run, not one per arm. */
let spentUsd = 0;

async function examineArm(slug: string, budgetUsd: number) {
  const candidate = await prisma.candidateModel.findUnique({ where: { slug } });
  if (!candidate) throw new Error(`${slug} is not registered`);
  if (candidate.archived) throw new Error(`${slug} is archived`);

  const label = candidate.versionLabel;
  if (!isV4FamilyVersionLabel(label)) {
    throw new Error(
      `${slug}: versionLabel is ${String(label)}; this exam serves the v4 family only (rag-v4, rag-v4-1)`,
    );
  }

  const decoding = (candidate.decodingParams ?? {}) as Record<string, unknown>;
  const temp = decoding.temperature;
  const tempOmitted = temp === null;
  if (!tempOmitted && temp !== 0) {
    throw new Error(
      `${slug} temperature is ${String(temp)}; expected 0, or null to omit the parameter`,
    );
  }

  const keyName = KEY_FOR_PROVIDER[candidate.provider];
  if (!keyName)
    throw new Error(
      `${slug}: no key mapping for provider ${candidate.provider} - refusing to guess`,
    );
  if (!process.env[keyName]) {
    throw new Error(
      `${keyName} missing for ${slug} (provider ${candidate.provider}) - STOP (no provider substitution)`,
    );
  }

  console.log(
    `\n=== ${candidate.name} (${slug}) ===\n` +
      `  provider=${candidate.provider} model=${candidate.baseModelId} version=${label} ` +
      `temperature=${tempOmitted ? "OMITTED" : String(temp)} repairRound=${runsRepairRound(label)}`,
  );

  // One cheap probe before committing to 43 calls (frontier-fill policy):
  // one output token, so a dead key or empty credit balance costs ~nothing.
  try {
    await generateForCandidate(
      {
        provider: candidate.provider,
        baseModelId: candidate.baseModelId,
        apiEndpoint: candidate.apiEndpoint,
        decodingParams: { ...decoding, maxTokens: 1 },
      },
      { userMessage: "hi" },
    );
  } catch (e) {
    throw new Error(
      `provider probe failed for ${slug} - STOPPING, no substitution: ${(e as Error).message.slice(0, 300)}`,
    );
  }

  const prompts = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
  console.log(`  frozen prompts: ${prompts.length}`);

  const existing = await prisma.modelOutput.findMany({
    where: { candidateModelId: candidate.id, isDemo: false },
    select: { promptId: true },
  });
  const done = new Set(existing.map((e) => e.promptId));

  const records: PromptRepairRecord[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let armCostUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for (const prompt of prompts) {
      if (done.has(prompt.id)) {
        skipped++;
        console.log(`  skip ${prompt.promptId} (output exists)`);
        continue;
      }
      if (spentUsd >= budgetUsd) {
        throw new BudgetExceeded(
          `running total $${spentUsd.toFixed(2)} reached the $${budgetUsd.toFixed(2)} ceiling`,
        );
      }

      // The route's retrieval, byte for byte - and identical for both labels.
      const v4 = await buildRetrievalV4(prisma, {
        promptId: prompt.promptId,
        text: prompt.text,
        bucket: prompt.bucket,
        isHoldout: true,
      });
      const { args, opts } = buildV4FamilyTurn(label, prompt, v4);

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
        const cost = estimateGenerationCostUsd({
          modelId: result.modelId,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        });
        armCostUsd += cost;
        spentUsd += cost;
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
          `  ok  ${prompt.promptId.padEnd(22)} ${tag.padEnd(46)} $${spentUsd.toFixed(2)}  ${result.text.replace(/\s+/g, " ").slice(0, 46)}`,
        );
      } catch (e) {
        failed++;
        console.log(
          `  ERR ${prompt.promptId}${retried ? " (after 1 retry)" : ""}: ${(e as Error).message.slice(0, 200)}`,
        );
      }
    }
  } finally {
    const repairedRecs = records.filter((r) => r.repaired);
    console.log(`\n  EXAM SUMMARY - ${candidate.name}`);
    console.log(
      `    created=${created} existing=${skipped} failed=${failed}  ~$${roundUsd(armCostUsd).toFixed(2)} (${tokensIn} in / ${tokensOut} out)  running total ~$${roundUsd(spentUsd).toFixed(2)}`,
    );
    console.log(
      `    repair round fired on ${repairedRecs.length}/${records.length} generated prompts` +
        (runsRepairRound(label) ? ":" : " (arm runs no repair round)"),
    );
    for (const r of repairedRecs) {
      console.log(
        `      ${r.slug.padEnd(22)} ${r.violations.map((v) => `${v.kind}: ${v.detail.slice(0, 100)}`).join(" | ")}`,
      );
    }
    const retriedRecs = records.filter((r) => r.retried);
    if (retriedRecs.length > 0) {
      console.log(
        `    transient retries: ${retriedRecs.map((r) => r.slug).join(", ")}`,
      );
    }
    // Checked, not asserted in prose: a non-v4.1 arm that reported a repair
    // would mean the no-op passthrough broke and the arm's outputs are not
    // comparable with its own history.
    if (!runsRepairRound(label) && repairedRecs.length > 0) {
      throw new Error(
        `${slug}: versionLabel ${label} must not run the repair round, but ${repairedRecs.length} prompts reported one`,
      );
    }
  }
}

async function main() {
  const { slugs, budgetUsd } = parseArgs(process.argv.slice(2));
  console.log(
    `frozen exam: ${slugs.join(", ")}  budget ceiling $${budgetUsd.toFixed(2)}`,
  );
  for (const slug of slugs) {
    try {
      await examineArm(slug, budgetUsd);
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        console.log(`\nSTOPPED: ${e.message}`);
        break;
      }
      throw e;
    }
  }
  console.log(`\nTOTAL ESTIMATED SPEND THIS RUN: ~$${spentUsd.toFixed(2)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
