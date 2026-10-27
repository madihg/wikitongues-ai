import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, PUT } from "./route";
import { MAX_BYTES } from "@/lib/speech/limits";

const original = process.env.SPEECH_LAB_ENABLED;
const ctx = (id = "rec-1") => ({ params: Promise.resolve({ id }) });

const bytes = (n: number) => new Uint8Array(n).fill(7);

const put = (
  body: Uint8Array | null,
  headers: Record<string, string> = { "Content-Type": "audio/webm" },
) =>
  PUT(
    new Request("http://test/api/lab/speech/recording/rec-1/audio", {
      method: "PUT",
      headers,
      body: body as BodyInit | null,
    }),
    ctx(),
  );

const get = (range?: string, id = "rec-1") =>
  GET(
    new Request("http://test/api/lab/speech/recording/rec-1/audio", {
      headers: range ? { Range: range } : {},
    }),
    ctx(id),
  );

const MINE = {
  id: "rec-1",
  mimeType: "audio/webm;codecs=opus",
  uploadedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findFirst.mockResolvedValue(MINE);
  mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

const denied = () =>
  mockRequireResearcher.mockResolvedValue({
    error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    userId: null,
    role: null,
  });

describe("PUT /api/lab/speech/recording/[id]/audio", () => {
  it("404 with the flag off, 403 for a non-researcher, nothing written", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await put(bytes(10))).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    denied();
    expect((await put(bytes(10))).status).toBe(403);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("stores the bytes, computes size and sha256 server side, sets uploadedAt", async () => {
    const body = bytes(2048);
    const res = await put(body);
    expect(res.status).toBe(200);
    const call = mockPrisma.speechRecording.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: "rec-1",
      annotatorId: "r1",
      uploadedAt: null,
    });
    expect(Buffer.from(call.data.bytes).equals(Buffer.from(body))).toBe(true);
    expect(call.data.sizeBytes).toBe(2048);
    expect(call.data.checksumSha256).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
    expect(call.data.uploadedAt).toBeInstanceOf(Date);
    const json = await res.json();
    expect(json.recording.sizeBytes).toBe(2048);
    expect(JSON.stringify(json)).not.toContain("bytes");
  });

  it("ignores any size or checksum header a client sends", async () => {
    await put(bytes(100), {
      "Content-Type": "audio/webm",
      "X-Checksum": "0".repeat(64),
      "X-Size": "5",
    });
    const data = mockPrisma.speechRecording.updateMany.mock.calls[0][0].data;
    expect(data.sizeBytes).toBe(100);
    expect(data.checksumSha256).not.toBe("0".repeat(64));
  });

  it("accepts exactly 4 MB and refuses one byte more with 413", async () => {
    expect((await put(bytes(MAX_BYTES))).status).toBe(200);
    expect(MAX_BYTES).toBe(4 * 1024 * 1024);
    mockPrisma.speechRecording.updateMany.mockClear();
    const res = await put(bytes(MAX_BYTES + 1));
    expect(res.status).toBe(413);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("refuses on the declared length before reading the body", async () => {
    const res = await PUT(
      new Request("http://test/x", {
        method: "PUT",
        headers: {
          "Content-Type": "audio/webm",
          "Content-Length": String(MAX_BYTES + 1),
        },
        body: bytes(10) as BodyInit,
      }),
      ctx(),
    );
    expect(res.status).toBe(413);
    expect(mockPrisma.speechRecording.findFirst).not.toHaveBeenCalled();
  });

  it("400 for an empty body or a non-audio Content-Type", async () => {
    expect((await put(bytes(0))).status).toBe(400);
    expect(
      (await put(bytes(10), { "Content-Type": "application/json" })).status,
    ).toBe(400);
    expect((await put(bytes(10), {})).status).toBe(400);
  });

  it("415 when the Content-Type does not match the mime type the row declared", async () => {
    const res = await put(bytes(10), { "Content-Type": "audio/mp4" });
    expect(res.status).toBe(415);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("matches the declared mime ignoring codec parameters and case", async () => {
    expect(
      (await put(bytes(10), { "Content-Type": "Audio/WebM; codecs=opus" }))
        .status,
    ).toBe(200);
  });

  it("404 for a row that is not yours, scoped in the query", async () => {
    mockPrisma.speechRecording.findFirst.mockResolvedValue(null);
    expect((await put(bytes(10))).status).toBe(404);
    expect(mockPrisma.speechRecording.findFirst.mock.calls[0][0].where).toEqual(
      { id: "rec-1", annotatorId: "r1" },
    );
  });

  it("409 when the clip already has its audio, or a concurrent upload won", async () => {
    mockPrisma.speechRecording.findFirst.mockResolvedValue({
      ...MINE,
      uploadedAt: new Date(),
    });
    expect((await put(bytes(10))).status).toBe(409);
    mockPrisma.speechRecording.findFirst.mockResolvedValue(MINE);
    mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 0 });
    expect((await put(bytes(10))).status).toBe(409);
  });
});

describe("GET /api/lab/speech/recording/[id]/audio", () => {
  const stored = {
    bytes: Buffer.from("0123456789"),
    mimeType: "audio/webm;codecs=opus",
    uploadedAt: new Date(),
    isDemo: false,
    annotatorId: "someone-else",
  };
  beforeEach(() => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(stored);
  });

  it("404 with the flag off, 403 for a non-researcher, no read", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await get()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    denied();
    expect((await get()).status).toBe(403);
    expect(mockPrisma.speechRecording.findUnique).not.toHaveBeenCalled();
  });

  it("serves the bytes with the right Content-Type and no CDN-cacheable headers", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
    expect(res.headers.get("Content-Length")).toBe("10");
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("private");
    expect(cc).toContain("no-store");
    expect(cc).not.toMatch(/public|s-maxage/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("0123456789");
  });

  it("honours a byte range (Safari needs it) with 206 and Content-Range", async () => {
    const res = await get("bytes=2-5");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("2345");
    expect((await get("bytes=8-")).status).toBe(206);
    expect((await get("bytes=50-60")).status).toBe(416);
  });

  it("404 for an unknown id, a row with no audio, or someone else's demo clip", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    mockPrisma.speechRecording.findUnique.mockResolvedValue({
      ...stored,
      bytes: null,
      uploadedAt: null,
    });
    expect((await get()).status).toBe(404);
    mockPrisma.speechRecording.findUnique.mockResolvedValue({
      ...stored,
      isDemo: true,
    });
    expect((await get()).status).toBe(404);
  });

  it("serves a demo clip to the researcher who made it", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue({
      ...stored,
      isDemo: true,
      annotatorId: "r1",
    });
    expect((await get()).status).toBe(200);
  });
});
