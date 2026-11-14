import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    prompt: { findUnique: vi.fn() },
    speechRecording: { findMany: vi.fn() },
    speechComparison: { findFirst: vi.fn(), create: vi.fn() },
    speechMinimalPair: { findUnique: vi.fn() },
    speechMinimalPairAnswer: { createMany: vi.fn() },
    speechListenRound: { findMany: vi.fn(), updateMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/listen/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** The synthetic clip is A: what the round below serves. */
const valid = {
  promptId: "code_001",
  recordingAId: "synth-1",
  recordingBId: "human-1",
  winner: "b",
  reasonTags: ["robotic"],
};
const round = (over: Record<string, unknown> = {}) => ({
  id: "round-1",
  raterId: "rater-1",
  comparisonId: null,
  promptId: "p-1",
  language: "igala",
  humanRecordingId: "human-1",
  candidateRecordingId: "synth-1",
  candidateIsA: true,
  ...over,
});
const created = () => mockPrisma.speechComparison.create.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "rater-1", role: "RESEARCHER" });
  mockPrisma.prompt.findUnique.mockResolvedValue({ id: "p-1", isHoldout: false, split: "train" });
  mockPrisma.speechRecording.findMany.mockResolvedValue(
    ["synth-1", "human-1"].map((id) => ({
      id,
      promptId: "p-1",
      language: "igala",
      uploadedAt: new Date(),
      reviewStatus: null,
    })),
  );
  mockPrisma.speechComparison.findFirst.mockResolvedValue(null);
  mockPrisma.speechComparison.create.mockResolvedValue({ id: "cmp-1" });
  mockPrisma.speechMinimalPair.findUnique.mockResolvedValue(null);
  mockPrisma.speechListenRound.findMany.mockResolvedValue([round()]);
  mockPrisma.speechListenRound.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/speech/listen/submit with assigned rounds", () => {
  it("stores the judgment and closes the rater's round", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(created()).toBe(1);
    expect(mockPrisma.speechListenRound.updateMany).toHaveBeenCalledWith({
      where: { id: "round-1", comparisonId: null },
      data: { comparisonId: "cmp-1", judgedAt: expect.any(Date) },
    });
  });

  it("a round is not blocked by an earlier judgment on the same prompt (a repeat, a second system)", async () => {
    mockPrisma.speechComparison.findFirst.mockResolvedValue({ id: "earlier" });
    expect((await post(valid)).status).toBe(201);
    expect(mockPrisma.speechComparison.findFirst).not.toHaveBeenCalled();
    expect(created()).toBe(1);
  });

  it("404 for a rater the round does not name", async () => {
    mockRequireResearcher.mockResolvedValue({ error: null, userId: "someone-else", role: "RESEARCHER" });
    expect((await post(valid)).status).toBe(404);
    expect(created()).toBe(0);
    expect(mockPrisma.speechListenRound.updateMany).not.toHaveBeenCalled();
  });

  it("404 when the sides are not the ones the round served", async () => {
    const swapped = { ...valid, recordingAId: "human-1", recordingBId: "synth-1" };
    expect((await post(swapped)).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("404 once the round is closed: one judgment per round", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValue([round({ comparisonId: "cmp-0" })]);
    expect((await post(valid)).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("a repeat round is its own round, with the sides swapped", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValue([
      round({ comparisonId: "cmp-0" }),
      round({ id: "round-2", candidateIsA: false }),
    ]);
    const swapped = { ...valid, recordingAId: "human-1", recordingBId: "synth-1" };
    expect((await post(swapped)).status).toBe(201);
    expect(mockPrisma.speechListenRound.updateMany.mock.calls[0][0].where.id).toBe("round-2");
  });

  it("404 in demo mode: a round's clip is never a demo clip", async () => {
    expect((await post({ ...valid, demoSessionId: "demo-1" })).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("an ordinary pair is untouched: the one-per-prompt rule still holds", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValue([]);
    mockPrisma.speechComparison.findFirst.mockResolvedValue({ id: "earlier" });
    expect((await post(valid)).status).toBe(409);
    mockPrisma.speechComparison.findFirst.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(201);
    expect(mockPrisma.speechListenRound.updateMany).not.toHaveBeenCalled();
  });

  it("behaves as before when the rounds table is not there yet", async () => {
    mockPrisma.speechListenRound.findMany.mockRejectedValue(
      Object.assign(new Error("table does not exist"), { code: "P2021" }),
    );
    expect((await post(valid)).status).toBe(201);
    expect(mockPrisma.speechListenRound.updateMany).not.toHaveBeenCalled();
  });
});
