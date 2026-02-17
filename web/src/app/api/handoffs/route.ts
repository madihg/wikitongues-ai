import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, HandoffStatus } from "@prisma/client";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as HandoffStatus | null;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 20;

  const where: Prisma.HandoffItemWhereInput = {};

  if (status) {
    where.status = status;
  }

  const [items, total, pendingCount] = await Promise.all([
    prisma.handoffItem.findMany({
      where,
      include: {
        reviewer: { select: { name: true, email: true } },
      },
      orderBy: { confidenceScore: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.handoffItem.count({ where }),
    prisma.handoffItem.count({ where: { status: "pending" } }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    pendingCount,
  });
}
