import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    thirdPartyAudioSource: { findUnique: vi.fn(), update: vi.fn() },
    speechRecording: { updateMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { PATCH } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const patch = (body: unknown) =>
  PATCH(
    new Request("http://test/api/speech/rights/s1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "s1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.thirdPartyAudioSource.findUnique.mockResolvedValue({ id: "s1" });
  mockPrisma.thirdPartyAudioSource.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "s1", ...data }),
  );
  mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 5 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("PATCH /api/speech/rights/[id]", () => {
  it("is a 404 with the flag off and a 403 for a non-researcher", async () => {
    process.env.SPEECH_LAB_ENABLED = "0";
    expect((await patch({ rightsStatus: "cleared" })).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await patch({ rightsStatus: "cleared" })).status).toBe(403);
    expect(mockPrisma.thirdPartyAudioSource.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown status, an empty body and oversized notes", async () => {
    expect((await patch({ rightsStatus: "maybe" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ notes: "x".repeat(4001) })).status).toBe(400);
    expect(mockPrisma.thirdPartyAudioSource.update).not.toHaveBeenCalled();
  });

  it("is a 404 for a source that is not in the register", async () => {
    mockPrisma.thirdPartyAudioSource.findUnique.mockResolvedValue(null);
    expect((await patch({ rightsStatus: "cleared" })).status).toBe(404);
  });

  it("cleared records who confirmed and when, and copies the status onto the source's clips", async () => {
    const res = await patch({ rightsStatus: "cleared" });
    expect(res.status).toBe(200);
    const data = mockPrisma.thirdPartyAudioSource.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ rightsStatus: "cleared", confirmedById: "r1" });
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(mockPrisma.speechRecording.updateMany).toHaveBeenCalledWith({
      where: { sourceType: "third_party", sourceRef: "s1" },
      data: { rightsStatus: "cleared" },
    });
    expect((await res.json()).clips).toBe(5);
  });

  it("restricted also copies down, so a later restriction stops training", async () => {
    await patch({ rightsStatus: "restricted" });
    expect(mockPrisma.speechRecording.updateMany.mock.calls[0][0].data).toEqual({
      rightsStatus: "restricted",
    });
  });

  it("pending clears the confirmation", async () => {
    await patch({ rightsStatus: "pending" });
    expect(mockPrisma.thirdPartyAudioSource.update.mock.calls[0][0].data).toMatchObject(
      { rightsStatus: "pending", confirmedById: null, confirmedAt: null },
    );
  });

  it("notes alone change neither the status nor any clip", async () => {
    await patch({ notes: "Asked GRN on the 5th." });
    const data = mockPrisma.thirdPartyAudioSource.update.mock.calls[0][0].data;
    expect(data).toEqual({ notes: "Asked GRN on the 5th." });
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });
});
