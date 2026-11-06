import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireResearcher, mockLaunch } = vi.hoisted(() => ({
  mockRequireResearcher: vi.fn(),
  mockLaunch: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
vi.mock("@/lib/speech/tts-deps", () => ({ ttsDeps: () => ({}) }));
vi.mock("@/lib/speech/tts-job", async (orig) => ({
  ...(await orig<typeof import("@/lib/speech/tts-job")>()),
  launchSynthesis: mockLaunch,
}));

import { POST } from "./route";
import { TtsJobError } from "@/lib/speech/tts-job";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/speech/jobs/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockLaunch.mockResolvedValue({ jobId: "job-2", sentences: 2 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/speech/jobs/synthesize", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post({ candidateId: "c" })).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post({ candidateId: "c" })).status).toBe(403);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("400 without a candidate or with a malformed list", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ candidateId: "c", promptIds: "p1" })).status).toBe(400);
    expect((await post({ candidateId: "c", promptIds: [1] })).status).toBe(400);
  });

  it("202 with the job id; a frozen prompt is a bare 403 from the job", async () => {
    const ok = await post({ candidateId: "c", promptIds: ["p1", "p2"] });
    expect(ok.status).toBe(202);
    expect(mockLaunch.mock.calls[0][1]).toEqual({ candidateId: "c", promptIds: ["p1", "p2"], userId: "r1" });
    mockLaunch.mockRejectedValue(new TtsJobError("Forbidden", 403));
    const bad = await post({ candidateId: "c", promptIds: ["frozen"] });
    expect(bad.status).toBe(403);
    expect(await bad.json()).toEqual({ error: "Forbidden" });
  });
});
