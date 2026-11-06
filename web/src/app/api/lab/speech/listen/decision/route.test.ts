import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechComparison: { findMany: vi.fn() },
    speechMinimalPairAnswer: { findMany: vi.fn() },
    speechRecording: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const human = { sourceType: "contributor", sourceRef: null, modelOutputId: null };
const voice = { sourceType: "derived", sourceRef: "tts/job-1", modelOutputId: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockPrisma.speechComparison.findMany.mockResolvedValue(
    Array.from({ length: 12 }, (_, i) => ({
      winner: i < 9 ? "a" : "b",
      annotatorId: `l${i % 3}`,
      isDemo: false,
      recordingA: voice,
      recordingB: human,
    })),
  );
  mockPrisma.speechMinimalPairAnswer.findMany.mockResolvedValue([
    { recordingId: "rv", heard: "target", isDemo: false },
    { recordingId: "rv", heard: "foil", isDemo: false },
    { recordingId: "rh", heard: "target", isDemo: false },
  ]);
  mockPrisma.speechRecording.findMany.mockResolvedValue([
    { id: "rv", ...voice },
    { id: "rh", ...human },
  ]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/listen/decision", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await GET()).status).toBe(403);
    expect(mockPrisma.speechComparison.findMany).not.toHaveBeenCalled();
  });

  it("reads counted judgments only, with explicit selects", async () => {
    await GET();
    const cmp = mockPrisma.speechComparison.findMany.mock.calls[0][0];
    expect(cmp.where).toEqual({ isDemo: false });
    expect(cmp.select.recordingA).toEqual({ select: { sourceType: true, sourceRef: true, modelOutputId: true } });
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].select).toBeDefined();
  });

  it("returns a not-enough card with the thresholds and tone accuracy per system", async () => {
    const j = await (await GET()).json();
    expect(j.thresholds).toEqual({ minJudgments: 300, minListeners: 5, strongJudgments: 600 });
    expect(j.cards).toHaveLength(1);
    expect(j.cards[0]).toMatchObject({
      pair: ["human", "tts/job-1"],
      judgments: 12,
      listeners: 3,
      status: "not_enough",
      strengths: null,
    });
    expect(j.cards[0].message).toMatch(/^Not enough judgments/);
    expect(j.toneAccuracy["tts/job-1"]).toEqual({ answered: 2, correct: 1, unsure: 0, accuracy: 0.5 });
    expect(j.toneAccuracy.human).toEqual({ answered: 1, correct: 1, unsure: 0, accuracy: 1 });
  });
});
