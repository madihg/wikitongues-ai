import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const originalLayer = process.env.SPEECH_LAYER_ANNOTATORS;
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPEECH_LAYER_ANNOTATORS;
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
  if (originalLayer === undefined) delete process.env.SPEECH_LAYER_ANNOTATORS;
  else process.env.SPEECH_LAYER_ANNOTATORS = originalLayer;
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
    expect(await (await GET()).json()).toEqual({ speech: true, layer: false });
  });

  it("speech is false for a researcher with the flag off", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "RESEARCHER" },
    });
    expect(await (await GET()).json()).toEqual({ speech: false, layer: false });
  });

  it("speech is false for an annotator with the lab on and the layer unset", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "u2", role: "ANNOTATOR" },
    });
    expect(await (await GET()).json()).toEqual({ speech: false, layer: false });
  });

  it("speech is true for an annotator only with the lab and the layer both on", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "u2", role: "ANNOTATOR" },
    });
    expect(await (await GET()).json()).toEqual({ speech: true, layer: true });
    // The layer flag alone, without the lab, is nothing.
    delete process.env.SPEECH_LAB_ENABLED;
    expect(await (await GET()).json()).toEqual({ speech: false, layer: false });
  });

  it("a learner never gets speech, whatever the flags", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "u3", role: "LEARNER" },
    });
    expect((await (await GET()).json()).speech).toBe(false);
  });
});
