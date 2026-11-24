import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * A long take goes up in parts (since 2026-11-24 a take can run five
 * minutes: 5 to 9 MB, over the 4 MB one request body may carry). The rules
 * tested here: a part lands only on exactly what it follows, every answer
 * says what the server holds, the last part stores the clip exactly as a
 * single PUT does, and a long clip is read back in ranges of at most 4 MB.
 */

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
const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    storageEnabled: vi.fn(),
    putClip: vi.fn(),
    signedUrl: vi.fn(),
  },
}));
vi.mock("@/lib/speech/storage-supabase", () => mockStorage);
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, PUT, parsePart } from "./route";
import { MAX_BYTES, MAX_CLIP_BYTES } from "@/lib/speech/limits";

const original = process.env.SPEECH_LAB_ENABLED;
const ctx = (id = "rec-1") => ({ params: Promise.resolve({ id }) });
const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

const putPart = (body: Uint8Array, offset: number, total: number) =>
  PUT(
    new Request(
      `http://test/api/lab/speech/recording/rec-1/audio?offset=${offset}&total=${total}`,
      {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: body as BodyInit,
      },
    ),
    ctx(),
  );

const ROW = {
  id: "rec-1",
  mimeType: "audio/webm;codecs=opus",
  uploadedAt: null,
  sizeBytes: null as number | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findFirst.mockResolvedValue(ROW);
  mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 1 });
  mockStorage.storageEnabled.mockReturnValue(false);
  mockStorage.putClip.mockResolvedValue(undefined);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("parsePart", () => {
  const q = (s: string) => parsePart(new URLSearchParams(s));
  it("no query is a single PUT", () => {
    expect(q("")).toBeNull();
  });
  it("reads whole numbers with offset below total", () => {
    expect(q("offset=0&total=10")).toEqual({ offset: 0, total: 10 });
    expect(q("offset=9&total=10")).toEqual({ offset: 9, total: 10 });
  });
  it("refuses half a pair, non-numbers, negatives, and an offset at or past the total", () => {
    for (const bad of [
      "offset=0",
      "total=10",
      "offset=a&total=10",
      "offset=-1&total=10",
      "offset=1.5&total=10",
      "offset=10&total=10",
      "offset=0&total=0",
      "offset=0&total=9999999999",
    ]) {
      expect(q(bad), bad).toBe("bad");
    }
  });
});

describe("PUT in parts", () => {
  it("400 for a malformed part query, 413 for a total over 20 MB, nothing read", async () => {
    const bad = await PUT(
      new Request("http://test/x?offset=5", {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: bytes(5) as BodyInit,
      }),
      ctx(),
    );
    expect(bad.status).toBe(400);
    expect((await putPart(bytes(5), 0, MAX_CLIP_BYTES + 1)).status).toBe(413);
    expect(mockPrisma.speechRecording.findFirst).not.toHaveBeenCalled();
  });

  it("a part over 4 MB is still refused with 413", async () => {
    expect((await putPart(bytes(MAX_BYTES + 1), 0, MAX_CLIP_BYTES)).status).toBe(413);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("400 when a part runs past the total", async () => {
    expect((await putPart(bytes(20), 0, 10)).status).toBe(400);
  });

  it("the first part starts the clip, says what it holds, and leaves it unconfirmed", async () => {
    const res = await putPart(bytes(6), 0, 10);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 6, complete: false });
    const call = mockPrisma.speechRecording.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rec-1", annotatorId: "r1", uploadedAt: null });
    expect(call.data.sizeBytes).toBe(6);
    expect(call.data.uploadedAt).toBeUndefined();
    expect(call.data.checksumSha256).toBeNull();
  });

  it("a later part lands only on exactly what it follows", async () => {
    mockPrisma.speechRecording.findFirst
      .mockResolvedValueOnce({ ...ROW, sizeBytes: 6 })
      .mockResolvedValueOnce({ bytes: Buffer.from(bytes(6, 1)) });
    const res = await putPart(bytes(2, 2), 6, 10);
    expect(await res.json()).toEqual({ received: 8, complete: false });
    const call = mockPrisma.speechRecording.updateMany.mock.calls[0][0];
    // The optimistic lock: the row must still hold exactly the 6 bytes read.
    expect(call.where).toEqual({
      id: "rec-1",
      annotatorId: "r1",
      uploadedAt: null,
      sizeBytes: 6,
    });
    expect([...Buffer.from(call.data.bytes)]).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
  });

  it("a part out of step stores nothing and says where things stand", async () => {
    // A repeat of a part already stored: the server holds 8, not 6.
    mockPrisma.speechRecording.findFirst.mockResolvedValueOnce({ ...ROW, sizeBytes: 8 });
    const res = await putPart(bytes(2), 6, 10);
    expect(await res.json()).toEqual({ received: 8, complete: false });
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("the last part stores the whole clip as a single PUT does: size, sha256, uploadedAt, bucket copy", async () => {
    mockStorage.storageEnabled.mockReturnValue(true);
    const first = bytes(6, 1);
    const last = bytes(4, 2);
    mockPrisma.speechRecording.findFirst
      .mockResolvedValueOnce({ ...ROW, sizeBytes: 6 })
      .mockResolvedValueOnce({ bytes: Buffer.from(first) });
    const res = await putPart(last, 6, 10);
    const json = await res.json();
    const whole = Buffer.concat([Buffer.from(first), Buffer.from(last)]);
    const sha = createHash("sha256").update(whole).digest("hex");
    expect(json).toEqual({
      recording: { id: "rec-1", sizeBytes: 10, checksumSha256: sha },
      received: 10,
      complete: true,
    });
    const call = mockPrisma.speechRecording.updateMany.mock.calls[0][0];
    expect(call.data.uploadedAt).toBeInstanceOf(Date);
    expect(call.data.checksumSha256).toBe(sha);
    expect(call.data.storageKey).toBe("clips/rec-1.webm");
    const [key, sent] = mockStorage.putClip.mock.calls[0];
    expect(key).toBe("clips/rec-1.webm");
    expect(Buffer.from(sent).equals(whole)).toBe(true);
  });

  it("losing a race to another request reports what the row holds now", async () => {
    mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.speechRecording.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce({ uploadedAt: null, sizeBytes: 3 });
    expect(await (await putPart(bytes(6), 0, 10)).json()).toEqual({
      received: 3,
      complete: false,
    });
    mockPrisma.speechRecording.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce({ uploadedAt: new Date(), sizeBytes: 10 });
    expect((await putPart(bytes(6), 0, 10)).status).toBe(409);
  });

  it("409 once the clip has its audio: a finished clip is never replaced", async () => {
    mockPrisma.speechRecording.findFirst.mockResolvedValue({
      ...ROW,
      uploadedAt: new Date(),
      sizeBytes: 10,
    });
    expect((await putPart(bytes(6), 0, 10)).status).toBe(409);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET of a long clip", () => {
  const big = Buffer.alloc(MAX_BYTES + 1000, 3);
  beforeEach(() => {
    mockPrisma.speechRecording.findUnique
      .mockResolvedValueOnce({
        mimeType: "audio/webm;codecs=opus",
        uploadedAt: new Date(),
        isDemo: false,
        annotatorId: "someone-else",
        storageKey: null,
      })
      .mockResolvedValueOnce({ bytes: big });
  });
  const get = (range?: string) =>
    GET(
      new Request("http://test/api/lab/speech/recording/rec-1/audio", {
        headers: range ? { Range: range } : {},
      }),
      ctx(),
    );

  it("answers an open range with at most 4 MB, and the rest on the next ask", async () => {
    const res = await get("bytes=0-");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-${MAX_BYTES - 1}/${big.length}`,
    );
    expect((await res.arrayBuffer()).byteLength).toBe(MAX_BYTES);
  });

  it("answers a request without a Range with the first 4 MB as a 206", async () => {
    const res = await get();
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Length")).toBe(String(MAX_BYTES));
  });

  it("the tail of the clip comes back whole", async () => {
    const res = await get(`bytes=${MAX_BYTES}-`);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes ${MAX_BYTES}-${big.length - 1}/${big.length}`,
    );
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });
});
