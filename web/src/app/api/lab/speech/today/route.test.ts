import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: { speechRecording: { findMany: vi.fn() } },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const get = (qs = "") => GET(new Request(`http://test/api/lab/speech/today${qs}`));

const q = (retakes?: number) => ({
  durationMs: 3000,
  speechShare: 0.7,
  rmsDbfs: -20,
  peakDbfs: -3,
  ...(retakes === undefined ? {} : { retakes }),
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
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/today", () => {
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
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });

  it("counts only the caller's own confirmed non-demo clips, never selecting audio", async () => {
    await get(`?since=${new Date(Date.now() - 3600_000).toISOString()}`);
    const arg = mockPrisma.speechRecording.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      annotatorId: "r1",
      isDemo: false,
      uploadedAt: { not: null },
    });
    expect(arg.select).toEqual({ tier: true, quality: true });
  });

  it("tallies kept, re-recorded and tiers into the session line", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { tier: "community_only", quality: q(1) },
      { tier: "community_only", quality: q(0) },
      { tier: "community_only", quality: null },
      { tier: "licensed", quality: q(1) },
      { tier: "licensed", quality: q() },
      { tier: "licensed", quality: q() },
    ]);
    const body = await (await get()).json();
    expect(body.counts).toEqual({
      kept: 6,
      retakes: 2,
      communityOnly: 3,
      licensed: 3,
      open: 0,
    });
    expect(body.line).toBe(
      "Today: 6 clips kept, 2 re-recorded, 3 community-only, 3 licensed",
    );
  });

  it("clamps `since` to the last 36 hours and ignores junk or a future time", async () => {
    await get("?since=2001-01-01T00:00:00Z");
    await get("?since=nonsense");
    await get(`?since=${new Date(Date.now() + 9e8).toISOString()}`);
    for (const c of mockPrisma.speechRecording.findMany.mock.calls) {
      const gte = c[0].where.createdAt.gte as Date;
      const age = Date.now() - gte.getTime();
      expect(age).toBeLessThanOrEqual(36 * 3600_000 + 1000);
      expect(age).toBeGreaterThan(0);
    }
  });
});
