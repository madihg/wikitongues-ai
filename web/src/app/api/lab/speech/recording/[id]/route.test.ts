import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: { speechRecording: { findFirst: vi.fn(), update: vi.fn() } },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { PATCH } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const SHA = "a".repeat(64);

const patch = (body: unknown, id = "rec-1") =>
  PATCH(
    new Request(`http://test/api/lab/speech/recording/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findFirst.mockResolvedValue({
    id: "rec-1",
    uploadedAt: null,
  });
  mockPrisma.speechRecording.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rec-1",
      uploadedAt: data.uploadedAt,
      sizeBytes: data.sizeBytes,
    }),
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("PATCH /api/lab/speech/recording/[id]", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await patch({ sizeBytes: 100, checksumSha256: SHA })).status).toBe(
      404,
    );
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await patch({ sizeBytes: 100, checksumSha256: SHA })).status).toBe(
      403,
    );
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });

  it("confirms the upload with size and checksum", async () => {
    const res = await patch({
      sizeBytes: 123456,
      checksumSha256: SHA.toUpperCase(),
    });
    expect(res.status).toBe(200);
    expect(
      mockPrisma.speechRecording.update.mock.calls[0][0].data,
    ).toMatchObject({
      sizeBytes: 123456,
      checksumSha256: SHA, // stored lower-case
    });
    expect(
      mockPrisma.speechRecording.update.mock.calls[0][0].data.uploadedAt,
    ).toBeInstanceOf(Date);
  });

  it("only the clip's own researcher can confirm it", async () => {
    mockPrisma.speechRecording.findFirst.mockResolvedValue(null);
    expect((await patch({ sizeBytes: 100, checksumSha256: SHA })).status).toBe(
      404,
    );
    expect(mockPrisma.speechRecording.findFirst.mock.calls[0][0].where).toEqual(
      {
        id: "rec-1",
        annotatorId: "r1",
      },
    );
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });

  it("400 for a missing, non-integer, zero or over-5-MB size", async () => {
    for (const sizeBytes of [
      undefined,
      "100",
      1.5,
      0,
      -1,
      5 * 1024 * 1024 + 1,
    ]) {
      expect(
        (await patch({ sizeBytes, checksumSha256: SHA })).status,
        String(sizeBytes),
      ).toBe(400);
    }
    expect(
      (await patch({ sizeBytes: 5 * 1024 * 1024, checksumSha256: SHA })).status,
    ).toBe(200);
  });

  it("400 for a checksum that is not a 64-character hex string", async () => {
    for (const checksumSha256 of [
      undefined,
      "",
      "abc",
      "z".repeat(64),
      "a".repeat(63),
    ]) {
      expect(
        (await patch({ sizeBytes: 100, checksumSha256 })).status,
        String(checksumSha256),
      ).toBe(400);
    }
    expect((await patch("not json")).status).toBe(400);
  });

  it("409 when the upload was already confirmed", async () => {
    mockPrisma.speechRecording.findFirst.mockResolvedValue({
      id: "rec-1",
      uploadedAt: new Date(),
    });
    expect((await patch({ sizeBytes: 100, checksumSha256: SHA })).status).toBe(
      409,
    );
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });
});
