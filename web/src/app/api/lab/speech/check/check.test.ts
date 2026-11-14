import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher, transcriptRead } = vi.hoisted(() => ({
  mockPrisma: {
    speechCheck: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      upsert: vi.fn(),
    },
    speechRecording: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    speechTranscript: { findFirst: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
  transcriptRead: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as next } from "./next/route";
import { POST as submit } from "./submit/route";
import { GET as transcript } from "./transcript/route";

const original = process.env.SPEECH_LAB_ENABLED;
const base = "http://test/api/lab/speech/check";
const getNext = (qs = "") => next(new Request(`${base}/next${qs}`));
const post = (body: unknown) =>
  submit(new Request(`${base}/submit`, { method: "POST", body: JSON.stringify(body) }));
const getTranscript = (id = "c1") =>
  transcript(new Request(`${base}/transcript?recordingId=${id}`));

const clip = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  promptId: "p1",
  dialect: null,
  prompt: { promptId: "code_001", text: "Say hello." },
  coldAuthorAnswer: { answerText: "ada ba ode" },
  ...over,
});
const submitRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  annotatorId: "someone-else",
  uploadedAt: new Date(),
  isDemo: false,
  demoSessionId: null,
  prompt: { isHoldout: false, split: "train" },
  coldAuthorAnswer: { answerText: "ada ba ode" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "me", role: "RESEARCHER" });
  mockPrisma.speechCheck.findMany.mockResolvedValue([]);
  mockPrisma.speechCheck.groupBy.mockResolvedValue([]);
  mockPrisma.speechCheck.findUnique.mockResolvedValue(null);
  mockPrisma.speechCheck.upsert.mockImplementation(async (a: { update: object }) => ({
    id: "k1",
    ...a.update,
  }));
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.speechRecording.findUnique.mockResolvedValue(submitRow());
  mockPrisma.speechRecording.update.mockResolvedValue({ id: "c1" });
  mockPrisma.speechTranscript.findFirst.mockImplementation(async () => {
    transcriptRead();
    return { text: "ada ku ode" };
  });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET check/next", () => {
  it("404 with the flag off, 403 for a non-speaker", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await getNext()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await getNext()).status).toBe(403);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });

  it("queries only other speakers' kept-or-unreviewed, unfrozen, written-answer clips, never own or already checked", async () => {
    mockPrisma.speechCheck.findMany.mockResolvedValue([{ recordingId: "done1" }]);
    await getNext();
    const where = mockPrisma.speechRecording.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      uploadedAt: { not: null },
      coldAuthorAnswerId: { not: null },
      annotatorId: { not: null, notIn: ["me"] },
      id: { notIn: ["done1"] },
      OR: [{ isDemo: false }],
      AND: [{ OR: [{ reviewStatus: null }, { reviewStatus: "keep" }] }],
      prompt: { isHoldout: false, split: { not: "test" } },
    });
  });

  it("never selects audio bytes", async () => {
    await getNext();
    const select = mockPrisma.speechRecording.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("bytes");
  });

  it("admits demo clips only inside that demo session", async () => {
    await getNext("?demo=d1");
    const where = mockPrisma.speechRecording.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ isDemo: false }, { demoSessionId: "d1" }]);
  });

  it("serves the prompt with the fewest checks first", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ id: "a", promptId: "p1", prompt: { promptId: "code_001", text: "t" } }),
      clip({ id: "b", promptId: "p2", prompt: { promptId: "code_002", text: "t" } }),
    ]);
    mockPrisma.speechCheck.groupBy.mockResolvedValue([
      { recordingId: "a", _count: { _all: 3 } },
      { recordingId: "b", _count: { _all: 1 } },
    ]);
    const body = await (await getNext()).json();
    expect(body.task.recording.id).toBe("b");
  });

  it("is blind and carries the written answer, with no transcript and no speaker", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip()]);
    const body = await (await getNext()).json();
    expect(body.task.answer).toEqual({
      text: "ada ba ode",
      words: ["ada", "ba", "ode"],
    });
    expect(body.task.recording.url).toContain("c1");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/transcript|annotatorId|tier/i);
    expect(mockPrisma.speechTranscript.findFirst).not.toHaveBeenCalled();
  });

  it("is complete when nothing is left", async () => {
    const body = await (await getNext()).json();
    expect(body).toMatchObject({ complete: true });
  });
});

describe("POST check/submit", () => {
  it.each([
    ["matches", "keep"],
    ["does_not_match", "wrong_text"],
    ["cannot_hear", "bad_audio"],
  ])("%s sets reviewStatus %s", async (verdict, status) => {
    const res = await post({ recordingId: "c1", verdict });
    expect(res.status).toBe(200);
    expect(mockPrisma.speechRecording.update.mock.calls[0][0]).toMatchObject({
      where: { id: "c1" },
      data: { reviewStatus: status },
    });
    expect(mockPrisma.speechCheck.upsert.mock.calls[0][0].create).toMatchObject({
      recordingId: "c1",
      reviewerId: "me",
      verdict,
      isDemo: false,
    });
  });

  it("stores the wrong word's position, only with does_not_match and inside the answer", async () => {
    await post({ recordingId: "c1", verdict: "does_not_match", wrongWordIndex: 1 });
    expect(mockPrisma.speechCheck.upsert.mock.calls[0][0].update.wrongWordIndex).toBe(1);
    mockPrisma.speechCheck.upsert.mockClear();
    for (const body of [
      { recordingId: "c1", verdict: "matches", wrongWordIndex: 0 },
      { recordingId: "c1", verdict: "does_not_match", wrongWordIndex: 3 },
      { recordingId: "c1", verdict: "does_not_match", wrongWordIndex: -1 },
      { recordingId: "c1", verdict: "does_not_match", wrongWordIndex: 1.5 },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mockPrisma.speechCheck.upsert).not.toHaveBeenCalled();
  });

  it("changing a verdict updates the same row (one per clip and reviewer)", async () => {
    await post({ recordingId: "c1", verdict: "matches" });
    expect(mockPrisma.speechCheck.upsert.mock.calls[0][0].where).toEqual({
      recordingId_reviewerId: { recordingId: "c1", reviewerId: "me" },
    });
  });

  it("400 on a bad verdict or a missing id", async () => {
    expect((await post({ recordingId: "c1", verdict: "maybe" })).status).toBe(400);
    expect((await post({ verdict: "matches" })).status).toBe(400);
  });

  it("403 for the caller's own clip, 403 for a frozen prompt, 404 for an unconfirmed clip", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(submitRow({ annotatorId: "me" }));
    expect((await post({ recordingId: "c1", verdict: "matches" })).status).toBe(403);
    mockPrisma.speechRecording.findUnique.mockResolvedValue(
      submitRow({ prompt: { isHoldout: true, split: "test" } }),
    );
    expect((await post({ recordingId: "c1", verdict: "matches" })).status).toBe(403);
    mockPrisma.speechRecording.findUnique.mockResolvedValue(submitRow({ uploadedAt: null }));
    expect((await post({ recordingId: "c1", verdict: "matches" })).status).toBe(404);
    expect(mockPrisma.speechCheck.upsert).not.toHaveBeenCalled();
  });

  it("a demo verdict is stored as demo and leaves the clip's status alone", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(
      submitRow({ isDemo: true, demoSessionId: "d1" }),
    );
    expect((await post({ recordingId: "c1", verdict: "matches" })).status).toBe(404);
    const res = await post({ recordingId: "c1", verdict: "matches", demoSessionId: "d1" });
    expect(res.status).toBe(200);
    expect(mockPrisma.speechCheck.upsert.mock.calls[0][0].create.isDemo).toBe(true);
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
  });

  it("the reply carries no transcript", async () => {
    const text = await (await post({ recordingId: "c1", verdict: "matches" })).text();
    expect(text).not.toMatch(/transcript/i);
    expect(mockPrisma.speechTranscript.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET check/transcript", () => {
  it("is refused, and the transcript table is not read, before the caller's first verdict", async () => {
    const res = await getTranscript();
    expect(res.status).toBe(403);
    expect(transcriptRead).not.toHaveBeenCalled();
    expect(mockPrisma.speechTranscript.findFirst).not.toHaveBeenCalled();
  });

  it("returns the transcript once a verdict from this reviewer exists", async () => {
    mockPrisma.speechCheck.findUnique.mockResolvedValue({ id: "k1" });
    const res = await getTranscript();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "ada ku ode" });
    expect(mockPrisma.speechCheck.findUnique.mock.calls[0][0].where).toEqual({
      recordingId_reviewerId: { recordingId: "c1", reviewerId: "me" },
    });
  });

  it("the whole order: next, submit, then transcript, and only the last touches the transcript", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip()]);
    await getNext();
    await post({ recordingId: "c1", verdict: "does_not_match", wrongWordIndex: 1 });
    expect(transcriptRead).not.toHaveBeenCalled();
    mockPrisma.speechCheck.findUnique.mockResolvedValue({ id: "k1" });
    await getTranscript();
    expect(transcriptRead).toHaveBeenCalledTimes(1);
  });

  it("is null, not an error, when no transcript exists yet", async () => {
    mockPrisma.speechCheck.findUnique.mockResolvedValue({ id: "k1" });
    mockPrisma.speechTranscript.findFirst.mockResolvedValue(null);
    expect(await (await getTranscript()).json()).toEqual({ transcript: null });
  });

  it("400 without a recordingId", async () => {
    const res = await transcript(new Request(`${base}/transcript`));
    expect(res.status).toBe(400);
  });
});
