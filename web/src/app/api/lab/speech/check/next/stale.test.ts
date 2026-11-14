import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechCheck: { findMany: vi.fn(), groupBy: vi.fn() },
    speechRecording: { findMany: vi.fn() },
    answerRevision: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

/**
 * A clip whose written answer was edited after it was recorded is left out
 * of Check until it is recorded again (annotator experience spec, 6.4). The
 * clip itself is never touched. Invented placeholder texts.
 */

const original = process.env.SPEECH_LAB_ENABLED;
const get = () => GET(new Request("http://test/api/lab/speech/check/next"));
const clip = (id: string, answerId: string, recordedAt: string) => ({
  id,
  promptId: `p-${id}`,
  dialect: null,
  coldAuthorAnswerId: answerId,
  language: "igala",
  createdAt: new Date(recordedAt),
  prompt: { promptId: `code_${id}`, text: "Say it." },
  coldAuthorAnswer: { answerText: "alpha beta" },
});
const revision = (answerId: string, field: string, at: string) => ({
  targetId: answerId,
  field,
  before: "alpha",
  after: "alpha beta",
  createdAt: new Date(at),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "me",
    role: "RESEARCHER",
  });
  mockPrisma.speechCheck.findMany.mockResolvedValue([]);
  mockPrisma.speechCheck.groupBy.mockResolvedValue([]);
  mockPrisma.speechRecording.findMany.mockResolvedValue([
    clip("old", "ans1", "2026-11-10T09:00:00Z"),
    clip("fresh", "ans2", "2026-11-10T09:00:00Z"),
  ]);
  mockPrisma.answerRevision.findMany.mockResolvedValue([]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("Check leaves out a clip whose words changed since", () => {
  it("with no edits, both clips are waiting", async () => {
    const body = await (await get()).json();
    expect(body.progress.remaining).toBe(2);
  });

  it("an answer edited after its clip takes that clip out, and only that one", async () => {
    mockPrisma.answerRevision.findMany.mockResolvedValue([
      revision("ans1", "answerText", "2026-11-12T09:00:00Z"),
    ]);
    const body = await (await get()).json();
    expect(body.progress.remaining).toBe(1);
    expect(body.task.recording.id).toBe("fresh");
  });

  it("an edit before the clip was recorded changes nothing: the clip read the new words", async () => {
    mockPrisma.answerRevision.findMany.mockResolvedValue([
      revision("ans1", "answerText", "2026-11-09T09:00:00Z"),
    ]);
    expect((await (await get()).json()).progress.remaining).toBe(2);
  });

  it("an edit of the English meaning does not take out an Igala clip", async () => {
    mockPrisma.answerRevision.findMany.mockResolvedValue([
      revision("ans1", "englishGloss", "2026-11-12T09:00:00Z"),
    ]);
    expect((await (await get()).json()).progress.remaining).toBe(2);
  });

  it("if the edit log cannot be read, the queue still works and hides nothing", async () => {
    mockPrisma.answerRevision.findMany.mockRejectedValue(
      Object.assign(new Error("no table"), { code: "P2021" }),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).progress.remaining).toBe(2);
  });
});
