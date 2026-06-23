import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import type { EvalBucket } from "@prisma/client";

/**
 * Head-to-head diff over the held-out bank (Prompt.split === "test").
 *
 * For each held-out prompt we surface candidate A's latest output, candidate
 * B's latest output, and any human PairwiseComparison between those two
 * outputs (winner + explanation). Returns [] gracefully if either candidate
 * has produced no outputs.
 */
export async function GET(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json(
      { error: "Both ?a= and ?b= candidate ids are required" },
      { status: 400 },
    );
  }
  if (a === b) {
    return NextResponse.json(
      { error: "Pick two different candidates" },
      { status: 400 },
    );
  }

  const [candA, candB] = await Promise.all([
    prisma.candidateModel.findUnique({
      where: { id: a },
      select: { id: true, name: true, color: true, kind: true },
    }),
    prisma.candidateModel.findUnique({
      where: { id: b },
      select: { id: true, name: true, color: true, kind: true },
    }),
  ]);

  if (!candA || !candB) {
    return NextResponse.json(
      { error: "One or both candidates not found" },
      { status: 404 },
    );
  }

  // Held-out bank.
  const prompts = await prisma.prompt.findMany({
    where: { split: "test" },
    orderBy: [{ bucket: "asc" }, { promptId: "asc" }],
    select: { id: true, promptId: true, bucket: true, text: true },
  });

  if (prompts.length === 0) {
    return NextResponse.json({
      candidateA: candA,
      candidateB: candB,
      rows: [],
    });
  }

  const promptIds = prompts.map((p) => p.id);

  // Latest output per (prompt, candidate) for both candidates in one pass.
  const outputs = await prisma.modelOutput.findMany({
    where: {
      promptId: { in: promptIds },
      candidateModelId: { in: [a, b] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      promptId: true,
      candidateModelId: true,
      outputText: true,
      createdAt: true,
    },
  });

  // First write wins because the list is sorted newest-first.
  const latestA = new Map<string, { id: string; text: string }>();
  const latestB = new Map<string, { id: string; text: string }>();
  for (const o of outputs) {
    const bucketMap = o.candidateModelId === a ? latestA : latestB;
    if (!bucketMap.has(o.promptId)) {
      bucketMap.set(o.promptId, { id: o.id, text: o.outputText });
    }
  }

  if (latestA.size === 0 || latestB.size === 0) {
    // One candidate has nothing to compare against; return shells but no rows.
    return NextResponse.json({
      candidateA: candA,
      candidateB: candB,
      rows: [],
    });
  }

  // Pull comparisons that pair the two specific outputs we picked.
  const outputIdsA = new Set([...latestA.values()].map((v) => v.id));
  const outputIdsB = new Set([...latestB.values()].map((v) => v.id));
  const allOutputIds = [...outputIdsA, ...outputIdsB];

  const comparisons = await prisma.pairwiseComparison.findMany({
    where: {
      modelOutputAId: { in: allOutputIds },
      modelOutputBId: { in: allOutputIds },
    },
    orderBy: { createdAt: "desc" },
    select: {
      modelOutputAId: true,
      modelOutputBId: true,
      winner: true,
      explanation: true,
    },
  });

  // Index comparisons by the unordered output pair, normalizing winner to our
  // A/B candidate orientation.
  const comparisonByPair = new Map<
    string,
    { winner: "a" | "b" | "tie"; explanation: string }
  >();
  const pairKey = (x: string, y: string) => [x, y].sort().join("::");
  for (const c of comparisons) {
    const key = pairKey(c.modelOutputAId, c.modelOutputBId);
    if (comparisonByPair.has(key)) continue; // keep newest
    let winner: "a" | "b" | "tie" = "tie";
    if (c.winner === "a" || c.winner === "b") {
      // The comparison's "a" winner refers to its modelOutputAId. Translate to
      // our candidate-A orientation: which side does that output belong to?
      const winningOutputId =
        c.winner === "a" ? c.modelOutputAId : c.modelOutputBId;
      winner = outputIdsA.has(winningOutputId) ? "a" : "b";
    }
    comparisonByPair.set(key, { winner, explanation: c.explanation });
  }

  const rows = prompts
    .map((p) => {
      const oa = latestA.get(p.id);
      const ob = latestB.get(p.id);
      if (!oa || !ob) return null;
      const comparison = comparisonByPair.get(pairKey(oa.id, ob.id)) ?? null;
      return {
        promptId: p.id,
        promptCode: p.promptId,
        bucket: p.bucket as EvalBucket,
        promptText: p.text,
        outputA: oa.text,
        outputB: ob.text,
        comparison,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json({ candidateA: candA, candidateB: candB, rows });
}
