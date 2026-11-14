import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    speechComparison: { findMany: vi.fn(), count: vi.fn() },
    speechCandidate: { findFirst: vi.fn() },
    speechMinimalPair: { findUnique: vi.fn() },
    speechListenRound: { findMany: vi.fn(), count: vi.fn() },
    prompt: { findUnique: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const get = (qs = "") =>
  GET(new Request(`http://test/api/lab/speech/listen/next${qs}`));

const round = (over: Record<string, unknown> = {}) => ({
  id: "round-1",
  promptId: "p-1",
  language: "igala",
  humanRecordingId: "human-1",
  candidateRecordingId: "synth-1",
  candidateIsA: true,
  ...over,
});
const playable = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  uploadedAt: new Date(),
  reviewStatus: null,
  ...over,
});

/** The first findMany is the round's clip check; the second is the open queue. */
function clipsThenQueue(clips: unknown[], queue: unknown[] = []) {
  mockPrisma.speechRecording.findMany
    .mockResolvedValueOnce(clips)
    .mockResolvedValue(queue);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "rater-1", role: "RESEARCHER" });
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.speechComparison.findMany.mockResolvedValue([]);
  mockPrisma.speechComparison.count.mockResolvedValue(0);
  mockPrisma.speechCandidate.findFirst.mockResolvedValue(null);
  mockPrisma.speechMinimalPair.findUnique.mockResolvedValue(null);
  mockPrisma.speechListenRound.findMany.mockResolvedValue([]);
  mockPrisma.speechListenRound.count.mockResolvedValue(0);
  mockPrisma.prompt.findUnique.mockResolvedValue({
    id: "p-1",
    promptId: "code_001",
    text: "Say hello.",
    isHoldout: false,
    split: "train",
  });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/listen/next with assigned rounds", () => {
  it("serves the rater's open round first, on the side the round fixed", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValueOnce([round()]);
    mockPrisma.speechListenRound.count.mockResolvedValue(3);
    clipsThenQueue([playable("human-1"), playable("synth-1")]);
    const body = await (await get()).json();
    expect(body.complete).toBe(false);
    expect(body.task.clipA.id).toBe("synth-1");
    expect(body.task.clipB.id).toBe("human-1");
    expect(body.progress).toEqual({ completed: 3, remaining: 1 });
    // Only this rater's open rounds were asked for.
    expect(mockPrisma.speechListenRound.findMany.mock.calls[0][0].where).toEqual({
      raterId: "rater-1",
      comparisonId: null,
    });
  });

  it("puts the synthetic clip on B when the round says so", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValueOnce([round({ candidateIsA: false })]);
    clipsThenQueue([playable("human-1"), playable("synth-1")]);
    const body = await (await get()).json();
    expect(body.task.clipA.id).toBe("human-1");
    expect(body.task.clipB.id).toBe("synth-1");
  });

  it("names no model, system, tier or speaker in the response", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValueOnce([
      { ...round(), systemRef: "secret-model-ref", batch: "b1" },
    ]);
    clipsThenQueue([playable("human-1"), playable("synth-1")]);
    const text = JSON.stringify(await (await get()).json());
    expect(text).not.toContain("secret-model-ref");
    for (const word of ["systemRef", "sourceRef", "derived", "tier", "annotatorId", "candidate"]) {
      expect(text).not.toContain(word);
    }
    const body = JSON.parse(text);
    expect(Object.keys(body.task.clipA).sort()).toEqual(["id", "url"]);
    expect(Object.keys(body.task).sort()).toEqual(["clipA", "clipB", "language", "prompt"]);
  });

  it("passes over a round whose clip was withdrawn or rejected since", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValueOnce([
      round(),
      round({ id: "round-2", humanRecordingId: "human-2", candidateRecordingId: "synth-2" }),
    ]);
    clipsThenQueue([
      playable("human-1", { reviewStatus: "withdrawn" }),
      playable("synth-1"),
      playable("human-2"),
      playable("synth-2"),
    ]);
    const body = await (await get()).json();
    expect(body.task.clipA.id).toBe("synth-2");
    expect(body.progress.remaining).toBe(1);
  });

  it("never serves a round on a frozen prompt", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValueOnce([round()]);
    clipsThenQueue([playable("human-1"), playable("synth-1")]);
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p-1",
      promptId: "code_001",
      text: "x",
      isHoldout: true,
      split: "test",
    });
    expect((await (await get()).json()).complete).toBe(true);
  });

  it("keeps every round's synthetic clip out of the open queue, for everyone", async () => {
    // No open round for this rater; two clips belong to somebody's rounds.
    mockPrisma.speechListenRound.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { candidateRecordingId: "synth-1" },
        { candidateRecordingId: "synth-2" },
      ]);
    await get();
    const where = mockPrisma.speechRecording.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ notIn: ["synth-1", "synth-2"] });
  });

  it("demo mode never sees a round", async () => {
    mockPrisma.speechListenRound.findMany.mockResolvedValue([round()]);
    const body = await (await get("?demo=session-1")).json();
    expect(body.complete).toBe(true);
    expect(mockPrisma.prompt.findUnique).not.toHaveBeenCalled();
  });

  it("behaves as before when the rounds table is not there yet", async () => {
    mockPrisma.speechListenRound.findMany.mockRejectedValue(
      Object.assign(new Error("table does not exist"), { code: "P2021" }),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).complete).toBe(true);
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});
