import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    prompt: { findMany: vi.fn(), findUnique: vi.fn() },
    speakerProfile: { findUnique: vi.fn() },
    speechComparison: { findMany: vi.fn(), count: vi.fn() },
    speechCandidate: { findFirst: vi.fn() },
    speechMinimalPair: { findUnique: vi.fn() },
    speechCheck: { findMany: vi.fn(), groupBy: vi.fn() },
    speechListenRound: { findMany: vi.fn(), count: vi.fn() },
    answerRevision: { findMany: vi.fn() },
    tonePassAssignment: { findMany: vi.fn() },
    tonePass: { findMany: vi.fn(), count: vi.fn() },
    outputEdit: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as recordNext } from "@/app/api/lab/speech/next/route";
import { GET as listenNext } from "@/app/api/lab/speech/listen/next/route";
import { GET as checkNext } from "@/app/api/lab/speech/check/next/route";
import { toneCount } from "@/lib/tone/tone-pass";
import { needsFix } from "@/lib/answer-revisions";
import {
  FIX_HOME_CAP,
  FIX_HREF,
  WAITING_COPY,
  checkRemaining,
  fixTotal,
  listenRemaining,
  loadWaiting,
  nothingWaiting,
  waitingCards,
  type WaitingCounts,
} from "./waiting";

/**
 * Every number on the Dashboard equals the length of the queue its card
 * opens. This file seeds one fixture, lets each queue route and loadWaiting
 * read it, and asserts two things per card: the count is the queue's length,
 * and the question asked of the database (`where`) is the route's question.
 * If a queue route changes its filter, this fails until the count follows.
 */
const ME = "me";
const original = process.env.SPEECH_LAB_ENABLED;
const d = (day: number) => new Date(Date.UTC(2026, 10, day));

// Stand-in strings only: no Igala text in a public repository.
const clip = (over: Record<string, unknown>) => ({
  id: "c",
  promptId: "p1",
  language: "igala",
  annotatorId: "other",
  modelOutputId: null,
  sourceType: "contributor",
  sourceRef: null,
  createdAt: d(1),
  dialect: null,
  prompt: { promptId: "code_001", text: "Say hello." },
  coldAuthorAnswer: { answerText: "a stand-in answer" },
  ...over,
});
const ownAnswer = (promptId: string, day: number) => ({
  id: `ans-${promptId}-${day}`,
  promptId,
  answerText: "a stand-in answer",
  englishGloss: "what it means",
  englishTranslation: null,
  dialect: null,
  createdAt: d(day),
  prompt: { id: promptId, promptId: `code_${promptId}`, text: "Say it.", bucket: "orthography" },
});

/** The seeded fixture. */
const FIXTURE = {
  // 3 own answers over 2 prompts with no clip of mine, and one answer (p2)
  // with an Igala clip and no English clip: the Record queue holds 3.
  // p1 has both clips, so it is finished.
  ownAnswers: [
    ownAnswer("p1", 1),
    ownAnswer("p2", 1),
    ownAnswer("p7", 1),
    ownAnswer("p7", 2),
    ownAnswer("p8", 3),
  ],
  recorded: [
    { promptId: "p1", language: "igala" },
    { promptId: "p1", language: "english" },
    { promptId: "p2", language: "igala" },
  ],
  // Listen pool: p1 has two human voices (a pair), p2 has a human and a
  // synthetic voice (a pair), p3 has two clips from ONE voice (no pair),
  // p4 has two voices but I judged it already.
  pool: [
    clip({ id: "c1", promptId: "p1", annotatorId: "a" }),
    clip({ id: "c2", promptId: "p1", annotatorId: "b" }),
    clip({ id: "c3", promptId: "p2", annotatorId: "a" }),
    clip({ id: "c4", promptId: "p2", annotatorId: null, sourceType: "derived", sourceRef: "tts-1" }),
    clip({ id: "c5", promptId: "p3", annotatorId: "a" }),
    clip({ id: "c6", promptId: "p3", annotatorId: "a" }),
    clip({ id: "c7", promptId: "p4", annotatorId: "a" }),
    clip({ id: "c8", promptId: "p4", annotatorId: "b" }),
  ],
  judged: [{ promptId: "p4", recordingA: { language: "igala" } }],
  // Check: 3 clips from other speakers, one of them with an empty answer.
  toCheck: [
    clip({ id: "k1" }),
    clip({ id: "k2", promptId: "p2" }),
    clip({ id: "k3", promptId: "p3", coldAuthorAnswer: { answerText: "   " } }),
  ],
  checkedByMe: [{ recordingId: "k0" }],
};

function seed() {
  // speechRecording.findMany serves three different questions; tell them
  // apart by the shape of the question, as the database would.
  mockPrisma.speechRecording.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if ("coldAuthorAnswerId" in where) return FIXTURE.toCheck;
      // The clips of assigned Listen rounds: all playable.
      if (Object.keys(where).join() === "id") {
        return (where.id as { in: string[] }).in.map((id) => ({
          id,
          uploadedAt: d(1),
          reviewStatus: null,
        }));
      }
      if ("uploadedAt" in where && !("promptId" in where)) return FIXTURE.pool;
      if ("promptId" in where) return []; // the coverage ranking of the Record queue
      return FIXTURE.recorded;
    },
  );
  // Own answers, filtered as the database would: by the prompt ids the
  // question names (in / notIn) and the prompt codes it excludes.
  mockPrisma.coldAuthorAnswer.findMany.mockImplementation(
    async ({ where }: { where: { prompt?: { id?: { in?: string[]; notIn?: string[] }; promptId?: { notIn?: string[] } } } }) => {
      const ids = where.prompt?.id;
      const excluded = where.prompt?.promptId?.notIn ?? [];
      return FIXTURE.ownAnswers.filter(
        (a) =>
          (ids?.in ? ids.in.includes(a.promptId) : true) &&
          (ids?.notIn ? !ids.notIn.includes(a.promptId) : true) &&
          !excluded.includes(a.prompt.promptId),
      );
    },
  );
  mockPrisma.prompt.findMany.mockResolvedValue([]);
  mockPrisma.prompt.findUnique.mockResolvedValue(null);
  // No assigned Listen round, no edit, no tone item, unless a test adds one.
  mockPrisma.speechListenRound.findMany.mockResolvedValue([]);
  mockPrisma.speechListenRound.count.mockResolvedValue(0);
  mockPrisma.answerRevision.findMany.mockResolvedValue([]);
  mockPrisma.tonePassAssignment.findMany.mockResolvedValue([]);
  mockPrisma.tonePass.findMany.mockResolvedValue([]);
  mockPrisma.tonePass.count.mockResolvedValue(0);
  mockPrisma.speakerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.speechComparison.findMany.mockResolvedValue(FIXTURE.judged);
  mockPrisma.speechComparison.count.mockResolvedValue(0);
  mockPrisma.speechCandidate.findFirst.mockResolvedValue(null);
  mockPrisma.speechMinimalPair.findUnique.mockResolvedValue(null);
  mockPrisma.speechCheck.findMany.mockResolvedValue(FIXTURE.checkedByMe);
  mockPrisma.speechCheck.groupBy.mockResolvedValue([]);
  mockPrisma.outputEdit.findMany.mockResolvedValue([]);
}

/** The `where` of every call a mock received, as plain JSON for comparing. */
const wheres = (fn: { mock: { calls: unknown[][] } }) =>
  fn.mock.calls.map((c) =>
    JSON.parse(JSON.stringify((c[0] as { where: unknown }).where)),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: ME, role: "RESEARCHER" });
  seed();
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("each count equals the length of the queue its card opens", () => {
  it("Record: own answers with no clip, then answers missing the English clip, one per prompt, as the Record queue serves them", async () => {
    // Walk the Record queue to its end, dismissing what it serves, and count.
    const served: { code: string; igalaDone: boolean }[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await recordNext(
        new Request(
          `http://test/api/lab/speech/next?exclude=${served.map((x) => x.code).join(",")}`,
        ),
      );
      const json = await res.json();
      if (json.complete || json.task.source !== "own_answer") break;
      served.push({
        code: json.task.prompt.promptId,
        igalaDone: !!json.task.igalaDone,
      });
    }
    expect(served).toEqual([
      { code: "code_p7", igalaDone: false },
      { code: "code_p8", igalaDone: false },
      { code: "code_p2", igalaDone: true },
    ]);

    vi.clearAllMocks();
    seed();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.record).toBe(served.length);
    expect(counts.record).toBe(3);
  });

  it("Listen: the queue's own remaining figure, asked as the Listen queue asks", async () => {
    const json = await (await listenNext(new Request("http://test/api/lab/speech/listen/next"))).json();
    const routeClipWhere = wheres(mockPrisma.speechRecording.findMany)[0];
    const routeDoneWhere = wheres(mockPrisma.speechComparison.findMany)[0];

    vi.clearAllMocks();
    seed();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.listen).toBe(json.progress.remaining);
    expect(counts.listen).toBe(2);
    expect(wheres(mockPrisma.speechRecording.findMany)).toContainEqual(routeClipWhere);
    expect(wheres(mockPrisma.speechComparison.findMany)[0]).toEqual(routeDoneWhere);
  });

  it("Check: the queue's own remaining figure, asked as the Check queue asks", async () => {
    const json = await (await checkNext(new Request("http://test/api/lab/speech/check/next"))).json();
    const routeClipWhere = wheres(mockPrisma.speechRecording.findMany)[0];
    const routeMineWhere = wheres(mockPrisma.speechCheck.findMany)[0];
    const routeTake = (mockPrisma.speechRecording.findMany.mock.calls[0][0] as { take: number }).take;

    vi.clearAllMocks();
    seed();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.check).toBe(json.progress.remaining);
    expect(counts.check).toBe(2);
    expect(wheres(mockPrisma.speechRecording.findMany)).toContainEqual(routeClipWhere);
    expect(wheres(mockPrisma.speechCheck.findMany)[0]).toEqual(routeMineWhere);
    const mine = mockPrisma.speechRecording.findMany.mock.calls.find(
      (c) => "coldAuthorAnswerId" in (c[0] as { where: object }).where,
    )![0] as { take: number };
    expect(mine.take).toBe(routeTake);
  });

  it("Listen with assigned rounds: the figure is the open rounds, as the queue serves them first", async () => {
    const round = (n: number) => ({
      id: `r${n}`,
      promptId: "p9",
      language: "igala",
      humanRecordingId: `h${n}`,
      candidateRecordingId: `s${n}`,
      candidateIsA: n % 2 === 0,
      isRepeat: false,
      position: n,
    });
    const withRounds = () => {
      mockPrisma.speechListenRound.findMany.mockImplementation(
        async ({ where }: { where?: object }) =>
          where ? [round(1), round(2), round(3)] : [{ candidateRecordingId: "s1" }],
      );
      mockPrisma.speechListenRound.count.mockResolvedValue(4);
      mockPrisma.prompt.findUnique.mockResolvedValue({
        id: "p9",
        promptId: "code_p9",
        text: "Say it.",
        isHoldout: false,
        split: "train",
      });
    };
    withRounds();
    const json = await (await listenNext(new Request("http://test/api/lab/speech/listen/next"))).json();
    expect(json.progress.remaining).toBe(3);

    vi.clearAllMocks();
    seed();
    withRounds();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.listen).toBe(json.progress.remaining);

    // A round on a frozen prompt is never served: both fall through to the
    // open queue, which leaves the rounds' synthetic clips out.
    vi.clearAllMocks();
    seed();
    withRounds();
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p9", promptId: "code_p9", text: "Say it.", isHoldout: true, split: "test",
    });
    const open = await (await listenNext(new Request("http://test/api/lab/speech/listen/next"))).json();
    const routeClipWhere = wheres(mockPrisma.speechRecording.findMany).find(
      (w) => "uploadedAt" in w,
    );
    expect(routeClipWhere.id).toEqual({ notIn: ["s1"] });
    vi.clearAllMocks();
    seed();
    withRounds();
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p9", promptId: "code_p9", text: "Say it.", isHoldout: true, split: "test",
    });
    const after = await loadWaiting(ME, { speech: true, editing: false });
    expect(after.listen).toBe(open.progress.remaining);
    expect(after.listen).toBe(2);
    expect(wheres(mockPrisma.speechRecording.findMany)).toContainEqual(routeClipWhere);
  });

  it("Check leaves out a clip whose answer was edited after it was recorded, as the queue does", async () => {
    const edited = () =>
      mockPrisma.answerRevision.findMany.mockResolvedValue([
        {
          targetId: "ans-k2",
          field: "answerText",
          before: "a stand-in answer",
          after: "a changed answer",
          createdAt: d(5),
        },
      ]);
    const withAnswerIds = () =>
      mockPrisma.speechRecording.findMany.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) =>
          "coldAuthorAnswerId" in where
            ? FIXTURE.toCheck.map((c) => ({ ...c, coldAuthorAnswerId: `ans-${c.id}` }))
            : [],
      );
    withAnswerIds();
    edited();
    const json = await (await checkNext(new Request("http://test/api/lab/speech/check/next"))).json();
    expect(json.progress.remaining).toBe(1);

    vi.clearAllMocks();
    seed();
    withAnswerIds();
    edited();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.check).toBe(json.progress.remaining);
  });

  it("Tone: the items given to this person and not yet marked, as the tone queue counts them; none given, none shown", async () => {
    // Nobody was given anything: zero, and no card.
    const none = await loadWaiting(ME, { speech: false, editing: false });
    expect(none.tone).toBe(0);
    expect(waitingCards({ annotate: 0, ...none }).map((c) => c.key)).toEqual(["annotate"]);

    // Three items given, one already marked: two wait.
    const given = () => {
      mockPrisma.tonePassAssignment.findMany.mockResolvedValue([
        { itemId: "t1" }, { itemId: "t2" }, { itemId: "t3" },
      ]);
      mockPrisma.tonePass.findMany.mockResolvedValue([{ itemId: "t2" }]);
      mockPrisma.tonePass.count.mockResolvedValue(1);
    };
    given();
    const queue = await toneCount(ME);
    expect(queue).toEqual({ waiting: 2, done: 1 });
    const counts = await loadWaiting(ME, { speech: false, editing: false });
    expect(counts.tone).toBe(queue.waiting);
    const card = waitingCards({ annotate: 0, ...counts }).find((c) => c.key === "tone")!;
    expect(card).toMatchObject({ title: "Pass 2: tone marks", value: 2, href: "/annotator/tone" });
    expect(wheres(mockPrisma.tonePassAssignment.findMany)[0]).toEqual({
      annotatorId: ME,
      skippedAt: null,
    });

    // Before the tone tables exist the count is zero and nothing breaks.
    mockPrisma.tonePassAssignment.findMany.mockRejectedValue(
      Object.assign(new Error("no table"), { code: "P2021" }),
    );
    expect((await loadWaiting(ME, { speech: false, editing: false })).tone).toBe(0);
  });

  it("with speech off for the account nothing about speech is asked or counted", async () => {
    const counts = await loadWaiting(ME, { speech: false, editing: false });
    expect(counts).toEqual({ record: 0, listen: 0, check: 0, tone: 0, fix: 0, fixTotal: 0 });
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechComparison.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechCheck.findMany).not.toHaveBeenCalled();
  });
});

describe("the counting rules", () => {
  it("Listen needs two different voices and skips what was judged, per language", () => {
    expect(listenRemaining(FIXTURE.pool, FIXTURE.judged)).toBe(2);
    expect(listenRemaining(FIXTURE.pool, [])).toBe(3);
    // The English clips of a prompt are their own pair.
    const english = [
      clip({ id: "e1", promptId: "p4", language: "english", annotatorId: "a" }),
      clip({ id: "e2", promptId: "p4", language: "english", annotatorId: "b" }),
    ];
    expect(listenRemaining([...FIXTURE.pool, ...english], FIXTURE.judged)).toBe(3);
  });

  it("Check leaves out a clip whose answer has no text, and a clip whose text changed", () => {
    expect(checkRemaining(FIXTURE.toCheck)).toBe(2);
    expect(checkRemaining(FIXTURE.toCheck, new Set(["k1"]))).toBe(1);
  });
});

describe("your answers to fix", () => {
  const answers = [
    { englishGloss: null },
    { englishGloss: "   " },
    { englishGloss: "It is a greeting." },
  ];
  const corrections = [
    { rationale: null },
    { rationale: "too short" },
    { rationale: "The verb was in the wrong tense for this sentence." },
  ];

  it("counts an answer with no meaning, and a correction with no reason or one under 20 characters", () => {
    expect(fixTotal(answers, corrections)).toBe(4);
    expect(fixTotal([], [{ rationale: "x".repeat(19) }, { rationale: "x".repeat(20) }])).toBe(1);
  });

  it("is the rule My Work's filter uses, row by row", () => {
    const viaFilter =
      answers.filter((a) => needsFix({ kind: "cold", ...a })).length +
      corrections.filter((c) => needsFix({ kind: "edit", ...c })).length;
    expect(fixTotal(answers, corrections)).toBe(viaFilter);
  });

  it("stays at zero until authors can edit their own answers", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(answers);
    mockPrisma.outputEdit.findMany.mockResolvedValue(corrections);
    expect((await loadWaiting(ME, { speech: false, editing: false })).fix).toBe(0);
    const on = await loadWaiting(ME, { speech: false, editing: true });
    expect(on.fix).toBe(4);
    expect(on.fixTotal).toBe(4);
  });

  it("the Dashboard never opens to hundreds: the card stops at the cap and says so", async () => {
    mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(
      Array.from({ length: 135 }, () => ({ englishGloss: null })),
    );
    const counts = await loadWaiting(ME, { speech: false, editing: true });
    expect(counts.fix).toBe(FIX_HOME_CAP);
    expect(counts.fixTotal).toBe(135);
    const card = waitingCards({ annotate: 0, ...counts }).find(
      (c) => c.key === "fix",
    )!;
    expect(card.value).toBe(20);
    expect(card.line).toBe(WAITING_COPY.fixCapped);
    expect(card.href).toBe(FIX_HREF);
  });
});

describe("the cards", () => {
  const zero: WaitingCounts = {
    annotate: 0, record: 0, listen: 0, check: 0, tone: 0, fix: 0, fixTotal: 0,
  };

  it("with everything at zero only Annotate shows, at 0, and the page says nothing is waiting", () => {
    const cards = waitingCards(zero);
    expect(cards.map((c) => [c.key, c.value])).toEqual([["annotate", 0]]);
    expect(nothingWaiting(zero)).toBe(true);
    expect(nothingWaiting({ ...zero, listen: 1 })).toBe(false);
  });

  it("a card shows only when its number is above zero, in the order of the spec, with its exact words", () => {
    const cards = waitingCards(
      { annotate: 12, record: 310, listen: 20, check: 4, tone: 30, fix: 17, fixTotal: 17 },
    );
    expect(cards.map((c) => [c.title, c.value, c.line])).toEqual([
      ["Annotate", 12, "Prompts to answer and compare"],
      ["Record your answers", 310, "Answers you wrote that have no clip"],
      ["Listen", 20, "Pairs of clips to compare"],
      ["Check", 4, "Clips from other speakers to check"],
      ["Pass 2: tone marks", 30, "Answers that need tone marks"],
      ["Your answers to fix", 17, "Missing a meaning or a reason"],
    ]);
    expect(waitingCards({ ...zero, annotate: 3, check: 2 }).map((c) => c.key)).toEqual([
      "annotate",
      "check",
    ]);
  });

  it("each card opens its queue: Record and Listen are tabs of the one Speech link, for every role", () => {
    const counts = { ...zero, annotate: 1, record: 1, listen: 1, check: 1, tone: 1, fix: 1, fixTotal: 1 };
    expect(Object.fromEntries(waitingCards(counts).map((c) => [c.key, c.href]))).toEqual({
      annotate: "/annotator/annotate",
      record: "/speak",
      listen: "/speak/listen",
      check: "/speak/check",
      tone: "/annotator/tone",
      fix: "/annotator/history?filter=fix",
    });
  });
});
