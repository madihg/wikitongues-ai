import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn(), updateMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/freeze", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

/** First findMany: the chosen clips. Second: the speakers' other kept clips. */
function rows(chosen: object[], others: object[] = []) {
  mockPrisma.speechRecording.findMany
    .mockResolvedValueOnce(chosen)
    .mockResolvedValueOnce(others);
}
const clip = (id: string, annotatorId: string | null, isDemo = false) => ({
  id,
  annotatorId,
  isDemo,
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.updateMany.mockResolvedValue({ count: 2 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("POST /api/lab/speech/freeze", () => {
  it("404 with the flag off, before anything else", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post({ recordingIds: ["a"] })).status).toBe(404);
    expect(mockRequireResearcher).not.toHaveBeenCalled();
  });

  it("403 for a non-researcher, and nothing is read or written", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post({ recordingIds: ["a"] })).status).toBe(403);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("400 for a body with no ids", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ recordingIds: [] })).status).toBe(400);
    expect((await post({ recordingIds: [1] })).status).toBe(400);
  });

  it("404 when an id does not exist", async () => {
    rows([clip("a", "s1")]);
    const res = await post({ recordingIds: ["a", "ghost"] });
    expect(res.status).toBe(404);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("409 for a demo clip", async () => {
    rows([clip("a", "s1", true)]);
    const res = await post({ recordingIds: ["a"] });
    expect(res.status).toBe(409);
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("409 when a speaker already has a kept non-test clip not being frozen", async () => {
    rows([clip("a", "s1")], [clip("other", "s1")]);
    const res = await post({ recordingIds: ["a"] });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toMatch(/speaker/i);
    expect(JSON.stringify(j)).not.toContain("s1"); // the account id never leaves
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
  });

  it("looks for other kept, non-test, non-demo clips of the same speakers, excluding the chosen ones", async () => {
    rows([clip("a", "s1"), clip("b", "s2"), clip("c", null)]);
    await post({ recordingIds: ["a", "b", "c"] });
    const arg = mockPrisma.speechRecording.findMany.mock.calls[1][0];
    expect(arg.where).toMatchObject({
      annotatorId: { in: ["s1", "s2"] },
      isTestSet: false,
      isDemo: false,
      reviewStatus: "keep",
      id: { notIn: ["a", "b", "c"] },
    });
    expect(arg.select).toBeDefined();
    expect(arg.select.bytes).toBeUndefined();
  });

  it("200 sets isTestSet on the chosen clips only", async () => {
    rows([clip("a", "s1"), clip("b", "s1")]);
    const res = await post({ recordingIds: ["a", "b"] });
    expect(res.status).toBe(200);
    expect(mockPrisma.speechRecording.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { isTestSet: true },
    });
    expect(await res.json()).toMatchObject({ frozen: 2, ids: ["a", "b"] });
  });

  it("200 for a clip with no known speaker (nothing to disjoin)", async () => {
    rows([clip("a", null)]);
    expect((await post({ recordingIds: ["a"] })).status).toBe(200);
    // no second query when there are no speakers
    expect(mockPrisma.speechRecording.findMany).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates repeated ids", async () => {
    rows([clip("a", "s1")]);
    await post({ recordingIds: ["a", "a"] });
    expect(mockPrisma.speechRecording.updateMany.mock.calls[0][0].where).toEqual(
      { id: { in: ["a"] } },
    );
  });
});
