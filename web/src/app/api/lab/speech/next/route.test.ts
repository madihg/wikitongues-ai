import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    prompt: { findMany: vi.fn() },
    speakerProfile: { findUnique: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;

const get = (qs = "") =>
  GET(new Request(`http://test/api/lab/speech/next${qs}`));

const answerRow = (over: Record<string, unknown> = {}) => ({
  id: "ans-1",
  promptId: "p-1",
  answerText: "an english stand-in answer",
  englishGloss: "what it means in english",
  dialect: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  prompt: {
    id: "p-1",
    promptId: "code_001",
    text: "Say hello.",
    bucket: "orthography",
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.speechRecording.findMany.mockResolvedValue([]);
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
  mockPrisma.speakerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.prompt.findMany.mockResolvedValue([]);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/next", () => {
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
    expect(mockPrisma.coldAuthorAnswer.findMany).not.toHaveBeenCalled();
  });

  it("serves a prompt the researcher has an own answer for first, carrying that answer", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([answerRow()]);
    const body = await (await get()).json();
    expect(body.complete).toBe(false);
    expect(body.task.source).toBe("own_answer");
    expect(body.task.ownAnswer).toEqual({
      id: "ans-1",
      text: "an english stand-in answer",
      englishGloss: "what it means in english",
      dialect: null,
    });
    expect(body.task.prompt.promptId).toBe("code_001");
    // The no-answer step is not even consulted when an answer exists.
    expect(mockPrisma.prompt.findMany).not.toHaveBeenCalled();
  });

  it("takes the oldest own answer, and the latest answer when a prompt has several", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([
      answerRow({
        id: "old-a",
        promptId: "p-a",
        createdAt: new Date("2026-09-01"),
        prompt: {
          id: "p-a",
          promptId: "code_a",
          text: "A",
          bucket: "orthography",
        },
      }),
      answerRow({
        id: "new-b",
        promptId: "p-b",
        createdAt: new Date("2026-10-05"),
        prompt: {
          id: "p-b",
          promptId: "code_b",
          text: "B",
          bucket: "orthography",
        },
      }),
      answerRow({
        id: "newer-a",
        promptId: "p-a",
        createdAt: new Date("2026-10-06"),
        prompt: {
          id: "p-a",
          promptId: "code_a",
          text: "A",
          bucket: "orthography",
        },
      }),
    ]);
    const body = await (await get()).json();
    // p-b's only answer (Oct 5) is now older than p-a's latest (Oct 6).
    expect(body.task.ownAnswer.id).toBe("new-b");
  });

  it("falls to a prompt with no own answer when none has one, ownAnswer null", async () => {
    mockPrisma.prompt.findMany.mockResolvedValue([
      {
        id: "p-9",
        promptId: "code_009",
        text: "Say goodbye.",
        bucket: "orthography",
      },
    ]);
    const body = await (await get()).json();
    expect(body.task.source).toBe("no_answer");
    expect(body.task.ownAnswer).toBeNull();
    expect(body.task.prompt.promptId).toBe("code_009");
  });

  it("ranks the no-answer prompts by coverage: a prompt with no clips first, ties in prompt-code order", async () => {
    const p = (id: string, code: string) => ({
      id,
      promptId: code,
      text: "t",
      bucket: "orthography",
    });
    mockPrisma.prompt.findMany.mockResolvedValue([
      p("p-1", "code_001"),
      p("p-2", "code_002"),
      p("p-3", "code_003"),
    ]);
    // Recorded-by-me lookup (first call) is empty; the pool holds a clip of
    // code_001 and two of code_002, none of code_003.
    mockPrisma.speechRecording.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { promptId: "p-1", annotatorId: "x", dialect: null },
        { promptId: "p-2", annotatorId: "x", dialect: null },
        { promptId: "p-2", annotatorId: "y", dialect: null },
      ]);
    const body = await (await get()).json();
    expect(body.task.prompt.promptId).toBe("code_003");
    const clipsQuery = mockPrisma.speechRecording.findMany.mock.calls[1][0];
    expect(clipsQuery.where).toMatchObject({
      isDemo: false,
      uploadedAt: { not: null },
    });
    expect(clipsQuery.select).toEqual({
      promptId: true,
      annotatorId: true,
      dialect: true,
    });
  });

  it("keeps the prompt-code order when every prompt holds the same number of clips", async () => {
    const p = (id: string, code: string) => ({
      id,
      promptId: code,
      text: "t",
      bucket: "orthography",
    });
    mockPrisma.prompt.findMany.mockResolvedValue([
      p("p-1", "code_001"),
      p("p-2", "code_002"),
    ]);
    const body = await (await get()).json();
    expect(body.task.prompt.promptId).toBe("code_001");
  });

  it("is complete when nothing is left", async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({ complete: true, progress: { recorded: 0 } });
  });

  it("never offers a frozen prompt: both queue queries filter isHoldout and split test", async () => {
    mockPrisma.prompt.findMany.mockResolvedValue([]);
    await get();
    const answersWhere =
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where;
    const promptWhere = mockPrisma.prompt.findMany.mock.calls[0][0].where;
    expect(answersWhere.prompt).toMatchObject({
      isHoldout: false,
      split: { not: "test" },
    });
    expect(promptWhere).toMatchObject({
      isHoldout: false,
      split: { not: "test" },
    });
  });

  it("leaves out of the first step prompts already recorded for real in Igala", async () => {
    mockPrisma.speechRecording.findMany.mockResolvedValue([
      { promptId: "p-1", language: "igala" },
      { promptId: "p-1", language: "igala" },
      { promptId: "p-2", language: "igala" },
      { promptId: "p-2", language: "english" },
    ]);
    const body = await (await get()).json();
    expect(body.progress.recorded).toBe(2);
    // One read of the speaker's own real clips, both languages.
    expect(mockPrisma.speechRecording.findMany.mock.calls[0][0].where).toEqual({
      annotatorId: "r1",
      isDemo: false,
    });
    expect(
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where.prompt.id,
    ).toEqual({
      notIn: ["p-1", "p-2"],
    });
    expect(mockPrisma.prompt.findMany.mock.calls[0][0].where.id).toEqual({
      notIn: ["p-1", "p-2"],
    });
  });

  describe("the English clip is part of finishing a prompt (decision 2, 2026-11-13)", () => {
    /** Own clips: p-1 has both, p-2 has Igala only. */
    const clips = [
      { promptId: "p-1", language: "igala" },
      { promptId: "p-1", language: "english" },
      { promptId: "p-2", language: "igala" },
    ];
    const answersBy = (rows: Record<string, unknown>[]) =>
      mockPrisma.coldAuthorAnswer.findMany.mockImplementation(
        async (args: {
          where: {
            prompt: {
              id: { in?: string[]; notIn?: string[] };
              promptId: { notIn: string[] };
            };
          };
        }) => {
          const { id: ids, promptId: codes } = args.where.prompt;
          return rows.filter(
            (r) =>
              !codes.notIn.includes((r.prompt as { promptId: string }).promptId) &&
              (ids.in
                ? ids.in.includes(r.promptId as string)
                : !ids.notIn?.includes(r.promptId as string)),
          );
        },
      );
    const row = (n: number, over: Record<string, unknown> = {}) =>
      answerRow({
        id: `ans-${n}`,
        promptId: `p-${n}`,
        createdAt: new Date(Date.UTC(2026, 9, n)),
        prompt: {
          id: `p-${n}`,
          promptId: `code_00${n}`,
          text: "Say hello.",
          bucket: "orthography",
        },
        ...over,
      });

    it("a prompt with an Igala clip and no English clip comes back, with the Igala part done", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips);
      answersBy([row(1), row(2)]);
      const body = await (await get()).json();
      expect(body.complete).toBe(false);
      expect(body.task.prompt.promptId).toBe("code_002");
      expect(body.task.igalaDone).toBe(true);
      expect(body.task.source).toBe("own_answer");
      // Asked only about the prompts missing their English clip.
      expect(
        mockPrisma.coldAuthorAnswer.findMany.mock.calls[1][0].where.prompt.id,
      ).toEqual({ in: ["p-2"] });
      // The no-answer step is not consulted while an own answer waits.
      expect(mockPrisma.prompt.findMany).not.toHaveBeenCalled();
    });

    it("a prompt with both clips is done and never comes back", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips.slice(0, 2));
      answersBy([row(1)]);
      const body = await (await get()).json();
      expect(body.complete).toBe(true);
      // Nothing is missing English, so that query is not even made.
      expect(mockPrisma.coldAuthorAnswer.findMany).toHaveBeenCalledTimes(1);
    });

    it("answers with no clip at all are served first, English-missing ones after them", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips);
      answersBy([row(1), row(2), row(3)]);
      const first = await (await get()).json();
      expect(first.task.prompt.promptId).toBe("code_003");
      expect(first.task.igalaDone).toBe(false);
      // Once that one is skipped, the English-missing prompt is next.
      const second = await (await get("?exclude=code_003")).json();
      expect(second.task.prompt.promptId).toBe("code_002");
      expect(second.task.igalaDone).toBe(true);
    });

    it("the English-missing step honours ?exclude and the frozen filter, and never serves a demo answer", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips);
      await get("?exclude=code_002");
      const where = mockPrisma.coldAuthorAnswer.findMany.mock.calls[1][0].where;
      expect(where.annotatorId).toBe("r1");
      expect(where.isDemo).toBe(false);
      expect(where.prompt.promptId).toEqual({ notIn: ["code_002"] });
      expect(where.prompt.isHoldout).toBe(false);
      expect(where.prompt.split).toEqual({ not: "test" });
    });

    it("the answer rides along with its short English translation", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips);
      answersBy([row(2, { englishTranslation: "good morning" })]);
      const body = await (await get()).json();
      expect(body.task.ownAnswer).toEqual({
        id: "ans-2",
        text: "an english stand-in answer",
        englishGloss: "what it means in english",
        englishTranslation: "good morning",
        dialect: null,
      });
      expect(
        mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].select
          .englishTranslation,
      ).toBe(true);
    });

    it("demo mode has no English-missing step: it ignores recording history", async () => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(clips);
      answersBy([row(2)]);
      const body = await (await get("?demo=s1")).json();
      expect(body.task.igalaDone).toBe(false);
      expect(mockPrisma.coldAuthorAnswer.findMany).toHaveBeenCalledTimes(1);
    });
  });

  it("passes ?exclude through to both steps", async () => {
    await get("?exclude=code_x,code_y");
    expect(
      mockPrisma.coldAuthorAnswer.findMany.mock.calls[0][0].where.prompt
        .promptId,
    ).toEqual({
      notIn: ["code_x", "code_y"],
    });
    // The no-answer step asks for the speech set first, then everything
    // else; both honour the exclusions.
    expect(mockPrisma.prompt.findMany.mock.calls[0][0].where.promptId).toEqual(
      {
        startsWith: "ig_v46_sp",
        notIn: ["code_x", "code_y"],
      },
    );
    expect(mockPrisma.prompt.findMany.mock.calls[1][0].where.promptId).toEqual(
      {
        notIn: ["code_x", "code_y"],
      },
    );
  });

  describe("the speech set comes first (prompt bank v4.6, orchestrator 2026-11-13)", () => {
    const row = (
      id: string,
      code: string,
      day: number,
      over: Record<string, unknown> = {},
    ) =>
      answerRow({
        id,
        promptId: `row-${code}`,
        createdAt: new Date(Date.UTC(2026, 9, day)),
        prompt: {
          id: `row-${code}`,
          promptId: code,
          text: "Say hello.",
          bucket: "orthography",
        },
        ...over,
      });
    /** Answers the mock returns, honouring `?exclude` and the id filter. */
    const answersBy = (rows: Record<string, unknown>[]) =>
      mockPrisma.coldAuthorAnswer.findMany.mockImplementation(
        async (args: {
          where: {
            prompt: {
              id: { in?: string[]; notIn?: string[] };
              promptId: { notIn: string[] };
            };
          };
        }) => {
          const { id: ids, promptId: codes } = args.where.prompt;
          return rows.filter(
            (r) =>
              !codes.notIn.includes((r.prompt as { promptId: string }).promptId) &&
              (ids.in
                ? ids.in.includes(r.promptId as string)
                : !ids.notIn?.includes(r.promptId as string)),
          );
        },
      );
    /** Walk the queue as the screen does, skipping each prompt it serves. */
    const walk = async () => {
      const served: { code: string; igalaDone: boolean; source: string }[] = [];
      for (let i = 0; i < 20; i++) {
        const qs = served.length
          ? `?exclude=${served.map((x) => x.code).join(",")}`
          : "";
        const body = await (await get(qs)).json();
        if (body.complete) break;
        served.push({
          code: body.task.prompt.promptId,
          igalaDone: body.task.igalaDone === true,
          source: body.task.source,
        });
      }
      return served;
    };

    it("an answer to a speech-set prompt is served ahead of every older unrecorded answer; English missing stays last", async () => {
      // Own clips: one old prompt has its Igala clip and no English clip.
      mockPrisma.speechRecording.findMany.mockResolvedValue([
        { promptId: "row-code_009", language: "igala" },
      ]);
      answersBy([
        // Three old answers, written long before the speech set existed.
        row("old-1", "code_001", 1),
        row("old-2", "code_002", 2),
        row("old-3", "ig_v45_lex_014", 3),
        // The answer whose English clip is missing (older still).
        row("eng", "code_009", 1),
        // Two speech-set answers, written last.
        row("sp-b", "ig_v46_spvow_003", 21),
        row("sp-a", "ig_v46_spnum_001", 20),
      ]);
      const served = await walk();
      expect(served.map((x) => x.code)).toEqual([
        "ig_v46_spnum_001", // speech set, oldest answer first
        "ig_v46_spvow_003",
        "code_001", // then the older answers, oldest first
        "code_002",
        "ig_v45_lex_014",
        "code_009", // English missing, last
      ]);
      expect(served.map((x) => x.igalaDone)).toEqual([
        false,
        false,
        false,
        false,
        false,
        true,
      ]);
      expect(served.every((x) => x.source === "own_answer")).toBe(true);
    });

    it("the coverage ranking never moves an older answer ahead of the speech set", async () => {
      answersBy([
        row("old-1", "code_001", 1),
        row("sp-a", "ig_v46_spnum_001", 20),
      ]);
      // The pool already holds clips of the speech-set prompt and none of the
      // old one, so ranking the two together would put the old one first.
      mockPrisma.speechRecording.findMany.mockImplementation(
        async (args: { where: { promptId?: unknown } }) =>
          args.where.promptId
            ? [
                { promptId: "row-ig_v46_spnum_001", annotatorId: "x1", dialect: null },
                { promptId: "row-ig_v46_spnum_001", annotatorId: "x2", dialect: null },
              ]
            : [],
      );
      const body = await (await get()).json();
      expect(body.task.prompt.promptId).toBe("ig_v46_spnum_001");
    });

    it("only the speech families count: a v4.6 text prompt that shares the prefix does not jump the queue", async () => {
      answersBy([
        row("old-1", "code_001", 1),
        row("spell", "ig_v46_spell_004", 20),
      ]);
      const body = await (await get()).json();
      expect(body.task.prompt.promptId).toBe("code_001");
    });

    it("with no answer waiting, an unanswered speech-set prompt is offered before any other prompt", async () => {
      mockPrisma.prompt.findMany.mockImplementation(
        async (args: { where: { promptId: { startsWith?: string } } }) =>
          args.where.promptId.startsWith
            ? [
                { id: "p-s", promptId: "ig_v46_spell_001", text: "T", bucket: "orthography" },
                { id: "p-v", promptId: "ig_v46_splong_002", text: "S", bucket: "orthography" },
              ]
            : [{ id: "p-a", promptId: "code_001", text: "A", bucket: "orthography" }],
      );
      const body = await (await get()).json();
      expect(body.task.source).toBe("no_answer");
      expect(body.task.prompt.promptId).toBe("ig_v46_splong_002");
      // Asked on its own, so the general query's 500-row cap cannot hide it.
      expect(mockPrisma.prompt.findMany).toHaveBeenCalledTimes(1);
    });

    it("carries the given English sentence of a speech-set prompt as the suggested translation, and null otherwise", async () => {
      const { V46_PROMPTS, v46SpeechEnglish } = await import(
        "@/lib/prompt-bank-v46"
      );
      const carrier = V46_PROMPTS.find((p) => p.speech?.kind === "carrier")!;
      answersBy([row("sp", carrier.promptId, 20)]);
      const withCarrier = await (await get()).json();
      expect(withCarrier.task.suggestedTranslation).toBe(
        v46SpeechEnglish(carrier.promptId),
      );
      expect(withCarrier.task.suggestedTranslation).toBeTruthy();

      answersBy([row("old", "code_001", 1)]);
      const plain = await (await get()).json();
      expect(plain.task.suggestedTranslation).toBeNull();
    });
  });

  it("demo mode ignores recording history", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([answerRow()]);
    const body = await (await get("?demo=sess-1")).json();
    expect(body.demo).toBe(true);
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
    expect(body.task.source).toBe("own_answer");
  });
});
