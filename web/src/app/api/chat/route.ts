import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orchestrate } from "@/lib/agents/orchestrator";
import {
  CHAT_LIMITS,
  canReadConversation,
  chatBudget,
  requireChatUser,
} from "@/lib/chat-guard";

// ─── POST /api/chat ─────────────────────────────────────────
//
// Signed-in accounts only. The session is checked first: a signed-out caller
// gets a bare 401 and nothing is read, written or sent to a model. Then the
// account's own budget (per minute and per day, counted in the database), the
// message length, and the owner of the conversation.

export async function POST(req: Request) {
  const gate = await requireChatUser();
  if (gate.error) return gate.error;
  const user = gate.user;

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

  if (message.length > CHAT_LIMITS.maxMessageChars) {
    return NextResponse.json(
      {
        error: `A message can be at most ${CHAT_LIMITS.maxMessageChars} characters.`,
      },
      { status: 400 },
    );
  }

  const budget = await chatBudget(prisma, user.id);
  if (!budget.ok) {
    return NextResponse.json(
      { error: budget.error },
      {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      },
    );
  }

  let isNewConversation = false;

  // Create conversation if not provided
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: { language, learnerId: user.id },
    });
    conversationId = conversation.id;
    isNewConversation = true;
  } else {
    // The conversation must exist and belong to this account. Someone
    // else's conversation answers exactly like one that does not exist.
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { learnerId: true },
    });
    if (!existing || existing.learnerId !== user.id) {
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
  const gate = await requireChatUser();
  if (gate.error) return gate.error;

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

  if (!conversation || !canReadConversation(conversation, gate.user)) {
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
