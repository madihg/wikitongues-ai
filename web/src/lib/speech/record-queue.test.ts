import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  countRecordWaiting,
  isSpeechSetPrompt,
  loadRecordQueue,
  speechSetFirst,
} from "./record-queue";
import {
  MAX_TRANSLATION_CHARS,
  translationReady,
} from "./limits";
import {
  V46_PROMPTS,
  isSpeechPrompt,
  v46SpeechEnglish,
} from "@/lib/prompt-bank-v46";

/** Fixtures are synthetic English stand-ins. */
const answer = (id: string, promptRow: string, day: number) => ({
  id,
  promptId: promptRow,
  answerText: `stand-in answer ${id}`,
  englishGloss: null,
  englishTranslation: null,
  dialect: null,
  createdAt: new Date(Date.UTC(2026, 9, day)),
  prompt: {
    id: promptRow,
    promptId: `code_${promptRow}`,
    text: "Say hello.",
    bucket: "orthography",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
});

describe("loadRecordQueue", () => {
  it("asks only for the speaker's own real answers on unfrozen Igala prompts", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-9", language: "igala" },
      { promptId: "p-9", language: "igala" },
      { promptId: "p-9", language: "english" },
    ]);
    const q = await loadRecordQueue("u1", { exclude: ["code_x"] });
    expect(q.recordedIds).toEqual(["p-9"]);
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      annotatorId: "u1",
      isDemo: false,
    });
    const where = mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where;
    expect(where.annotatorId).toBe("u1");
    expect(where.isDemo).toBe(false);
    expect(where.prompt).toEqual({
      isHoldout: false,
      split: { not: "test" },
      language: "igala",
      id: { notIn: ["p-9"] },
      promptId: { notIn: ["code_x"] },
    });
  });

  it("keeps one row per prompt (the latest answer), oldest first", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answer("a1", "p-1", 1),
      answer("a2", "p-2", 2),
      answer("a3", "p-1", 3),
    ]);
    const q = await loadRecordQueue("u1");
    expect(q.waiting.map((a) => a.id)).toEqual(["a2", "a3"]);
  });

  it("demo mode ignores recording history", async () => {
    await loadRecordQueue("u1", { isDemo: true });
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
  });
});

describe("loadRecordQueue: the English clip", () => {
  const byPromptIds = (rows: ReturnType<typeof answer>[]) =>
    mockPrisma.coldAuthorAnswer.findMany.mockImplementation(
      async (args: { where: { prompt: { id: { in?: string[]; notIn?: string[] } } } }) => {
        const ids = args.where.prompt.id;
        return rows.filter((r) =>
          ids.in ? ids.in.includes(r.promptId) : !ids.notIn?.includes(r.promptId),
        );
      },
    );

  it("an answer with an Igala clip and no English clip waits for its English", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-1", language: "igala" },
      { promptId: "p-2", language: "igala" },
      { promptId: "p-2", language: "english" },
    ]);
    byPromptIds([answer("a1", "p-1", 1), answer("a2", "p-2", 2), answer("a3", "p-3", 3)]);
    const q = await loadRecordQueue("u1");
    expect(q.waiting.map((a) => a.id)).toEqual(["a3"]);
    expect(q.englishMissing.map((a) => a.id)).toEqual(["a1"]);
    expect(await countRecordWaiting("u1")).toBe(2);
  });

  it("an English clip alone does not finish a prompt: it still waits for its Igala clip", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-1", language: "english" },
    ]);
    byPromptIds([answer("a1", "p-1", 1)]);
    const q = await loadRecordQueue("u1");
    expect(q.waiting.map((a) => a.id)).toEqual(["a1"]);
    expect(q.englishMissing).toEqual([]);
  });

  it("a clip on a prompt with no answer of the speaker's (a studio line) is not waiting", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-7", language: "igala" },
    ]);
    byPromptIds([]);
    const q = await loadRecordQueue("u1");
    expect(q.englishMissing).toEqual([]);
    expect(await countRecordWaiting("u1")).toBe(0);
  });
});

describe("countRecordWaiting", () => {
  it("is the length of the queue's first step, from the same loader", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answer("a1", "p-1", 1),
      answer("a2", "p-2", 2),
      answer("a3", "p-1", 3),
    ]);
    const n = await countRecordWaiting("u1");
    const q = await loadRecordQueue("u1");
    expect(n).toBe(q.waiting.length + q.englishMissing.length);
    expect(n).toBe(2);
  });

  it("is zero with nothing waiting", async () => {
    expect(await countRecordWaiting("u1")).toBe(0);
  });
});

describe("the speech set (prompt bank v4.6)", () => {
  it("isSpeechSetPrompt is true for exactly the 120 speech prompts of the bank", () => {
    const speech = V46_PROMPTS.filter(isSpeechPrompt);
    expect(speech).toHaveLength(120);
    for (const p of V46_PROMPTS) {
      expect(isSpeechSetPrompt(p.promptId), p.promptId).toBe(isSpeechPrompt(p));
    }
    // The text family "spell" shares the prefix and is not in the set.
    expect(isSpeechSetPrompt("ig_v46_spell_001")).toBe(false);
    expect(isSpeechSetPrompt("code_001")).toBe(false);
    expect(isSpeechSetPrompt("ig_v45_spnum_001")).toBe(false);
  });

  it("speechSetFirst splits without reordering either part", () => {
    const codes = ["a", "ig_v46_spvow_002", "b", "ig_v46_spnum_001"];
    expect(speechSetFirst(codes, (c) => c)).toEqual({
      speechSet: ["ig_v46_spvow_002", "ig_v46_spnum_001"],
      rest: ["a", "b"],
    });
  });

  it("the queue's first step lists speech-set answers before older ones, each oldest first", async () => {
    const a = (id: string, code: string, day: number) => ({
      ...answer(id, `row-${code}`, day),
      prompt: {
        id: `row-${code}`,
        promptId: code,
        text: "Say hello.",
        bucket: "orthography",
      },
    });
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      a("old-1", "code_001", 1),
      a("old-2", "code_002", 2),
      a("sp-1", "ig_v46_spnum_001", 20),
      a("sp-2", "ig_v46_spcar_004", 21),
    ]);
    const q = await loadRecordQueue("u1");
    expect(q.waiting.map((x) => x.id)).toEqual(["sp-1", "sp-2", "old-1", "old-2"]);
    // The sidebar number does not change with the order.
    expect(await countRecordWaiting("u1")).toBe(4);
  });

  it("every given English sentence fits the translation box and turns recording on", () => {
    const given = V46_PROMPTS.filter(isSpeechPrompt)
      .map((p) => v46SpeechEnglish(p.promptId))
      .filter((e): e is string => e !== null);
    expect(given.length).toBeGreaterThan(0);
    for (const e of given) {
      expect(e.length, e).toBeLessThanOrEqual(MAX_TRANSLATION_CHARS);
      expect(translationReady(e), e).toBe(true);
    }
  });
});
