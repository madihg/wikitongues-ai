import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/flags", () => {
  it("401 when signed out", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("speech is true for a researcher with the flag on", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "RESEARCHER" },
    });
    expect(await (await GET()).json()).toEqual({ speech: true });
  });

  it("speech is false for a researcher with the flag off", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "RESEARCHER" },
    });
    expect(await (await GET()).json()).toEqual({ speech: false });
  });

  it("speech is false for an annotator even with the flag on", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "u2", role: "ANNOTATOR" },
    });
    expect(await (await GET()).json()).toEqual({ speech: false });
  });
});
