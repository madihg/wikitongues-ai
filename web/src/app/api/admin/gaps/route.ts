import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalGaps, byStatus, byCategory] = await Promise.all([
    prisma.handoffItem.count({
      where: { gapBucket: { not: null } },
    }),
    prisma.handoffItem.groupBy({
      by: ["status"],
      where: { gapBucket: { not: null } },
      _count: { _all: true },
    }),
    prisma.handoffItem.groupBy({
      by: ["gapBucket"],
      where: { gapBucket: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) {
    statusCounts[row.status] = row._count._all;
  }

  const categoryCounts: Record<string, number> = {};
  for (const row of byCategory) {
    if (row.gapBucket) {
      categoryCounts[row.gapBucket] = row._count._all;
    }
  }

  const resolved =
    (statusCounts["approved"] ?? 0) + (statusCounts["corrected"] ?? 0);
  const remaining = totalGaps - resolved;

  // Epoch-based trend data
  const epochStats = await prisma.handoffItem.groupBy({
    by: ["status"],
    where: {
      gapBucket: { not: null },
      reviewedAt: { not: null },
    },
    _count: { _all: true },
  });

  const epochTrend = epochStats.map((row) => ({
    status: row.status,
    count: row._count._all,
  }));

  return NextResponse.json({
    totalGaps,
    resolved,
    remaining,
    statusCounts,
    categoryCounts,
    epochTrend,
  });
}
