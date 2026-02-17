import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orchestrate } from "@/lib/agents/orchestrator";

// ─── Rate limiting (FR-16) ──────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function getRateLimitKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return ip;
}

// ─── POST /api/chat ─────────────────────────────────────────

export async function POST(req: Request) {
  const rateLimitKey = getRateLimitKey(req);
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 10 messages per minute." },
      { status: 429 },
    );
  }

  let body: { conversationId?: string; message?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, language } = body;
  let { conversationId } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!language || typeof language !== "string") {
    return NextResponse.json(
      { error: "language is required" },
      { status: 400 },
    );
  }

  let isNewConversation = false;

  // Create conversation if not provided
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: { language },
    });
    conversationId = conversation.id;
    isNewConversation = true;
  } else {
    // Verify conversation exists
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
  }

  try {
    const result = await orchestrate({
      conversationId,
      learnerMessage: message.trim(),
      language,
    });

    // Fetch the saved message for the response
    const savedMessage = await prisma.message.findFirst({
      where: {
        conversationId,
        pipelineRunId: result.pipelineRunId,
      },
      select: {
        id: true,
        content: true,
        source: true,
        confidenceScore: true,
      },
    });

    return NextResponse.json({
      conversationId,
      message: savedMessage
        ? {
            id: savedMessage.id,
            content: savedMessage.content,
            source: savedMessage.source,
            confidenceScore: savedMessage.confidenceScore,
          }
        : {
            id: null,
            content: result.responseText,
            source: result.source,
            confidenceScore: result.confidenceScore,
          },
      disposition: result.disposition,
      isNewConversation,
    });
  } catch (error) {
    console.error("Orchestration error:", error);
    return NextResponse.json(
      { error: "An error occurred processing your message" },
      { status: 500 },
    );
  }
}

// ─── GET /api/chat?conversationId=xxx ───────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId query parameter is required" },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      source: true,
      confidenceScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    conversationId,
    language: conversation.language,
    messages,
  });
}
