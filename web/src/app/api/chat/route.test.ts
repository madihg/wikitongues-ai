import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/chat and /api/chat/conversations: the learner tutor's routes.
 *
 * They had no session check. A signed-out POST ran a paid model. These tests
 * pin the fix: signed out gets a bare 401, and neither the database nor the
 * model pipeline is touched; a signed-in account is held to its own budget
 * and to its own conversations.
 */

const { mockSession, mockOrchestrate, db } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockSession: vi.fn(),
    mockOrchestrate: vi.fn(),
    db: {
      conversation: {
        create: fn(),
        findUnique: fn(),
        findMany: fn(),
        count: fn(),
      },
      message: { findMany: fn(), findFirst: fn() },
    },
  };
});
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// The one door to every model call the tutor makes (translator and reviewer).
vi.mock("@/lib/agents/orchestrator", () => ({ orchestrate: mockOrchestrate }));

import { GET, POST } from "./route";
import { GET as LIST } from "./conversations/route";
import { CHAT_LIMITS } from "@/lib/chat-guard";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const get = (query = "") => GET(new Request(`http://test/api/chat${query}`));
const list = (query = "") =>
  LIST(new Request(`http://test/api/chat/conversations${query}`));

const as = (user: { id: string; role: string } | null) =>
  mockSession.mockResolvedValue(user ? { user } : null);
const LEARNER = { id: "learner-1", role: "LEARNER" };

const dbCalls = () =>
  Object.values(db).flatMap((model) =>
    Object.values(model).flatMap((f) => f.mock.calls),
  );

beforeEach(() => {
  vi.clearAllMocks();
  db.message.findMany.mockResolvedValue([]);
  db.message.findFirst.mockResolvedValue(null);
  db.conversation.create.mockResolvedValue({ id: "conv-new" });
  db.conversation.findMany.mockResolvedValue([]);
  db.conversation.count.mockResolvedValue(0);
  mockOrchestrate.mockResolvedValue({
    pipelineRunId: "run-1",
    responseText: "answer",
    source: "model",
    confidenceScore: 0.8,
    disposition: "served",
  });
});

describe("signed out", () => {
  beforeEach(() => as(null));

  it("POST /api/chat: 401, no model call, nothing read or written", async () => {
    const res = await post({ message: "hello", language: "igala" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(dbCalls()).toEqual([]);
  });

  it("POST with someone's conversation id: still 401, still no model call", async () => {
    const res = await post({
      conversationId: "conv-1",
      message: "hello",
      language: "igala",
    });
    expect(res.status).toBe(401);
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(dbCalls()).toEqual([]);
  });

  it("GET /api/chat: 401, no message read", async () => {
    const res = await get("?conversationId=conv-1");
    expect(res.status).toBe(401);
    expect(dbCalls()).toEqual([]);
  });

  it("GET /api/chat/conversations: 401, no conversation listed", async () => {
    const res = await list();
    expect(res.status).toBe(401);
    expect(dbCalls()).toEqual([]);
  });
});

describe("signed in", () => {
  beforeEach(() => as(LEARNER));

  it("a first message starts a conversation that belongs to the account, and runs the tutor once", async () => {
    const res = await post({ message: "  hello  ", language: "igala" });
    expect(res.status).toBe(200);
    expect(db.conversation.create).toHaveBeenCalledWith({
      data: { language: "igala", learnerId: "learner-1" },
    });
    expect(mockOrchestrate).toHaveBeenCalledTimes(1);
    expect(mockOrchestrate).toHaveBeenCalledWith({
      conversationId: "conv-new",
      learnerMessage: "hello",
      language: "igala",
    });
  });

  it("any signed-in role may use the tutor", async () => {
    for (const role of ["LEARNER", "ANNOTATOR", "RESEARCHER"]) {
      as({ id: "u", role });
      expect((await post({ message: "hi", language: "igala" })).status).toBe(
        200,
      );
    }
  });

  it("another account's conversation answers as if it did not exist, and no model runs", async () => {
    db.conversation.findUnique.mockResolvedValue({ learnerId: "someone-else" });
    const res = await post({
      conversationId: "conv-1",
      message: "hello",
      language: "igala",
    });
    expect(res.status).toBe(404);
    expect(mockOrchestrate).not.toHaveBeenCalled();
  });

  it("continues the account's own conversation", async () => {
    db.conversation.findUnique.mockResolvedValue({ learnerId: "learner-1" });
    const res = await post({
      conversationId: "conv-1",
      message: "hello",
      language: "igala",
    });
    expect(res.status).toBe(200);
    expect(db.conversation.create).not.toHaveBeenCalled();
    expect(mockOrchestrate).toHaveBeenCalledTimes(1);
  });

  it("the eleventh message in a minute is refused with 429 and no model call", async () => {
    const now = Date.now();
    db.message.findMany.mockResolvedValue(
      Array.from({ length: CHAT_LIMITS.perMinute }, (_, i) => ({
        createdAt: new Date(now - (i + 1) * 1000),
      })),
    );
    const res = await post({ message: "hello", language: "igala" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("the budget is the account's own: it is asked for by user id", async () => {
    await post({ message: "hello", language: "igala" });
    expect(db.message.findMany.mock.calls[0][0].where).toMatchObject({
      role: "user",
      conversation: { learnerId: "learner-1" },
    });
  });

  it("past the daily cap: 429, no model call", async () => {
    const now = Date.now();
    db.message.findMany.mockResolvedValue(
      Array.from({ length: CHAT_LIMITS.perDay }, (_, i) => ({
        createdAt: new Date(now - 120_000 - i * 300_000),
      })),
    );
    const res = await post({ message: "hello", language: "igala" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/^Daily limit reached/);
    expect(mockOrchestrate).not.toHaveBeenCalled();
  });

  it("a message over the length limit is refused before anything else", async () => {
    const res = await post({
      message: "a".repeat(CHAT_LIMITS.maxMessageChars + 1),
      language: "igala",
    });
    expect(res.status).toBe(400);
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(dbCalls()).toEqual([]);
  });

  it("reads its own conversation, not another account's", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      language: "igala",
      learnerId: "learner-1",
    });
    expect((await get("?conversationId=conv-1")).status).toBe(200);
    db.conversation.findUnique.mockResolvedValue({
      id: "conv-2",
      language: "igala",
      learnerId: "someone-else",
    });
    const res = await get("?conversationId=conv-2");
    expect(res.status).toBe(404);
    // Messages were read once, for the conversation that is theirs.
    expect(db.message.findMany).toHaveBeenCalledTimes(1);
  });

  it("lists only its own conversations; a researcher lists all", async () => {
    await list("?language=igala");
    expect(db.conversation.findMany.mock.calls[0][0].where).toEqual({
      language: "igala",
      learnerId: "learner-1",
    });
    as({ id: "r1", role: "RESEARCHER" });
    await list();
    expect(db.conversation.findMany.mock.calls[1][0].where).toEqual({});
  });
});
