import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    consent: { upsert: vi.fn() },
    consentGrant: { create: vi.fn() },
    speechRecording: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/consent/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.consent.upsert.mockResolvedValue({ id: "c1" });
  mockPrisma.consentGrant.create.mockReturnValue("grant-op");
  mockPrisma.speechRecording.updateMany.mockReturnValue("mark-op");
  mockPrisma.$transaction.mockResolvedValue([{ id: "g1" }, { count: 2 }]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/consent/withdraw", () => {
  it("is a 404 with the flag off, before anything else", async () => {
    process.env.SPEECH_LAB_ENABLED = "0";
    const res = await post({ confirm: true });
    expect(res.status).toBe(404);
    expect(mockRequireResearcher).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not signed in or not allowed", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post({ confirm: true })).status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("needs confirm: true", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ confirm: "true" })).status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("withdraws the caller only, and reports how many clips left", async () => {
    const res = await post({ confirm: true, userId: "someone-else" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      withdrawn: true,
      grantId: "g1",
      clipsRemoved: 2,
    });
    expect(mockPrisma.consentGrant.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      consentId: "c1",
      withdrawn: true,
    });
    expect(mockPrisma.speechRecording.updateMany.mock.calls[0][0].where).toMatchObject(
      { annotatorId: "u1", publishedOpenAt: null },
    );
  });
});
