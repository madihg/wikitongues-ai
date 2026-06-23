import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import type { EvalBucket, VerificationStatus } from "@prisma/client";

/**
 * Live counts for the training builder: how much *usable* (non-held-out) signal
 * is available to build a job from, broken down by bucket and verification.
 * Held-out (test-split) prompts are excluded here too, so the numbers shown
 * match what the dataset builder will actually keep.
 */
export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  // DPO source: pairwise comparisons with a real winner (a|b, not tie) whose
  // prompt is NOT held-out.
  const pairwise = await prisma.pairwiseComparison.findMany({
    where: {
      winner: { in: ["a", "b"] },
      modelOutputA: { prompt: { isHoldout: false, language: "igala" } },
    },
    select: { bucket: true },
  });

  const dpoByBucket: Record<string, number> = {};
  for (const p of pairwise) {
    const key = p.bucket ?? "unassigned";
    dpoByBucket[key] = (dpoByBucket[key] ?? 0) + 1;
  }

  // SFT source: output edits whose prompt is NOT held-out.
  const edits = await prisma.outputEdit.findMany({
    where: {
      modelOutput: { prompt: { isHoldout: false, language: "igala" } },
    },
    select: { bucket: true, verificationStatus: true },
  });

  const sftByBucket: Record<string, number> = {};
  const sftByVerification: Record<string, number> = {};
  for (const e of edits) {
    const bk = e.bucket ?? "unassigned";
    sftByBucket[bk] = (sftByBucket[bk] ?? 0) + 1;
    const vs: VerificationStatus = e.verificationStatus;
    sftByVerification[vs] = (sftByVerification[vs] ?? 0) + 1;
  }

  return NextResponse.json({
    dpo: {
      total: pairwise.length,
      byBucket: dpoByBucket as Record<EvalBucket | "unassigned", number>,
    },
    sft: {
      total: edits.length,
      byBucket: sftByBucket as Record<EvalBucket | "unassigned", number>,
      byVerification: sftByVerification as Record<VerificationStatus, number>,
    },
  });
}
