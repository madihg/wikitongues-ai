import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET /api/chat/conversations?language=xxx ───────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 20;

  const where = language ? { language } : {};

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  const items = conversations.map((c) => ({
    id: c.id,
    language: c.language,
    messageCount: c._count.messages,
    lastMessage: c.messages[0] ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return NextResponse.json({
    conversations: items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
