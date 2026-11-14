import type { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

/**
 * The gate and the budget for the learner tutor's routes (/api/chat and
 * /api/chat/conversations).
 *
 * These routes had no session check at all. A POST to /api/chat runs a paid
 * model, so anyone on the internet could spend the project's credit without
 * an account, held back only by a per-address counter kept in memory. Now:
 *
 *   - a signed-in session is required, checked on the server before anything
 *     is read, written or sent to a model;
 *   - each account has its own budget, counted in the database so it holds
 *     across server instances: messages per minute and per day;
 *   - a message has a maximum length;
 *   - a conversation belongs to the account that started it.
 *
 * The output of every model call is capped separately (agents/limits.ts).
 */

export const CHAT_LIMITS = {
  /** Messages one account may send in any 60 seconds. */
  perMinute: 10,
  /** Messages one account may send in any 24 hours. */
  perDay: 200,
  /** Longest message accepted, in characters. */
  maxMessageChars: 2000,
} as const;

export interface ChatUser {
  id: string;
  role: string;
}

export type ChatGate =
  { user: ChatUser; error: null } | { user: null; error: NextResponse };

/** Signed in, or a bare 401. Any role may use the tutor; nobody may use it signed out. */
export async function requireChatUser(): Promise<ChatGate> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user: { id: user.id, role: user.role }, error: null };
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type Budget =
  { ok: true } | { ok: false; error: string; retryAfterSeconds: number };

/** Pure: the timestamps of an account's recent messages in, the verdict out. */
export function budgetFor(sentAt: Date[], now: Date): Budget {
  const t = now.getTime();
  const inDay = sentAt.filter((d) => t - d.getTime() < DAY);
  const inMinute = inDay.filter((d) => t - d.getTime() < MINUTE);
  if (inMinute.length >= CHAT_LIMITS.perMinute) {
    const oldest = Math.min(...inMinute.map((d) => d.getTime()));
    return {
      ok: false,
      error: `Rate limit exceeded. Max ${CHAT_LIMITS.perMinute} messages per minute.`,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + MINUTE - t) / 1000)),
    };
  }
  if (inDay.length >= CHAT_LIMITS.perDay) {
    const oldest = Math.min(...inDay.map((d) => d.getTime()));
    return {
      ok: false,
      error: `Daily limit reached. Max ${CHAT_LIMITS.perDay} messages per day.`,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY - t) / 1000)),
    };
  }
  return { ok: true };
}

/**
 * The account's budget, from the messages it has already sent. The
 * orchestrator stores a learner's message before it calls a model, so a
 * message that reached a model is always counted here, on every instance.
 */
export async function chatBudget(
  db: Pick<PrismaClient, "message">,
  userId: string,
  now: Date = new Date(),
): Promise<Budget> {
  const recent = await db.message.findMany({
    where: {
      role: "user",
      conversation: { learnerId: userId },
      createdAt: { gte: new Date(now.getTime() - DAY) },
    },
    orderBy: { createdAt: "desc" },
    take: CHAT_LIMITS.perDay,
    select: { createdAt: true },
  });
  return budgetFor(
    recent.map((m) => m.createdAt),
    now,
  );
}

/** A conversation is visible to the account that started it, and to a researcher. */
export function canReadConversation(
  conversation: { learnerId: string | null },
  user: ChatUser,
): boolean {
  return conversation.learnerId === user.id || user.role === "RESEARCHER";
}
