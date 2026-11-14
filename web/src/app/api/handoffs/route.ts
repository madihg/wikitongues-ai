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
  // Researchers only. The page that calls this is hidden from other roles in
  // the browser, but anyone can register an account, so the role is checked
  // here, on the server, before anything is read or written.
  if (session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
