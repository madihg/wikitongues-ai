import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    prompt: { findMany: vi.fn() },
    speakerProfile: { findUnique: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";
import { GET as NEXT } from "../next/route";

const original = process.env.SPEECH_LAB_ENABLED;

/** Synthetic English stand-ins: one waiting answer per prompt row. */
const answerRow = (n: number) => ({
  id: `ans-${n}`,
  promptId: `p-${n}`,
  answerText: "an english stand-in answer",
  englishGloss: null,
  dialect: null,
  createdAt: new Date(Date.UTC(2026, 9, n)),
  prompt: {
    id: `p-${n}`,
    promptId: `code_00${n}`,
    text: "Say hello.",
    bucket: "orthography",
  },
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
  mockPrisma.speakerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.prompt.findMany.mockResolvedValue([]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/waiting", () => {
  it("404 with the flag off, 403 for a non-researcher, before any query", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await GET()).status).toBe(403);
    expect(mockPrisma.coldAuthorAnswer.findMany).not.toHaveBeenCalled();
  });

  it("is zero when nothing waits", async () => {
    expect(await (await GET()).json()).toEqual({ speech: 0 });
  });

  it("counts the caller's own waiting answers", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answerRow(1),
      answerRow(2),
      answerRow(3),
    ]);
    expect(await (await GET()).json()).toEqual({ speech: 3 });
    expect(
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where.annotatorId,
    ).toBe("r1");
  });

  it("equals the number of prompts the Record queue then serves, one by one", async () => {
    const rows = [answerRow(1), answerRow(2), answerRow(3)];
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(rows);
    const { speech } = (await (await GET()).json()) as { speech: number };

    // Walk the queue the way the screen does: skip each prompt it serves.
    const served: string[] = [];
    for (let i = 0; i < 10; i++) {
      mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(
        rows.filter((r) => !served.includes(r.prompt.promptId)),
      );
      const res = await NEXT(
        new Request(
          `http://test/api/lab/speech/next?exclude=${served.join(",")}`,
        ),
      );
      const body = (await res.json()) as {
        complete: boolean;
        task?: { source: string; prompt: { promptId: string } };
      };
      if (body.complete || body.task?.source !== "own_answer") break;
      served.push(body.task.prompt.promptId);
    }
    expect(served).toHaveLength(speech);
  });
});
