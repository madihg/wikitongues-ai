import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    pending,
    inReview,
    approved,
    corrected,
    rejected,
    gapBreakdown,
    avgTimeResult,
  ] = await Promise.all([
    prisma.handoffItem.count({ where: { status: "pending" } }),
    prisma.handoffItem.count({ where: { status: "in_review" } }),
    prisma.handoffItem.count({ where: { status: "approved" } }),
    prisma.handoffItem.count({ where: { status: "corrected" } }),
    prisma.handoffItem.count({ where: { status: "rejected" } }),
    prisma.handoffItem.groupBy({
      by: ["gapCategory"],
      _count: { id: true },
    }),
    prisma.$queryRaw<{ avg_hours: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600) as avg_hours
        FROM "HandoffItem"
        WHERE "reviewedAt" IS NOT NULL
      `,
  ]);

  const resolved = approved + corrected + rejected;
  const totalResolved = resolved;

  const gaps: Record<string, number> = {};
  for (const row of gapBreakdown) {
    const key = row.gapCategory ?? "uncategorized";
    gaps[key] = row._count.id;
  }

  return NextResponse.json({
    pending,
    inReview,
    resolved: totalResolved,
    approved,
    corrected,
    rejected,
    gapBreakdown: gaps,
    averageTimeInQueueHours: avgTimeResult[0]?.avg_hours ?? null,
  });
}
