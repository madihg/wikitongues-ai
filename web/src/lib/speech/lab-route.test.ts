import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireResearcher } = vi.hoisted(() => ({
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { labGate } from "./lab-route";

const original = process.env.SPEECH_LAB_ENABLED;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("labGate", () => {
  it("404s with the flag off, without even checking who is asking", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    const g = await labGate();
    expect(g.error?.status).toBe(404);
    expect(mockRequireResearcher).not.toHaveBeenCalled();
  });

  it("passes the researcher's id through when the flag is on", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: null,
      userId: "r1",
      role: "RESEARCHER",
    });
    const g = await labGate();
    expect(g.error).toBeNull();
    expect(g.userId).toBe("r1");
  });

  it("returns the 403 requireResearcher gives a non-researcher", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    const { NextResponse } = await import("next/server");
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await labGate()).error?.status).toBe(403);
  });
});
