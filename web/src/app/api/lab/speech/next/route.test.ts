import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    prompt: { findFirst: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;

const get = (qs = "") =>
  GET(new Request(`http://test/api/lab/speech/next${qs}`));

const answerRow = (over: Record<string, unknown> = {}) => ({
  id: "ans-1",
  promptId: "p-1",
  answerText: "an english stand-in answer",
  englishGloss: "what it means in english",
  dialect: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  prompt: {
    id: "p-1",
    promptId: "code_001",
    text: "Say hello.",
    bucket: "orthography",
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
  mockPrisma.prompt.findFirst.mockResolvedValue(null);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/next", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await get()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await get()).status).toBe(403);
    expect(mockPrisma.coldAuthorAnswer.findMany).not.toHaveBeenCalled();
  });

  it("serves a prompt the researcher has an own answer for first, carrying that answer", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([answerRow()]);
    const body = await (await get()).json();
    expect(body.complete).toBe(false);
    expect(body.task.source).toBe("own_answer");
    expect(body.task.ownAnswer).toEqual({
      id: "ans-1",
      text: "an english stand-in answer",
      englishGloss: "what it means in english",
      dialect: null,
    });
    expect(body.task.prompt.promptId).toBe("code_001");
    // The no-answer step is not even consulted when an answer exists.
    expect(mockPrisma.prompt.findFirst).not.toHaveBeenCalled();
  });

  it("takes the oldest own answer, and the latest answer when a prompt has several", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answerRow({
        id: "old-a",
        promptId: "p-a",
        createdAt: new Date("2026-09-01"),
        prompt: {
          id: "p-a",
          promptId: "code_a",
          text: "A",
          bucket: "orthography",
        },
      }),
      answerRow({
        id: "new-b",
        promptId: "p-b",
        createdAt: new Date("2026-10-05"),
        prompt: {
          id: "p-b",
          promptId: "code_b",
          text: "B",
          bucket: "orthography",
        },
      }),
      answerRow({
        id: "newer-a",
        promptId: "p-a",
        createdAt: new Date("2026-10-06"),
        prompt: {
          id: "p-a",
          promptId: "code_a",
          text: "A",
          bucket: "orthography",
        },
      }),
    ]);
    const body = await (await get()).json();
    // p-b's only answer (Oct 5) is now older than p-a's latest (Oct 6).
    expect(body.task.ownAnswer.id).toBe("new-b");
  });

  it("falls to a prompt with no own answer when none has one, ownAnswer null", async () => {
    mockPrisma.prompt.findFirst.mockResolvedValue({
      id: "p-9",
      promptId: "code_009",
      text: "Say goodbye.",
      bucket: "orthography",
    });
    const body = await (await get()).json();
    expect(body.task.source).toBe("no_answer");
    expect(body.task.ownAnswer).toBeNull();
    expect(body.task.prompt.promptId).toBe("code_009");
  });

  it("is complete when nothing is left", async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({ complete: true, progress: { recorded: 0 } });
  });

  it("never offers a frozen prompt: both queue queries filter isHoldout and split test", async () => {
    mockPrisma.prompt.findFirst.mockResolvedValue(null);
    await get();
    const answersWhere =
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where;
    const promptWhere = mockPrisma.prompt.findFirst.mock.calls[0][0].where;
    expect(answersWhere.prompt).toMatchObject({
      isHoldout: false,
      split: { not: "test" },
    });
    expect(promptWhere).toMatchObject({
      isHoldout: false,
      split: { not: "test" },
    });
  });

  it("leaves out prompts already recorded for real in Igala (an English clip alone does not finish a prompt)", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-1" },
      { promptId: "p-1" },
      { promptId: "p-2" },
    ]);
    const body = await (await get()).json();
    expect(body.progress.recorded).toBe(2);
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      annotatorId: "r1",
      isDemo: false,
      language: "igala",
    });
    expect(
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where.prompt.id,
    ).toEqual({
      notIn: ["p-1", "p-2"],
    });
    expect(mockPrisma.prompt.findFirst.mock.calls[0][0].where.id).toEqual({
      notIn: ["p-1", "p-2"],
    });
  });

  it("passes ?exclude through to both steps", async () => {
    await get("?exclude=code_x,code_y");
    expect(
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where.prompt
        .promptId,
    ).toEqual({
      notIn: ["code_x", "code_y"],
    });
    expect(mockPrisma.prompt.findFirst.mock.calls[0][0].where.promptId).toEqual(
      {
        notIn: ["code_x", "code_y"],
      },
    );
  });

  it("demo mode ignores recording history", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([answerRow()]);
    const body = await (await get("?demo=sess-1")).json();
    expect(body.demo).toBe(true);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
    expect(body.task.source).toBe("own_answer");
  });
});
