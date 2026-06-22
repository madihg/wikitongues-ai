import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";

/**
 * Full configuration ("recipe") for a single candidate, plus its eval runs
 * (with per-run score counts) and its lineage (parent + children names).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const { id } = await params;

  const candidate = await prisma.candidateModel.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, kind: true } },
      children: {
        select: { id: true, name: true, kind: true },
        orderBy: { createdAt: "asc" },
      },
      evalRuns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          promptSetLabel: true,
          judgeModel: true,
          status: true,
          trigger: true,
          nPrompts: true,
          winRate: true,
          meanRubric: true,
          published: true,
          createdAt: true,
          completedAt: true,
          _count: { select: { scores: true } },
        },
      },
      _count: { select: { evalRuns: true, modelOutputs: true } },
    },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json({ candidate });
}
