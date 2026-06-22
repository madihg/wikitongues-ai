import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { judgeWithSwap } from "@/lib/arena/judge";

/**
 * Optional LLM-judge pass (TRIAGE only). Compares this run's candidate vs the
 * champion on the held-out bank, each judgment run twice with positions swapped.
 * Records judgeScore + positionSwapAgreement per prompt; reports the swap-agreement
 * rate. Never used as a leaderboard score of record.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;
  const { id } = await params;

  const run = await prisma.evalRun.findUnique({ where: { id } });
  if (!run)
    return NextResponse.json({ error: "Eval run not found" }, { status: 404 });
  if (!run.judgeModel)
    return NextResponse.json(
      { error: "This run has no judgeModel set. Triage judging is opt-in." },
      { status: 400 },
    );

  // Champion to compare against.
  const champion =
    (await prisma.candidateModel.findFirst({
      where: { language: "igala", isChampion: true, archived: false },
    })) ??
    (await prisma.candidateModel.findFirst({
      where: {
        language: "igala",
        kind: "baseline",
        archived: false,
        NOT: { id: run.candidateModelId },
      },
      orderBy: { createdAt: "asc" },
    }));
  if (!champion)
    return NextResponse.json(
      { error: "No champion/baseline to compare against" },
      { status: 400 },
    );

  // This run's outputs, by prompt.
  const runOutputs = await prisma.modelOutput.findMany({
    where: { evalRunId: id },
    select: { id: true, promptId: true, bucket: true, outputText: true },
  });

  await prisma.evalRun.update({ where: { id }, data: { status: "judging" } });

  // Clear prior per-prompt (judge) rows for this run.
  await prisma.evalScore.deleteMany({
    where: { evalRunId: id, promptId: { not: null } },
  });

  let judged = 0;
  let swapAgreed = 0;
  let failed = 0;

  for (const out of runOutputs) {
    try {
      const championOutput = await prisma.modelOutput.findFirst({
        where: { promptId: out.promptId, candidateModelId: champion.id },
        orderBy: { createdAt: "desc" },
        select: { outputText: true },
      });
      if (!championOutput) continue;

      const prompt = await prisma.prompt.findUnique({
        where: { id: out.promptId },
        select: { text: true },
      });
      if (!prompt) continue;

      const verdict = await judgeWithSwap(run.judgeModel, {
        promptText: prompt.text,
        x: out.outputText, // run candidate
        y: championOutput.outputText, // champion
      });

      const judgeScore =
        verdict.winner === "x" ? 1 : verdict.winner === "y" ? 0 : 0.5;
      if (verdict.swapAgreement) swapAgreed += 1;

      await prisma.evalScore.create({
        data: {
          evalRunId: id,
          bucket: out.bucket ?? "authenticity",
          promptId: out.promptId,
          modelOutputId: out.id,
          judgeScore,
          judgeRationale: verdict.rationale,
          positionSwapAgreement: verdict.swapAgreement,
          rawJudgePayload: verdict.raw as unknown as object,
        },
      });
      judged += 1;
    } catch (e) {
      failed += 1;
      console.error(`judge: failed for prompt ${out.promptId}`, e);
    }
  }

  await prisma.evalRun.update({
    where: { id },
    data: { status: "awaiting_human" },
  });

  return NextResponse.json({
    judged,
    failed,
    swapAgreementRate: judged > 0 ? swapAgreed / judged : null,
    note: "Judge verdicts are triage only. Trust only swap-consistent verdicts; never report as a score of record.",
  });
}
