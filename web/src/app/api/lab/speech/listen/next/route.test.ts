import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    speechComparison: { findMany: vi.fn(), count: vi.fn() },
    speechCandidate: { findFirst: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";
import { abSwap, assignedPair } from "@/lib/pairing";

const original = process.env.SPEECH_LAB_ENABLED;

const get = (qs = "") =>
  GET(new Request(`http://test/api/lab/speech/listen/next${qs}`));

let t = 0;
const clip = (over: Record<string, unknown> = {}) => ({
  id: `clip-${++t}`,
  promptId: "p-1",
  language: "igala",
  annotatorId: `speaker-${t}`,
  modelOutputId: null,
  sourceType: "contributor",
  sourceRef: null,
  createdAt: new Date(2026, 9, 1, 0, 0, t),
  prompt: { promptId: "code_001", text: "Say hello." },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  t = 0;
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.speechComparison.findMany.mockResolvedValue([]);
  mockPrisma.speechComparison.count.mockResolvedValue(0);
  mockPrisma.speechCandidate.findFirst.mockResolvedValue(null);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/listen/next", () => {
  it("404 with the flag off, 403 for a non-researcher", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await get()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await get()).status).toBe(403);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });

  it("is complete when no prompt has two distinct voices", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip()]);
    expect(await (await get()).json()).toMatchObject({ complete: true });
  });

  it("does not pair two clips from the same human speaker", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ annotatorId: "same" }),
      clip({ annotatorId: "same" }),
    ]);
    expect((await (await get()).json()).complete).toBe(true);
  });

  it("serves a pair for a prompt with two speakers, with the arena's pair and orientation", async () => {
    const a = clip();
    const b = clip();
    mockPrisma.speechRecording.findMany.mockResolvedValue([a, b]);
    const body = await (await get()).json();

    const [i, j] = assignedPair("r1", "code_001", 2)!;
    const list = [a, b];
    const swap = abSwap("r1", "code_001");
    const expectA = (swap ? list[j] : list[i]).id;
    const expectB = (swap ? list[i] : list[j]).id;

    expect(body.complete).toBe(false);
    expect(body.task.clipA.id).toBe(expectA);
    expect(body.task.clipB.id).toBe(expectB);
    expect(body.task.prompt).toMatchObject({
      promptId: "code_001",
      text: "Say hello.",
    });
    expect(body.task.clipA.url).toBe(
      `/api/lab/speech/recording/${expectA}/audio`,
    );
    expect(body.task.language).toBe("igala");
  });

  it("keeps the same A and B across reloads", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip(),
      clip(),
      clip(),
    ]);
    const first = await (await get()).json();
    const second = await (await get()).json();
    expect(second.task.clipA.id).toBe(first.task.clipA.id);
    expect(second.task.clipB.id).toBe(first.task.clipB.id);
  });

  it("is blind: no tier, speaker, source or storage path in the response", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip(), clip()]);
    const text = await (await get()).text();
    for (const leak of [
      "tier",
      "speaker",
      "annotator",
      "sourceType",
      "modelOutput",
      "storagePath",
      "derived",
      "contributor",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("pairs a human clip with a synthesised one, and two synthesised clips as two voices", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ annotatorId: "h" }),
      clip({ annotatorId: null, sourceType: "derived", modelOutputId: "mo-1" }),
    ]);
    expect((await (await get()).json()).complete).toBe(false);
    t = 10;
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ annotatorId: null, sourceType: "derived", modelOutputId: "mo-1" }),
      clip({ annotatorId: null, sourceType: "derived", modelOutputId: "mo-2" }),
    ]);
    expect((await (await get()).json()).complete).toBe(false);
  });

  it("never reads frozen prompts, unconfirmed clips or rejected clips (the query filters)", async () => {
    await get();
    const where = mockPrisma.speechRecording.findMany.mock.calls[0][0].where;
    expect(where.prompt).toEqual({ isHoldout: false, split: { not: "test" } });
    expect(where.uploadedAt).toEqual({ not: null });
    expect(where.AND[0].OR).toEqual([
      { reviewStatus: null },
      { reviewStatus: { notIn: ["bad_audio", "wrong_text"] } },
    ]);
    expect(where.OR).toEqual([{ isDemo: false }]);
  });

  it("skips prompts the researcher already judged", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip(), clip()]);
    mockPrisma.speechComparison.findMany.mockResolvedValue([
      { promptId: "p-1", recordingA: { language: "igala" } },
    ]);
    const body = await (await get()).json();
    expect(body.complete).toBe(true);
    expect(body.progress.completed).toBe(1);
    expect(mockPrisma.speechComparison.findMany.mock.calls[0][0].where).toEqual(
      {
        annotatorId: "r1",
        isDemo: false,
      },
    );
  });

  it("serves prompts in code order", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ promptId: "p-b", prompt: { promptId: "code_b", text: "B" } }),
      clip({ promptId: "p-b", prompt: { promptId: "code_b", text: "B" } }),
      clip({ promptId: "p-a", prompt: { promptId: "code_a", text: "A" } }),
      clip({ promptId: "p-a", prompt: { promptId: "code_a", text: "A" } }),
    ]);
    const body = await (await get()).json();
    expect(body.task.prompt.promptId).toBe("code_a");
    expect(body.progress.remaining).toBe(2);
  });

  it("demo mode ignores judgment history and admits that session's clips", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([clip(), clip()]);
    const body = await (await get("?demo=sess-1")).json();
    expect(body.demo).toBe(true);
    expect(mockPrisma.speechComparison.findMany).not.toHaveBeenCalled();
    expect(
      mockPrisma.speechRecording.findMany.mock.calls[0][0].where.OR,
    ).toEqual([{ isDemo: false }, { demoSessionId: "sess-1" }]);
  });

  it("never pairs an Igala clip with an English one", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ language: "igala" }),
      clip({ language: "english" }),
    ]);
    expect((await (await get()).json()).complete).toBe(true);
  });

  it("pairs English clips with each other, and says the language", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ language: "igala" }),
      clip({ language: "english" }),
      clip({ language: "english" }),
    ]);
    const body = await (await get()).json();
    expect(body.complete).toBe(false);
    expect(body.task.language).toBe("english");
    expect(body.task.clipA.id).not.toBe("clip-1");
    expect(body.task.clipB.id).not.toBe("clip-1");
  });

  it("a judgment in one language does not finish the other language", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ language: "igala" }),
      clip({ language: "igala" }),
      clip({ language: "english" }),
      clip({ language: "english" }),
    ]);
    mockPrisma.speechComparison.findMany.mockResolvedValue([
      { promptId: "p-1", recordingA: { language: "igala" } },
    ]);
    const body = await (await get()).json();
    expect(body.task.language).toBe("english");
  });

  it("selects no audio bytes", async () => {
    await get();
    const sel = mockPrisma.speechRecording.findMany.mock.calls[0][0].select;
    expect(sel).not.toHaveProperty("bytes");
  });
});

describe("next-day exposure (a promoted TTS candidate)", () => {
  const ids = (b: { task: { clipA: { id: string }; clipB: { id: string } } }) =>
    [b.task.clipA.id, b.task.clipB.id].sort();

  // Prompt p-1 has two humans; prompt p-2 has a derived clip of the promoted
  // model and one human. The first normal pair would be on p-1.
  const seed = () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      clip({ id: "h1", promptId: "p-1", annotatorId: "s1" }),
      clip({ id: "h2", promptId: "p-1", annotatorId: "s2" }),
      clip({ id: "h3", promptId: "p-2", annotatorId: "s3", prompt: { promptId: "code_002", text: "x" } }),
      clip({
        id: "d1",
        promptId: "p-2",
        annotatorId: null,
        sourceType: "derived",
        sourceRef: "tts-model-1",
        modelOutputId: null,
        prompt: { promptId: "code_002", text: "x" },
      }),
    ]);
  };

  it("with no promoted candidate nothing changes and nothing extra is read", async () => {
    seed();
    const body = await (await get()).json();
    expect(ids(body)).toEqual(["h1", "h2"]);
    expect(mockPrisma.speechComparison.count).not.toHaveBeenCalled();
  });

  it("with one, the first episode of the day pairs a derived clip against a human clip", async () => {
    seed();
    mockPrisma.speechCandidate.findFirst.mockResolvedValue({ modelRef: "tts-model-1" });
    const body = await (await get()).json();
    expect(ids(body)).toEqual(["d1", "h3"]);
    expect(mockPrisma.speechCandidate.findFirst.mock.calls[0][0].where).toEqual({
      system: "tts",
      promotedAt: { not: null },
    });
    // Blind, as ever: no model ref, tier or speaker in the response.
    expect(JSON.stringify(body)).not.toMatch(/tts-model-1|sourceRef|annotatorId/);
  });

  it("not on a day the caller has already judged, and not for a derived clip of another model", async () => {
    seed();
    mockPrisma.speechCandidate.findFirst.mockResolvedValue({ modelRef: "tts-model-1" });
    mockPrisma.speechComparison.count.mockResolvedValue(1);
    expect(ids(await (await get()).json())).toEqual(["h1", "h2"]);
    mockPrisma.speechComparison.count.mockResolvedValue(0);
    mockPrisma.speechCandidate.findFirst.mockResolvedValue({ modelRef: "other" });
    expect(ids(await (await get()).json())).toEqual(["h1", "h2"]);
  });

  it("demo mode never reads the candidate", async () => {
    seed();
    mockPrisma.speechCandidate.findFirst.mockResolvedValue({ modelRef: "tts-model-1" });
    await get("?demo=d1");
    expect(mockPrisma.speechCandidate.findFirst).not.toHaveBeenCalled();
  });
});
