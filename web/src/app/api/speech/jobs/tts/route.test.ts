import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher, mockLaunch } = vi.hoisted(() => ({
  mockPrisma: {
    speechTrainJob: { findMany: vi.fn() },
    speechCandidate: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
  mockLaunch: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
vi.mock("@/lib/speech/tts-deps", () => ({ ttsDeps: () => ({}) }));
vi.mock("@/lib/speech/tts-job", async (orig) => ({
  ...(await orig<typeof import("@/lib/speech/tts-job")>()),
  launchTtsJob: mockLaunch,
}));

import { GET, POST } from "./route";
import { TtsJobError } from "@/lib/speech/tts-job";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/speech/jobs/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockLaunch.mockResolvedValue({ jobId: "job-1", clips: 3, hours: 0.01, manifestVersion: "v" });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/speech/jobs/tts", () => {
  it("404 with the flag off, 403 for a non-researcher; nothing launches", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post({ studioSessionIds: ["studio-2026-11-06-ab"] })).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post({ studioSessionIds: ["studio-2026-11-06-ab"] })).status).toBe(403);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("400 for a missing, empty, oversized or malformed id list and for unknown hyperparameters", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ studioSessionIds: [] })).status).toBe(400);
    expect((await post({ studioSessionIds: ["bad id"] })).status).toBe(400);
    expect((await post({ studioSessionIds: Array(21).fill("studio-2026-11-06-ab") })).status).toBe(400);
    expect(
      (await post({ studioSessionIds: ["studio-2026-11-06-ab"], hyperparameters: { epochs: 3 } })).status,
    ).toBe(400);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("202 with the job id, de-duplicating the sessions", async () => {
    const res = await post({
      studioSessionIds: ["studio-2026-11-06-ab", "studio-2026-11-06-ab"],
      hyperparameters: { numSteps: 2000 },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ jobId: "job-1", clips: 3 });
    expect(mockLaunch.mock.calls[0][1]).toEqual({
      studioSessionIds: ["studio-2026-11-06-ab"],
      hyperparameters: { numSteps: 2000 },
      userId: "r1",
    });
  });

  it("passes a job error through with its status", async () => {
    mockLaunch.mockRejectedValue(new TtsJobError("No kept studio clips in those sessions.", 422));
    const res = await post({ studioSessionIds: ["studio-2026-11-06-ab"] });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/speech/jobs/tts", () => {
  it("lists tts jobs and candidates only", async () => {
    mockPrisma.speechTrainJob.findMany.mockResolvedValue([]);
    mockPrisma.speechCandidate.findMany.mockResolvedValue([]);
    expect((await GET()).status).toBe(200);
    expect(mockPrisma.speechTrainJob.findMany.mock.calls[0][0].where).toEqual({ system: "tts" });
    expect(mockPrisma.speechCandidate.findMany.mock.calls[0][0].where).toEqual({ system: "tts" });
  });
});
