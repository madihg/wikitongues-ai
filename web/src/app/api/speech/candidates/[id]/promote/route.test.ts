import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechCandidate: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    speechAudit: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const saved = process.env.SPEECH_LAB_ENABLED;
const call = (body?: unknown) =>
  POST(
    new Request("http://test/api/speech/candidates/c1/promote", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "c1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockPrisma.speechCandidate.findUnique.mockResolvedValue({
    id: "c1",
    system: "asr",
    regressed: false,
    promotedAt: null,
  });
});
afterEach(() => {
  if (saved === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = saved;
});

describe("POST /api/speech/candidates/[id]/promote", () => {
  it("404 flag off, 401 signed out, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await call()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
      role: null,
    });
    expect((await call()).status).toBe(401);
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await call()).status).toBe(403);
    expect(mockPrisma.speechCandidate.update).not.toHaveBeenCalled();
  });

  it("404 for an unknown candidate", async () => {
    mockPrisma.speechCandidate.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("promotes a normal candidate without a reason, clears the previous promotion, and audits", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockPrisma.speechCandidate.updateMany).toHaveBeenCalledWith({
      where: { system: "asr", promotedAt: { not: null }, id: { not: "c1" } },
      data: { promotedAt: null, promotedById: null, promoteReason: null },
    });
    const upd = mockPrisma.speechCandidate.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "c1" });
    expect(upd.data.promotedById).toBe("r1");
    expect(upd.data.promotedAt).toBeInstanceOf(Date);
    expect(mockPrisma.speechAudit.create.mock.calls[0][0].data).toMatchObject({
      action: "promote",
      subjectId: "c1",
      actorId: "r1",
    });
  });

  it("refuses a regressed candidate with no reason, or a blank one", async () => {
    mockPrisma.speechCandidate.findUnique.mockResolvedValue({
      id: "c1", system: "asr", regressed: true, promotedAt: null,
    });
    expect((await call()).status).toBe(400);
    expect((await call({ reason: "   " })).status).toBe(400);
    expect((await call({ reason: 42 })).status).toBe(400);
    expect(mockPrisma.speechCandidate.update).not.toHaveBeenCalled();
  });

  it("promotes a regressed candidate with a typed reason and stores it", async () => {
    mockPrisma.speechCandidate.findUnique.mockResolvedValue({
      id: "c1", system: "asr", regressed: true, promotedAt: null,
    });
    const res = await call({ reason: "  better on the dialect we lack  " });
    expect(res.status).toBe(200);
    expect(mockPrisma.speechCandidate.update.mock.calls[0][0].data.promoteReason).toBe(
      "better on the dialect we lack",
    );
    expect(mockPrisma.speechAudit.create.mock.calls[0][0].data.detail).toMatchObject({
      regressed: true,
      reason: "better on the dialect we lack",
    });
  });

  it("is idempotent for an already promoted candidate", async () => {
    mockPrisma.speechCandidate.findUnique.mockResolvedValue({
      id: "c1", system: "asr", regressed: true, promotedAt: new Date(),
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyPromoted).toBe(true);
    expect(mockPrisma.speechCandidate.update).not.toHaveBeenCalled();
  });
});
