import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isResearcher } from "@/lib/personas";
import { firstPairs, MAX_SHOWS_PER_PROMPT } from "@/lib/pairing";

/**
 * Real numbers for the annotator dashboard. Everything here is scoped to the
 * signed-in user and excludes demo-session rows (isDemo=true), so the cards and
 * activity feed reflect what this person actually logged — not mock data.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const annotatorId = session.user.id;
  const researcher = isResearcher(session.user.role, session.user.email);

  // Queue remaining — mirrors /api/annotations/next: eligible prompts (2+ model
  // outputs), capped pairs per prompt, minus the pairs this user already did.
  const promptsWithOutputs = await prisma.prompt.findMany({
    where: { modelOutputs: { some: {} } },
    select: {
      promptId: true,
      // Same deterministic order as /api/annotations/next so the pending count
      // here can never drift from what the queue actually serves.
      modelOutputs: {
        select: { id: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  const eligible = promptsWithOutputs.filter((p) => p.modelOutputs.length >= 2);

  const doneRows = await prisma.pairwiseComparison.findMany({
    where: { annotatorId, isDemo: false },
    select: { modelOutputAId: true, modelOutputBId: true, promptId: true },
  });
  const donePairs = new Set(
    doneRows.map(
      (c) =>
        `${c.promptId}:${[c.modelOutputAId, c.modelOutputBId].sort().join(":")}`,
    ),
  );

  let total = 0;
  for (const p of eligible) {
    for (const [i, j] of firstPairs(
      p.modelOutputs.length,
      MAX_SHOWS_PER_PROMPT,
    )) {
      const key = `${p.promptId}:${[p.modelOutputs[i].id, p.modelOutputs[j].id].sort().join(":")}`;
      if (!donePairs.has(key)) total++;
    }
  }
  const pending = total;

  const [completed, rubricScores, coldAnswers] = await Promise.all([
    prisma.pairwiseComparison.count({ where: { annotatorId, isDemo: false } }),
    prisma.rubricAxisScore.count({ where: { annotatorId, isDemo: false } }),
    prisma.coldAuthorAnswer.count({ where: { annotatorId, isDemo: false } }),
  ]);

  const [promptsInCatalogue, pendingReviews] = researcher
    ? await Promise.all([
        prisma.prompt.count(),
        prisma.handoffItem.count({ where: { status: "pending" } }),
      ])
    : [0, 0];

  // Recent activity = this user's latest comparisons + cold-authored answers.
  const [recentPairwise, recentCold] = await Promise.all([
    prisma.pairwiseComparison.findMany({
      where: { annotatorId, isDemo: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { promptId: true, winner: true, createdAt: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { annotatorId, isDemo: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { createdAt: true, prompt: { select: { text: true } } },
    }),
  ]);

  // PairwiseComparison stores the PUBLIC promptId string, not a FK — map to text.
  const promptIds = [...new Set(recentPairwise.map((r) => r.promptId))];
  const promptText = new Map(
    (
      await prisma.prompt.findMany({
        where: { promptId: { in: promptIds } },
        select: { promptId: true, text: true },
      })
    ).map((p) => [p.promptId, p.text]),
  );

  const WINNER_LABEL: Record<string, string> = {
    a: "Picked A",
    b: "Picked B",
    tie: "Tie",
    both_inadequate: "Both inadequate",
  };

  const recent = [
    ...recentPairwise.map((r) => ({
      prompt: promptText.get(r.promptId) ?? r.promptId,
      type: "Comparison",
      status: WINNER_LABEL[r.winner] ?? "Logged",
      createdAt: r.createdAt,
    })),
    ...recentCold.map((r) => ({
      prompt: r.prompt?.text ?? "(prompt removed)",
      type: "Gold answer",
      status: "Saved",
      createdAt: r.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6)
    .map(({ createdAt, ...rest }) => ({
      ...rest,
      date: createdAt.toISOString(),
    }));

  return NextResponse.json({
    pending,
    completed,
    rubricScores,
    coldAnswers,
    promptsInCatalogue,
    pendingReviews,
    recent,
  });
}
