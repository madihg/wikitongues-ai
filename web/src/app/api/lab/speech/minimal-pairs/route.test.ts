import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    prompt: { findUnique: vi.fn() },
    speechMinimalPair: { upsert: vi.fn(), findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, POST } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/minimal-pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const valid = { promptId: "code_001", targetSpelling: "kwàba", foilSpelling: "kwába" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockPrisma.prompt.findUnique.mockResolvedValue({ id: "p-1", promptId: "code_001", isHoldout: false, split: "train" });
  mockPrisma.speechMinimalPair.upsert.mockResolvedValue({ id: "mp-1" });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/speech/minimal-pairs: marking a prompt", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post(valid)).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post(valid)).status).toBe(403);
    expect(mockPrisma.speechMinimalPair.upsert).not.toHaveBeenCalled();
  });

  it("marks a train-side prompt with two target spellings, one pair per prompt", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const arg = mockPrisma.speechMinimalPair.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ promptId: "p-1" });
    expect(arg.create).toMatchObject({
      promptId: "p-1",
      targetSpelling: valid.targetSpelling,
      foilSpelling: valid.foilSpelling,
      createdById: "r1",
    });
    expect(arg.update).toMatchObject({ targetSpelling: valid.targetSpelling });
  });

  it("refuses a frozen prompt with a bare 403 and writes nothing", async () => {
    for (const p of [
      { id: "p-1", promptId: "code_001", isHoldout: true, split: "train" },
      { id: "p-1", promptId: "code_001", isHoldout: false, split: "test" },
    ]) {
      mockPrisma.prompt.findUnique.mockResolvedValue(p);
      const res = await post(valid);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    }
    expect(mockPrisma.speechMinimalPair.upsert).not.toHaveBeenCalled();
  });

  it("404 for an unknown prompt; 400 for spellings that are not a tone pair", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
    mockPrisma.prompt.findUnique.mockResolvedValue({ id: "p-1", promptId: "code_001", isHoldout: false, split: "train" });
    expect((await post({ ...valid, foilSpelling: valid.targetSpelling })).status).toBe(400);
    expect((await post({ ...valid, foilSpelling: "gbaba" })).status).toBe(400);
    expect((await post({ promptId: "code_001" })).status).toBe(400);
    expect((await post({ ...valid, promptId: 5 })).status).toBe(400);
    expect(mockPrisma.speechMinimalPair.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/lab/speech/minimal-pairs", () => {
  it("lists the marked prompts and the coverage cell count", async () => {
    mockPrisma.speechMinimalPair.findMany.mockResolvedValue([
      { id: "mp-1", promptId: "p-1" },
      { id: "mp-2", promptId: "p-2" },
    ]);
    const j = await (await GET()).json();
    expect(j.coverage).toEqual({ cell: "tone_minimal_pair", items: 2 });
    expect(j.pairs).toHaveLength(2);
  });
});
