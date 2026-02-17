import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all users with annotator-relevant relations
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: {
          pairwiseComparisons: true,
          rubricScores: true,
          handoffReviews: true,
        },
      },
    },
  });

  // Get latest activity timestamps per user
  const activityData = await Promise.all(
    users.map(async (user) => {
      const [latestPairwise, latestRubric, latestHandoff] = await Promise.all([
        prisma.pairwiseComparison.findFirst({
          where: { annotatorId: user.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.rubricScore.findFirst({
          where: { annotatorId: user.id },
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
        pairwiseCount: user._count.pairwiseComparisons,
        rubricCount: user._count.rubricScores,
        handoffCount: user._count.handoffReviews,
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
