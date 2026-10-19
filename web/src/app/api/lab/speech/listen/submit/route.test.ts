import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    prompt: { findUnique: vi.fn() },
    speechRecording: { findMany: vi.fn() },
    speechComparison: { findFirst: vi.fn(), create: vi.fn() },
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
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const valid = {
  promptId: "code_001",
  recordingAId: "clip-a",
  recordingBId: "clip-b",
  winner: "a",
  reasonTags: ["wrong_tone"],
};

const clips = (over: Record<string, unknown> = {}) => [
  {
    id: "clip-a",
    promptId: "p-1",
    uploadedAt: new Date(),
    reviewStatus: null,
    ...over,
  },
  {
    id: "clip-b",
    promptId: "p-1",
    uploadedAt: new Date(),
    reviewStatus: "keep",
  },
];

const created = () => mockPrisma.speechComparison.create.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.prompt.findUnique.mockResolvedValue({
    id: "p-1",
    isHoldout: false,
    split: "train",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue(clips());
  mockPrisma.speechComparison.findFirst.mockResolvedValue(null);
  mockPrisma.speechComparison.create.mockResolvedValue({ id: "cmp-1" });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/speech/listen/submit", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post(valid)).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post(valid)).status).toBe(403);
    expect(created()).toBe(0);
  });

  it("records a counted judgment", async () => {
    const res = await post({ ...valid, note: "  slow  " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "cmp-1" });
    expect(mockPrisma.speechComparison.create.mock.calls[0][0].data).toEqual({
      promptId: "p-1",
      recordingAId: "clip-a",
      recordingBId: "clip-b",
      winner: "a",
      reasonTags: ["wrong_tone"],
      note: "slow",
      annotatorId: "r1",
      isDemo: false,
      demoSessionId: null,
    });
  });

  it.each(["a", "b", "tie", "both_unusable"])(
    "accepts winner %s",
    async (winner) => {
      expect((await post({ ...valid, winner })).status).toBe(201);
    },
  );

  it("400 for an unknown winner (both_inadequate is the text arena's word)", async () => {
    expect((await post({ ...valid, winner: "both_inadequate" })).status).toBe(
      400,
    );
    expect((await post({ ...valid, winner: undefined })).status).toBe(400);
  });

  it("400 without a reason: one is required; unknown keys are dropped, then counted", async () => {
    expect((await post({ ...valid, reasonTags: [] })).status).toBe(400);
    expect((await post({ ...valid, reasonTags: undefined })).status).toBe(400);
    expect(
      (await post({ ...valid, reasonTags: ["not_a_reason"] })).status,
    ).toBe(400);
    expect(
      (
        await post({
          ...valid,
          reasonTags: ["not_a_reason", "robotic", "robotic"],
        })
      ).status,
    ).toBe(201);
    expect(
      mockPrisma.speechComparison.create.mock.calls[0][0].data.reasonTags,
    ).toEqual(["robotic"]);
  });

  it("400 for the same clip on both sides, a missing id, an over-long note, a malformed body", async () => {
    expect((await post({ ...valid, recordingBId: "clip-a" })).status).toBe(400);
    expect((await post({ ...valid, recordingAId: "" })).status).toBe(400);
    expect((await post({ ...valid, note: "x".repeat(501) })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect(created()).toBe(0);
  });

  it("404 for an unknown prompt", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
  });

  it("403 with no detail for a frozen prompt", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p-1",
      isHoldout: true,
      split: "train",
    });
    const res = await post(valid);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p-1",
      isHoldout: false,
      split: "test",
    });
    expect((await post(valid)).status).toBe(403);
    expect(created()).toBe(0);
  });

  it("404 when a clip is missing, on another prompt, unconfirmed, or rejected in review", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clips()[1]]);
    expect((await post(valid)).status).toBe(404);
    mockPrisma.speechRecording.findMany.mockResolvedValue(
      clips({ promptId: "other" }),
    );
    expect((await post(valid)).status).toBe(404);
    mockPrisma.speechRecording.findMany.mockResolvedValue(
      clips({ uploadedAt: null }),
    );
    expect((await post(valid)).status).toBe(404);
    mockPrisma.speechRecording.findMany.mockResolvedValue(
      clips({ reviewStatus: "bad_audio" }),
    );
    expect((await post(valid)).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("409 on a second counted judgment for the same prompt, whatever the pair", async () => {
    mockPrisma.speechComparison.findFirst.mockResolvedValue({ id: "earlier" });
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(
      mockPrisma.speechComparison.findFirst.mock.calls[0][0].where,
    ).toEqual({
      annotatorId: "r1",
      isDemo: false,
      promptId: "p-1",
    });
    expect(created()).toBe(0);
  });

  it("demo: stores isDemo true, neither blocked by nor blocking the one-per-prompt rule", async () => {
    mockPrisma.speechComparison.findFirst.mockResolvedValue({ id: "earlier" });
    const res = await post({ ...valid, demoSessionId: "sess-1" });
    expect(res.status).toBe(201);
    expect(mockPrisma.speechComparison.findFirst).not.toHaveBeenCalled();
    expect(
      mockPrisma.speechComparison.create.mock.calls[0][0].data,
    ).toMatchObject({
      isDemo: true,
      demoSessionId: "sess-1",
    });
  });
});
