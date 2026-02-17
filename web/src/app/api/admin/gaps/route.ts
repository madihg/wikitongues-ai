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
      where: { gapCategory: { not: null } },
    }),
    prisma.handoffItem.groupBy({
      by: ["status"],
      where: { gapCategory: { not: null } },
      _count: { id: true },
    }),
    prisma.handoffItem.groupBy({
      by: ["gapCategory"],
      where: { gapCategory: { not: null } },
      _count: { id: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) {
    statusCounts[row.status] = row._count.id;
  }

  const categoryCounts: Record<string, number> = {};
  for (const row of byCategory) {
    if (row.gapCategory) {
      categoryCounts[row.gapCategory] = row._count.id;
    }
  }

  const resolved =
    (statusCounts["approved"] ?? 0) + (statusCounts["corrected"] ?? 0);
  const remaining = totalGaps - resolved;

  // Epoch-based trend data
  const epochStats = await prisma.handoffItem.groupBy({
    by: ["status"],
    where: {
      gapCategory: { not: null },
      reviewedAt: { not: null },
    },
    _count: { id: true },
  });

  const epochTrend = epochStats.map((row) => ({
    status: row.status,
    count: row._count.id,
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
