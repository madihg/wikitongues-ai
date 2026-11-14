import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    prompt: { findUnique: vi.fn() },
    speechRecording: { findMany: vi.fn(), updateMany: vi.fn() },
    coldAuthorAnswer: { findFirst: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.prompt.findUnique.mockResolvedValue({ id: "p-1" });
  mockPrisma.speechRecording.findMany.mockResolvedValue([
    { id: "c1", isDemo: false },
    { id: "c2", isDemo: false },
  ]);
  mockPrisma.coldAuthorAnswer.findFirst.mockResolvedValue({ id: "ans-1" });
  mockPrisma.speechRecording.updateMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }),
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/speech/attach", () => {
  it("404 with the flag off, 403 for a non-researcher, nothing written", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post({ promptId: "x", recordingIds: ["c1"] })).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post({ promptId: "x", recordingIds: ["c1"] })).status).toBe(403);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("400 for a bad body or too many clips", async () => {
    expect((await post("nope")).status).toBe(400);
    expect((await post({ promptId: "x", recordingIds: [] })).status).toBe(400);
    expect((await post({ recordingIds: ["a"] })).status).toBe(400);
    expect(
      (await post({ promptId: "x", recordingIds: ["a", "b", "c", "d", "e"] }))
        .status,
    ).toBe(400);
  });

  it("404 for an unknown prompt", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue(null);
    expect((await post({ promptId: "x", recordingIds: ["c1"] })).status).toBe(404);
  });

  it("attaches the caller's latest answer to their own unattached clips only", async () => {
    const res = await post({ promptId: "code_001", recordingIds: ["c1", "c2"] });
    expect(await res.json()).toEqual({ attached: 2 });
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["c1", "c2"] },
      annotatorId: "r1",
      promptId: "p-1",
      coldAuthorAnswerId: null,
    });
    expect(mockPrisma.coldAuthorAnswer.findFirst.mock.calls[0][0]).toMatchObject({
      where: { annotatorId: "r1", promptId: "p-1", isDemo: false },
      orderBy: { createdAt: "desc" },
    });
    const upd = mockPrisma.speechRecording.updateMany.mock.calls[0][0];
    expect(upd.data).toEqual({ coldAuthorAnswerId: "ans-1" });
    expect(upd.where).toMatchObject({ annotatorId: "r1", coldAuthorAnswerId: null });
  });

  it("matches demo clips to the demo answer, not the real one", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { id: "d1", isDemo: true },
    ]);
    await post({ promptId: "code_001", recordingIds: ["d1"] });
    expect(
      mockPrisma.coldAuthorAnswer.findFirst.mock.calls[0][0].where.isDemo,
    ).toBe(true);
  });

  it("404 when the episode left no answer to attach to", async () => {
    mockPrisma.coldAuthorAnswer.findFirst.mockResolvedValue(null);
    const res = await post({ promptId: "code_001", recordingIds: ["c1"] });
    expect(res.status).toBe(404);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("attaches nothing (200, 0) when none of the ids are the caller's unattached clips", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([]);
    const res = await post({ promptId: "code_001", recordingIds: ["theirs"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attached: 0 });
  });
});
