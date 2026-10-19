import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher, mockSignedRead } = vi.hoisted(
  () => ({
    mockPrisma: {
      speechRecording: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    mockRequireResearcher: vi.fn(),
    mockSignedRead: vi.fn(),
  }),
);
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
vi.mock("@/lib/speech/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/speech/storage")>()),
  signedReadUrl: mockSignedRead,
}));

import { GET, PATCH } from "./route";
import { StorageConfigError } from "@/lib/speech/storage";

const original = process.env.SPEECH_LAB_ENABLED;

const get = (qs = "") =>
  GET(new Request(`http://test/api/lab/speech/recordings${qs}`));
const patch = (body: unknown) =>
  PATCH(
    new Request("http://test/api/lab/speech/recordings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const row = (over: Record<string, unknown> = {}) => ({
  id: "rec-1",
  storagePath: "clips/rec-1.webm",
  mimeType: "audio/webm",
  durationMs: 4200,
  annotatorId: "speaker-account-1",
  dialect: null,
  tier: "community_only",
  consentVersion: "2026-10-19-v1",
  reviewStatus: null,
  rightsStatus: "pending",
  createdAt: new Date("2026-10-18T00:00:00Z"),
  prompt: { promptId: "code_001", text: "Say hello." },
  coldAuthorAnswer: { answerText: "an english stand-in" },
  ...over,
});

const forbidden = () =>
  mockRequireResearcher.mockResolvedValue({
    error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    userId: null,
    role: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue([row()]);
  mockPrisma.speechRecording.findUnique.mockResolvedValue({ id: "rec-1" });
  mockPrisma.speechRecording.update.mockImplementation(
    async ({ data }: { data: { reviewStatus: string | null } }) => ({
      id: "rec-1",
      reviewStatus: data.reviewStatus,
    }),
  );
  mockSignedRead.mockImplementation(
    async (path: string) => `https://storage.example/sign/${path}?token=t`,
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/recordings", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await get()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    forbidden();
    expect((await get()).status).toBe(403);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });

  it("lists clips with a signed read URL, the pseudonym and never the account id", async () => {
    const res = await get();
    const text = await res.text();
    const body = JSON.parse(text);
    const r = body.recordings[0];
    expect(r.url).toBe("https://storage.example/sign/clips/rec-1.webm?token=t");
    expect(r.speaker).toMatch(/^spk_[0-9a-f]{12}$/);
    expect(r).toMatchObject({
      promptId: "code_001",
      promptText: "Say hello.",
      answerText: "an english stand-in",
      durationMs: 4200,
      tier: "community_only",
      consentVersion: "2026-10-19-v1",
      reviewStatus: null,
    });
    expect(text).not.toContain("speaker-account-1");
    expect(text).not.toContain("/object/public/");
    // A row's storage path is not exposed beyond its signed URL.
    expect(r.storagePath).toBeUndefined();
  });

  it("only lists confirmed, non-demo clips", async () => {
    await get();
    expect(
      mockPrisma.speechRecording.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      isDemo: false,
      uploadedAt: { not: null },
    });
  });

  it("filters by review status, including unreviewed", async () => {
    await get("?status=bad_audio");
    expect(
      mockPrisma.speechRecording.findMany.mock.calls[0][0].where.reviewStatus,
    ).toBe("bad_audio");
    await get("?status=unreviewed");
    expect(
      mockPrisma.speechRecording.findMany.mock.calls[1][0].where.reviewStatus,
    ).toBeNull();
    expect((await get("?status=nonsense")).status).toBe(400);
  });

  it("clamps the limit to 1..100", async () => {
    await get("?limit=9999");
    await get("?limit=0");
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].take).toBe(100);
    expect(mockPrisma.speechRecording.findMany.mock.calls[1][0].take).toBe(50);
  });

  it("503 when storage is not configured", async () => {
    mockSignedRead.mockRejectedValue(new StorageConfigError("no key"));
    expect((await get()).status).toBe(503);
  });

  it("a single failed URL leaves that clip's url null, not the whole list", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      row({ id: "a", storagePath: "clips/a.webm" }),
      row({ id: "b", storagePath: "clips/b.webm" }),
    ]);
    mockSignedRead.mockImplementation(async (p: string) => {
      if (p.includes("b.")) throw new Error("boom");
      return "https://storage.example/ok";
    });
    const body = await (await get()).json();
    expect(body.recordings.map((r: { url: string | null }) => r.url)).toEqual([
      "https://storage.example/ok",
      null,
    ]);
  });
});

describe("PATCH /api/lab/speech/recordings", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await patch({ id: "rec-1", reviewStatus: "keep" })).status).toBe(
      404,
    );
    process.env.SPEECH_LAB_ENABLED = "1";
    forbidden();
    expect((await patch({ id: "rec-1", reviewStatus: "keep" })).status).toBe(
      403,
    );
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });

  it.each(["keep", "bad_audio", "wrong_text", null])(
    "sets reviewStatus %s",
    async (status) => {
      const res = await patch({ id: "rec-1", reviewStatus: status });
      expect(res.status).toBe(200);
      expect(mockPrisma.speechRecording.update.mock.calls[0][0]).toMatchObject({
        where: { id: "rec-1" },
        data: { reviewStatus: status },
      });
    },
  );

  it("touches only reviewStatus: never tier, consent or publication", async () => {
    await patch({
      id: "rec-1",
      reviewStatus: "keep",
      tier: "open",
      publishedOpenAt: "2026-01-01",
    });
    expect(
      Object.keys(mockPrisma.speechRecording.update.mock.calls[0][0].data),
    ).toEqual(["reviewStatus"]);
  });

  it("400 for an unknown status, a missing status, a missing id, a malformed body", async () => {
    expect((await patch({ id: "rec-1", reviewStatus: "great" })).status).toBe(
      400,
    );
    expect((await patch({ id: "rec-1" })).status).toBe(400);
    expect((await patch({ reviewStatus: "keep" })).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
  });

  it("404 for an unknown clip", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(null);
    expect((await patch({ id: "nope", reviewStatus: "keep" })).status).toBe(
      404,
    );
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });
});
