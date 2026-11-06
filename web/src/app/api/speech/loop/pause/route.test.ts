import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechLoopState: { upsert: vi.fn() },
    speechAudit: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const saved = process.env.SPEECH_LAB_ENABLED;
const call = (body: unknown) =>
  POST(new Request("http://test/api/speech/loop/pause", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
});
afterEach(() => {
  if (saved === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = saved;
});

describe("POST /api/speech/loop/pause", () => {
  it("404 flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await call({ paused: true })).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await call({ paused: true })).status).toBe(403);
    expect(mockPrisma.speechLoopState.upsert).not.toHaveBeenCalled();
  });

  it("400 unless paused is a boolean", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call({ paused: "yes" })).status).toBe(400);
  });

  it("pausing writes the singleton with who and when, and audits it", async () => {
    const res = await call({ paused: true });
    expect(res.status).toBe(200);
    const arg = mockPrisma.speechLoopState.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.update).toMatchObject({ paused: true, pausedById: "r1" });
    expect(arg.update.pausedAt).toBeInstanceOf(Date);
    expect(mockPrisma.speechAudit.create.mock.calls[0][0].data.action).toBe("pause");
  });

  it("resuming clears who and when", async () => {
    await call({ paused: false });
    expect(mockPrisma.speechLoopState.upsert.mock.calls[0][0].update).toEqual({
      paused: false,
      pausedById: null,
      pausedAt: null,
    });
    expect(mockPrisma.speechAudit.create.mock.calls[0][0].data.action).toBe("resume");
  });
});
