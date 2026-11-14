import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { countRecordWaiting, loadRecordQueue } from "./record-queue";

/** Fixtures are synthetic English stand-ins. */
const answer = (id: string, promptRow: string, day: number) => ({
  id,
  promptId: promptRow,
  answerText: `stand-in answer ${id}`,
  englishGloss: null,
  dialect: null,
  createdAt: new Date(Date.UTC(2026, 9, day)),
  prompt: {
    id: promptRow,
    promptId: `code_${promptRow}`,
    text: "Say hello.",
    bucket: "orthography",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
});

describe("loadRecordQueue", () => {
  it("asks only for the speaker's own real answers on unfrozen Igala prompts", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-9" },
      { promptId: "p-9" },
    ]);
    const q = await loadRecordQueue("u1", { exclude: ["code_x"] });
    expect(q.recordedIds).toEqual(["p-9"]);
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      annotatorId: "u1",
      isDemo: false,
      language: "igala",
    });
    const where = mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where;
    expect(where.annotatorId).toBe("u1");
    expect(where.isDemo).toBe(false);
    expect(where.prompt).toEqual({
      isHoldout: false,
      split: { not: "test" },
      language: "igala",
      id: { notIn: ["p-9"] },
      promptId: { notIn: ["code_x"] },
    });
  });

  it("keeps one row per prompt (the latest answer), oldest first", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answer("a1", "p-1", 1),
      answer("a2", "p-2", 2),
      answer("a3", "p-1", 3),
    ]);
    const q = await loadRecordQueue("u1");
    expect(q.waiting.map((a) => a.id)).toEqual(["a2", "a3"]);
  });

  it("demo mode ignores recording history", async () => {
    await loadRecordQueue("u1", { isDemo: true });
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });
});

describe("countRecordWaiting", () => {
  it("is the length of the queue's first step, from the same loader", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answer("a1", "p-1", 1),
      answer("a2", "p-2", 2),
      answer("a3", "p-1", 3),
    ]);
    const n = await countRecordWaiting("u1");
    expect(n).toBe((await loadRecordQueue("u1")).waiting.length);
    expect(n).toBe(2);
  });

  it("is zero with nothing waiting", async () => {
    expect(await countRecordWaiting("u1")).toBe(0);
  });
});
