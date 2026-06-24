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
 */

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

  // Ledger — explicit entries (judge calls, manual).
  const entries = await prisma.costEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const ledgerTotal = entries.reduce((s, e) => s + e.amountUsd, 0);

  const togetherFromLedger = entries
    .filter((e) => e.provider === "together")
    .reduce((s, e) => s + e.amountUsd, 0);
  const togetherTotal =
    (finetuneByProvider.get("together")?.amount ?? 0) +
    (inferenceByProvider.get("together")?.amount ?? 0) +
    togetherFromLedger;

  const grandTotal = inferenceTotal + finetuneTotal + ledgerTotal;

  return NextResponse.json({
    grandTotal: roundUsd(grandTotal),
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
      total: roundUsd(ledgerTotal),
      entries: entries.map((e) => ({
        id: e.id,
        category: e.category,
        provider: e.provider,
        label: e.label,
        amount: roundUsd(e.amountUsd),
        estimated: e.estimated,
        createdAt: e.createdAt,
      })),
    },
  });
}
