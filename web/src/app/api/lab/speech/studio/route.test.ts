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
const get = (qs = "session=studio-2026-11-06-ab") =>
  GET(new Request(`http://test/api/lab/speech/studio?${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockPrisma.speechRecording.findMany.mockResolvedValue([
    { studioSessionId: "studio-2026-11-06-ab", durationMs: 60_000, reviewStatus: "keep" },
    { studioSessionId: "studio-2026-11-06-ab", durationMs: 30_000, reviewStatus: null },
    { studioSessionId: "studio-other-0001", durationMs: 120_000, reviewStatus: "keep" },
  ]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/studio", () => {
  it("404 with the flag off, then 403 for a non-researcher", async () => {
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

  it("400 for a bad session id or hours", async () => {
    expect((await get("session=bad id")).status).toBe(400);
    expect((await get("session=studio-2026-11-06-ab&hours=0")).status).toBe(400);
    expect((await get("session=studio-2026-11-06-ab&hours=abc")).status).toBe(400);
  });

  it("reads only this researcher's counted studio clips, with an explicit select and no bytes", async () => {
    await get();
    const arg = mockPrisma.speechRecording.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      annotatorId: "r1",
      studioSessionId: { not: null },
      uploadedAt: { not: null },
      isDemo: false,
    });
    expect(arg.select).toEqual({ studioSessionId: true, durationMs: true, reviewStatus: true });
  });

  it("returns minutes for the session, the total, and the target (default 5 hours)", async () => {
    const j = await (await get()).json();
    expect(j.session).toMatchObject({ clips: 2, keptClips: 1, keptMinutes: 1 });
    expect(j.total.keptMinutes).toBe(3);
    expect(j.targetMinutes).toBe(300);
    expect(j.percentOfTarget).toBeCloseTo(1, 10);
    expect(j.recording).toEqual({ sampleRate: 48000, tier: "community_only" });
  });
});
