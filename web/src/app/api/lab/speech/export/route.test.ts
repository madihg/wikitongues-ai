import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: { speechRecording: { findMany: vi.fn() } },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";
import { licensedRow, openRow } from "@/lib/speech/fixtures";

const original = process.env.SPEECH_LAB_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

const lines = async () => {
  const text = await (await GET()).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};

describe("GET /api/lab/speech/export", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await GET()).status).toBe(403);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });

  it("returns JSONL as a download, no-store", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([openRow()]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [line] = await lines();
    expect(line).toMatchObject({
      tier: "open",
      license: "CC-BY-4.0",
      clip: "clips/synthetic-1.webm",
    });
  });

  it("asks the database for OPEN, published, cleared, non-test, non-demo rows only", async () => {
    await GET();
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      tier: "open",
      publishedOpenAt: { not: null },
      isDemo: false,
      isTestSet: false,
      rightsStatus: "cleared",
      uploadedAt: { not: null },
    });
  });

  it("the guard, not the query, refuses rows: forbidden rows the mock hands back never reach the output", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      openRow({ id: "ok", storagePath: "clips/ok.webm" }),
      openRow({
        id: "c",
        storagePath: "clips/community.webm",
        tier: "community_only",
      }),
      openRow({ id: "t", storagePath: "clips/testset.webm", isTestSet: true }),
      openRow({
        id: "f",
        storagePath: "clips/frozen.webm",
        prompt: { isHoldout: true, split: "test" },
      }),
      licensedRow({ id: "l", storagePath: "clips/licensed.webm" }),
      openRow({ id: "d", storagePath: "clips/demo.webm", isDemo: true }),
      openRow({
        id: "n",
        storagePath: "clips/noconsent.webm",
        consentId: null,
      }),
      openRow({
        id: "u",
        storagePath: "clips/pending.webm",
        publishedOpenAt: null,
      }),
    ]);
    expect((await lines()).map((l) => l.clip)).toEqual(["clips/ok.webm"]);
  });

  it("is an empty body when nothing is exportable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});
