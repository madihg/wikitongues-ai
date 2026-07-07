import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  // Count only REAL work: demo-session rows carry isDemo=true and must never
  // inflate an annotator's totals. _count relations can't filter isDemo, so we
  // count explicitly. Handoff reviews have no demo concept.
  const activityData = await Promise.all(
    users.map(async (user) => {
      const [
        pairwiseCount,
        rubricCount,
        handoffCount,
        latestPairwise,
        latestRubric,
        latestHandoff,
      ] = await Promise.all([
        prisma.pairwiseComparison.count({
          where: { annotatorId: user.id, isDemo: false },
        }),
        prisma.rubricAxisScore.count({
          where: { annotatorId: user.id, isDemo: false },
        }),
        prisma.handoffItem.count({ where: { reviewerId: user.id } }),
        prisma.pairwiseComparison.findFirst({
          where: { annotatorId: user.id, isDemo: false },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.rubricAxisScore.findFirst({
          where: { annotatorId: user.id, isDemo: false },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.handoffItem.findFirst({
          where: { reviewerId: user.id },
          orderBy: { reviewedAt: "desc" },
          select: { reviewedAt: true },
        }),
      ]);

      const timestamps = [
        latestPairwise?.createdAt,
        latestRubric?.createdAt,
        latestHandoff?.reviewedAt,
      ].filter((t): t is Date => t !== null && t !== undefined);

      const lastActive =
        timestamps.length > 0
          ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
          : null;

      return {
        name: user.name ?? user.email,
        pairwiseCount,
        rubricCount,
        handoffCount,
        lastActive: lastActive?.toISOString() ?? null,
      };
    }),
  );

  // Filter out users with no activity
  const active = activityData.filter(
    (u) => u.pairwiseCount > 0 || u.rubricCount > 0 || u.handoffCount > 0,
  );

  // Sort by total activity descending
  active.sort(
    (a, b) =>
      b.pairwiseCount +
      b.rubricCount +
      b.handoffCount -
      (a.pairwiseCount + a.rubricCount + a.handoffCount),
  );

  return NextResponse.json({ annotators: active });
}
