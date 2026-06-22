import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";

/**
 * Eval runs: generate a candidate's answers on the held-out Igala bank, then
 * collect human pairwise/rubric to rank it. POST creates a run and freezes the
 * exact held-out prompt set used (reproducibility + contamination discipline).
 */
export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const runs = await prisma.evalRun.findMany({
    where: { language: "igala" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      candidateModel: {
        select: { id: true, name: true, kind: true, color: true },
      },
      _count: { select: { scores: true, modelOutputs: true } },
    },
  });

  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const candidateModelId =
    typeof body.candidateModelId === "string" ? body.candidateModelId : "";
  if (!candidateModelId)
    return NextResponse.json(
      { error: "candidateModelId is required" },
      { status: 400 },
    );

  const candidate = await prisma.candidateModel.findUnique({
    where: { id: candidateModelId },
    select: { id: true },
  });
  if (!candidate)
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Freeze the held-out bank used for this run (test split).
  const holdout = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true },
  });
  if (holdout.length === 0)
    return NextResponse.json(
      {
        error:
          "No held-out (test-split) prompts exist. Mark some prompts as held-out first.",
      },
      { status: 400 },
    );

  const run = await prisma.evalRun.create({
    data: {
      candidateModelId,
      language: "igala",
      promptSetLabel:
        typeof body.promptSetLabel === "string"
          ? body.promptSetLabel
          : "igala-heldout",
      holdoutPromptIds: holdout.map((p) => p.id),
      judgeModel: typeof body.judgeModel === "string" ? body.judgeModel : null,
      positionSwap: body.positionSwap !== false,
      status: "draft",
      trigger: "manual",
      nPrompts: holdout.length,
      triggeredById: guard.userId,
    },
  });

  return NextResponse.json({ run }, { status: 201 });
}
