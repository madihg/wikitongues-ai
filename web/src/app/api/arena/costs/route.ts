import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";

/**
 * The holistic cost ledger. One place to see every dollar the instrument spends:
 *   - inference: estimated from token counts on every generated output (eval +
 *     arena), grouped by provider
 *   - fine-tune: Together (and any) training runs, from FineTuneJob.costUsd —
 *     this is the "Together sessions" line Halim asked for
 *   - ledger:    explicit CostEntry rows (judge calls, manual entries)
 * Inference figures are estimates against a published-rate table (pricing.ts).
 *
 * THREE KINDS OF MONEY, never summed into one number:
 *   - CREDITS      prepaid API balance. Cash off the card, and the only cash
 *                  the per-provider burn-down can draw down.
 *   - SUBSCRIPTION plan seats and consumer-plan top-ups (Claude Max, and the
 *                  "prepaid extra usage" charges that sit on it). Also cash,
 *                  but it buys the team's own tooling rather than API balance,
 *                  so it has no consumption counterpart here. It is reported
 *                  beside credits, counted in cashTotal, and kept OUT of the
 *                  burn-down, where it would otherwise read as a purchased
 *                  balance that never burns.
 *   - CONSUMPTION  the burn itself, priced live from stored token counts.
 *
 * ONE SOURCE OF TRUTH PER DOLLAR. Generation cost is counted exactly once, from
 * the live token-based computation over every ModelOutput. CostEntry rows in
 * category "eval_generation" (written by scripts such as train-queue-fill.ts)
 * describe generation whose outputs are already stored and therefore already
 * priced above, so they are EXCLUDED from every consumption sum: the ledger
 * total, the consumption total, the per-provider burn-down and the Together
 * roll-up. They stay in ledger.entries as an audit trail, flagged
 * countedInInference: true so the UI can show them as already-counted rather
 * than hiding them. No CostEntry row is ever deleted or mutated by this route.
 */

/**
 * Ledger categories whose money is already counted by the live token-based
 * inference computation. Kept in the ledger listing, kept out of every sum.
 */
const COUNTED_IN_INFERENCE_CATEGORIES = new Set(["eval_generation"]);

/** Ledger categories that are CASH off the card rather than consumption. */
const CASH_CATEGORIES = new Set(["credits", "subscription"]);

/**
 * Providers whose spend is Claude spend, for the Claude roll-up.
 *
 * anthropic is direct. openrouter is here because every Claude arm has been
 * served through it since the direct Anthropic key lapsed (2026-09-01) - the
 * ledger row for those credits says so in its own label. If a non-Claude model
 * is ever served through OpenRouter, this attribution stops being exact and
 * this set is the one place to fix.
 */
const CLAUDE_PROVIDERS = new Set(["anthropic", "openrouter"]);

function providerFromModelId(modelId: string): string {
  const id = (modelId || "").toLowerCase();
  if (id.includes("claude")) return "anthropic";
  if (id.includes("gpt")) return "openai";
  if (id.includes("gemini")) return "google";
  if (
    id.includes("llama") ||
    id.includes("qwen") ||
    id.includes("mistral") ||
    id.includes("together")
  )
    return "together";
  return "other";
}

export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  // Inference — estimate from token counts on every generated output.
  const outputs = await prisma.modelOutput.findMany({
    select: {
      modelId: true,
      tokenCountIn: true,
      tokenCountOut: true,
      candidateModel: { select: { provider: true } },
    },
  });

  const inferenceByProvider = new Map<
    string,
    { amount: number; calls: number }
  >();
  let inferenceTotal = 0;
  for (const o of outputs) {
    const amt = estimateGenerationCostUsd({
      modelId: o.modelId,
      tokensIn: o.tokenCountIn,
      tokensOut: o.tokenCountOut,
    });
    inferenceTotal += amt;
    const provider =
      o.candidateModel?.provider ?? providerFromModelId(o.modelId);
    const cur = inferenceByProvider.get(provider) ?? { amount: 0, calls: 0 };
    cur.amount += amt;
    cur.calls += 1;
    inferenceByProvider.set(provider, cur);
  }

  // Fine-tune — the Together "sessions" cost.
  const jobs = await prisma.fineTuneJob.findMany({
    where: { costUsd: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      method: true,
      baseModelId: true,
      costUsd: true,
      status: true,
      createdAt: true,
    },
  });

  const finetuneByProvider = new Map<
    string,
    { amount: number; jobs: number }
  >();
  let finetuneTotal = 0;
  for (const j of jobs) {
    const amt = j.costUsd ?? 0;
    finetuneTotal += amt;
    const cur = finetuneByProvider.get(j.provider) ?? { amount: 0, jobs: 0 };
    cur.amount += amt;
    cur.jobs += 1;
    finetuneByProvider.set(j.provider, cur);
  }

  // Ledger — explicit entries. Three kinds live here and they must never be
  // summed into one number:
  //   - "credits" is CASH leaving the card (a receipt exists);
  //   - "eval_generation" rows describe generation already priced above from
  //     stored token counts, so counting them again would double-count;
  //   - everything else is CONSUMPTION that has no other source of truth
  //     (judge calls, manual entries) and burns the credits down.
  const entries = await prisma.costEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const creditEntries = entries.filter((e) => e.category === "credits");
  const subscriptionEntries = entries.filter(
    (e) => e.category === "subscription",
  );
  // Consumption the ledger is the ONLY record of. eval_generation is excluded
  // because the live token-based inference figure already covers it.
  const consumptionEntries = entries.filter(
    (e) =>
      !CASH_CATEGORIES.has(e.category) &&
      !COUNTED_IN_INFERENCE_CATEGORIES.has(e.category),
  );
  const creditsTotal = creditEntries.reduce((s, e) => s + e.amountUsd, 0);
  const subscriptionTotal = subscriptionEntries.reduce(
    (s, e) => s + e.amountUsd,
    0,
  );
  // All money off the card. Subscriptions belong here - they are as real a
  // cash cost as a credit purchase - but they are NOT in cashByProvider below,
  // which feeds the burn-down.
  const cashTotal = creditsTotal + subscriptionTotal;
  const ledgerConsumptionTotal = consumptionEntries.reduce(
    (s, e) => s + e.amountUsd,
    0,
  );

  const cashByProvider = new Map<string, number>();
  for (const e of creditEntries) {
    cashByProvider.set(
      e.provider,
      (cashByProvider.get(e.provider) ?? 0) + e.amountUsd,
    );
  }

  const togetherFromLedger = consumptionEntries
    .filter((e) => e.provider === "together")
    .reduce((s, e) => s + e.amountUsd, 0);
  const togetherTotal =
    (finetuneByProvider.get("together")?.amount ?? 0) +
    (inferenceByProvider.get("together")?.amount ?? 0) +
    togetherFromLedger;

  // Consumption only. Cash is reported beside it, never inside it, and
  // ledgerConsumptionTotal already excludes the eval_generation rows that
  // inferenceTotal accounts for.
  const consumptionTotal =
    inferenceTotal + finetuneTotal + ledgerConsumptionTotal;

  // Per-provider burn-down where we know both sides: CREDITS bought minus
  // consumption estimated/billed. Only providers with a recorded purchase
  // appear - a burn-down against unknown credits would be an invented number.
  // Subscription rows are deliberately absent: they buy no API balance, so
  // including them would show a permanent unburnt remainder that is not real.
  const providers = new Set<string>([...cashByProvider.keys()]);
  const burndown = [...providers].map((provider) => {
    const purchased = cashByProvider.get(provider) ?? 0;
    const consumed =
      (inferenceByProvider.get(provider)?.amount ?? 0) +
      (finetuneByProvider.get(provider)?.amount ?? 0) +
      consumptionEntries
        .filter((e) => e.provider === provider)
        .reduce((s, e) => s + e.amountUsd, 0);
    return {
      provider,
      purchased: roundUsd(purchased),
      consumed: roundUsd(consumed),
      remainingEstimate: roundUsd(purchased - consumed),
    };
  });

  // ── The Claude roll-up ──────────────────────────────────────────────────
  // What Claude has cost this project, in one place, because it is the answer
  // to a question that keeps being asked and the ledger could only answer it
  // by hand. Cash and consumption stay separate here too: `cash` is receipts,
  // `consumption` is the measured burn of Claude models, and the two are
  // never added. The subscription is the large half and it is easy to miss,
  // because it never appears in a burn-down or a token count.
  const claudeSubscription = subscriptionEntries
    .filter((e) => CLAUDE_PROVIDERS.has(e.provider))
    .reduce((s, e) => s + e.amountUsd, 0);
  const claudeCredits = creditEntries
    .filter((e) => CLAUDE_PROVIDERS.has(e.provider))
    .reduce((s, e) => s + e.amountUsd, 0);
  const claudeConsumption = [...CLAUDE_PROVIDERS].reduce(
    (s, p) =>
      s +
      (inferenceByProvider.get(p)?.amount ?? 0) +
      (finetuneByProvider.get(p)?.amount ?? 0) +
      consumptionEntries
        .filter((e) => e.provider === p)
        .reduce((a, e) => a + e.amountUsd, 0),
    0,
  );
  const claudeEntries = entries.filter(
    (e) => CASH_CATEGORIES.has(e.category) && CLAUDE_PROVIDERS.has(e.provider),
  );

  return NextResponse.json({
    // Kept for the existing UI: now consumption-only, with cash split out.
    grandTotal: roundUsd(consumptionTotal),
    cashTotal: roundUsd(cashTotal),
    creditsTotal: roundUsd(creditsTotal),
    subscriptionTotal: roundUsd(subscriptionTotal),
    claude: {
      // Cash off the card for Claude: plan seats plus API credits.
      subscription: roundUsd(claudeSubscription),
      credits: roundUsd(claudeCredits),
      cash: roundUsd(claudeSubscription + claudeCredits),
      // Measured burn of Claude models. A DIFFERENT money from the cash above:
      // reported beside it, never added to it.
      consumption: roundUsd(claudeConsumption),
      providers: [...CLAUDE_PROVIDERS],
      entries: claudeEntries.map((e) => ({
        id: e.id,
        category: e.category,
        provider: e.provider,
        label: e.label,
        amount: roundUsd(e.amountUsd),
        estimated: e.estimated,
        createdAt: e.createdAt,
      })),
    },
    burndown,
    togetherTotal: roundUsd(togetherTotal),
    inference: {
      total: roundUsd(inferenceTotal),
      calls: outputs.length,
      byProvider: [...inferenceByProvider.entries()]
        .map(([provider, v]) => ({
          provider,
          amount: roundUsd(v.amount),
          calls: v.calls,
        }))
        .sort((a, b) => b.amount - a.amount),
    },
    finetune: {
      total: roundUsd(finetuneTotal),
      byProvider: [...finetuneByProvider.entries()]
        .map(([provider, v]) => ({
          provider,
          amount: roundUsd(v.amount),
          jobs: v.jobs,
        }))
        .sort((a, b) => b.amount - a.amount),
      jobs: jobs.map((j) => ({
        id: j.id,
        provider: j.provider,
        method: j.method,
        baseModelId: j.baseModelId,
        amount: roundUsd(j.costUsd ?? 0),
        status: j.status,
        createdAt: j.createdAt,
      })),
    },
    ledger: {
      total: roundUsd(ledgerConsumptionTotal),
      cashTotal: roundUsd(cashTotal),
      creditsTotal: roundUsd(creditsTotal),
      subscriptionTotal: roundUsd(subscriptionTotal),
      entries: entries.map((e) => ({
        id: e.id,
        category: e.category,
        provider: e.provider,
        label: e.label,
        amount: roundUsd(e.amountUsd),
        estimated: e.estimated,
        // True when this row's money is already inside the inference figure,
        // so it is listed for audit but left out of every consumption sum.
        countedInInference: COUNTED_IN_INFERENCE_CATEGORIES.has(e.category),
        createdAt: e.createdAt,
      })),
    },
  });
}
