import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, PATCH } from "./route";

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
  mimeType: "audio/webm",
  language: "igala",
  quality: null,
  durationMs: 4200,
  annotatorId: "speaker-account-1",
  dialect: null,
  tier: "community_only",
  consentVersion: "2026-10-19-v1",
  reviewStatus: null,
  rightsStatus: "pending",
  createdAt: new Date("2026-10-18T00:00:00Z"),
  prompt: { promptId: "code_001", text: "Say hello." },
  coldAuthorAnswer: { answerText: "an english stand-in", englishGloss: null },
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

  it("lists clips with their audio URL, the pseudonym and never the account id", async () => {
    const res = await get();
    const text = await res.text();
    const body = JSON.parse(text);
    const r = body.recordings[0];
    expect(r.url).toBe("/api/lab/speech/recording/rec-1/audio");
    expect(r.language).toBe("igala");
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
    // The storage name is not exposed, and the audio never rides in a list.
    expect(r.storagePath).toBeUndefined();
    expect(r.bytes).toBeUndefined();
    expect(text).not.toContain('"bytes"');
    const sel = mockPrisma.speechRecording.findMany.mock.calls[0][0].select;
    expect(sel).not.toHaveProperty("bytes");
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

  const q = (over: Record<string, number> = {}) => ({
    durationMs: 4000,
    leadingSilenceMs: 200,
    trailingSilenceMs: 400,
    speechShare: 0.8,
    rmsDbfs: -22,
    peakDbfs: -4,
    clippingShare: 0,
    syllables: 9,
    syllablesPerSecond: 2.5,
    ...over,
  });

  it("filters by language in the query, and rejects an unknown one", async () => {
    await get("?language=english");
    expect(
      mockPrisma.speechRecording.findMany.mock.calls[0][0].where.language,
    ).toBe("english");
    expect((await get("?language=french")).status).toBe(400);
  });

  it("returns the take metrics and the verdict flags with each clip", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      row({ id: "q", quality: q({ rmsDbfs: -45 }) }),
      row({ id: "n", quality: null }),
    ]);
    const body = await (await get()).json();
    expect(body.recordings[0].quality.rmsDbfs).toBe(-45);
    expect(body.recordings[0].flags).toContain("too_quiet");
    expect(body.recordings[1].quality).toBeNull();
    expect(body.recordings[1].flags).toEqual([]);
  });

  it("sorts by loudness, clips without metrics last", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      row({ id: "none", quality: null }),
      row({ id: "loud", quality: q({ rmsDbfs: -12 }) }),
      row({ id: "quiet", quality: q({ rmsDbfs: -40 }) }),
    ]);
    const ids = (b: { recordings: { id: string }[] }) =>
      b.recordings.map((r) => r.id);
    expect(ids(await (await get("?sort=quietest")).json())).toEqual([
      "quiet",
      "loud",
      "none",
    ]);
    expect(ids(await (await get("?sort=loudest")).json())).toEqual([
      "loud",
      "quiet",
      "none",
    ]);
    expect((await get("?sort=nonsense")).status).toBe(400);
  });

  it("filters to takes with one verdict, in memory over a wider window", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      row({ id: "ok", quality: q() }),
      row({ id: "clip", quality: q({ clippingShare: 0.05 }) }),
    ]);
    const body = await (await get("?flag=clipped&limit=10")).json();
    expect(body.recordings.map((r: { id: string }) => r.id)).toEqual(["clip"]);
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].take).toBe(500);
    expect((await get("?flag=nonsense")).status).toBe(400);
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
