import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import type { VerificationStatus } from "@prisma/client";

/**
 * Collective-session support: surface items where annotators disagree (so the
 * group can resolve them) and edits pending verification (so they can be
 * promoted single_annotator -> multi_annotator_verified). This turns lonely
 * labeling into the community feedback loop.
 */
export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { isDemo: false },
    orderBy: { createdAt: "desc" },
    select: {
      promptId: true,
      winner: true,
      explanation: true,
      bucket: true,
      annotator: { select: { name: true, email: true } },
    },
  });

  // Group by prompt; contested = >=2 annotators who don't agree on the winner.
  const byPrompt = new Map<string, typeof comparisons>();
  for (const c of comparisons) {
    const arr = byPrompt.get(c.promptId) ?? [];
    arr.push(c);
    byPrompt.set(c.promptId, arr);
  }

  const contestedIds: string[] = [];
  for (const [promptId, rows] of byPrompt) {
    const winners = new Set(rows.map((r) => r.winner));
    if (rows.length >= 2 && winners.has("a") && winners.has("b"))
      contestedIds.push(promptId);
  }

  const promptTexts = contestedIds.length
    ? await prisma.prompt.findMany({
        where: { promptId: { in: contestedIds } },
        select: { promptId: true, text: true, bucket: true },
      })
    : [];
  const textByPrompt = new Map(promptTexts.map((p) => [p.promptId, p]));

  const contested = contestedIds.map((promptId) => ({
    promptId,
    text: textByPrompt.get(promptId)?.text ?? promptId,
    bucket: textByPrompt.get(promptId)?.bucket ?? null,
    votes: (byPrompt.get(promptId) ?? []).map((r) => ({
      winner: r.winner,
      explanation: r.explanation,
      annotator: r.annotator?.name ?? r.annotator?.email ?? "unknown",
    })),
  }));

  const pendingEdits = await prisma.outputEdit.findMany({
    where: { verificationStatus: "single_annotator", isDemo: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      correctedText: true,
      bucket: true,
      annotator: { select: { name: true, email: true } },
      modelOutput: { select: { prompt: { select: { text: true } } } },
    },
  });

  return NextResponse.json({ contested, pendingEdits });
}

const VALID: VerificationStatus[] = [
  "seed",
  "single_annotator",
  "multi_annotator_verified",
  "expert_reviewed",
];

export async function POST(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const editId = typeof body.editId === "string" ? body.editId : "";
  const status = body.status as VerificationStatus;
  if (!editId)
    return NextResponse.json({ error: "editId required" }, { status: 400 });
  if (!VALID.includes(status))
    return NextResponse.json({ error: "invalid status" }, { status: 400 });

  await prisma.outputEdit.update({
    where: { id: editId },
    data: { verificationStatus: status },
  });
  return NextResponse.json({ ok: true });
}
