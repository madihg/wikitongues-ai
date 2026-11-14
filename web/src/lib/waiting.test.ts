import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    coldAuthorAnswer: { findMany: vi.fn() },
    prompt: { findMany: vi.fn() },
    speakerProfile: { findUnique: vi.fn() },
    speechComparison: { findMany: vi.fn(), count: vi.fn() },
    speechCandidate: { findFirst: vi.fn() },
    speechMinimalPair: { findUnique: vi.fn() },
    speechCheck: { findMany: vi.fn(), groupBy: vi.fn() },
    outputEdit: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as recordNext } from "@/app/api/lab/speech/next/route";
import { GET as listenNext } from "@/app/api/lab/speech/listen/next/route";
import { GET as checkNext } from "@/app/api/lab/speech/check/next/route";
import {
  FIX_HOME_CAP,
  FIX_HREF,
  WAITING_COPY,
  checkRemaining,
  fixTotal,
  listenRemaining,
  loadWaiting,
  nothingWaiting,
  recordRemaining,
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
  dialect: null,
  createdAt: d(day),
  prompt: { id: promptId, promptId: `code_${promptId}`, text: "Say it.", bucket: "orthography" },
});

/** The seeded fixture. */
const FIXTURE = {
  // 3 own answers over 2 prompts with no clip of mine: the Record queue holds 2.
  ownAnswers: [ownAnswer("p7", 1), ownAnswer("p7", 2), ownAnswer("p8", 3)],
  recorded: [{ promptId: "p1" }, { promptId: "p1" }, { promptId: "p2" }],
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
      if ("uploadedAt" in where && !("promptId" in where)) return FIXTURE.pool;
      if ("promptId" in where) return []; // the coverage ranking of the Record queue
      return FIXTURE.recorded;
    },
  );
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(FIXTURE.ownAnswers);
  mockPrisma.prompt.findMany.mockResolvedValue([]);
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
  it("Record: own answers with no clip, one per prompt, asked as the Record queue asks", async () => {
    // Walk the Record queue to its end, dismissing what it serves, and count.
    const served: string[] = [];
    for (let i = 0; i < 10; i++) {
      mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue(
        FIXTURE.ownAnswers.filter((a) => !served.includes(a.prompt.promptId)),
      );
      const res = await recordNext(
        new Request(`http://test/api/lab/speech/next?exclude=${served.join(",")}`),
      );
      const json = await res.json();
      if (json.complete || json.task.source !== "own_answer") break;
      served.push(json.task.prompt.promptId);
    }
    const routeAnswerWhere = wheres(mockPrisma.coldAuthorAnswer.findMany)[0];
    const routeRecordedWhere = wheres(mockPrisma.speechRecording.findMany)[0];

    vi.clearAllMocks();
    seed();
    const counts = await loadWaiting(ME, { speech: true, editing: false });
    expect(counts.record).toBe(served.length);
    expect(counts.record).toBe(2);
    expect(wheres(mockPrisma.coldAuthorAnswer.findMany)[0]).toEqual(routeAnswerWhere);
    expect(wheres(mockPrisma.speechRecording.findMany)).toContainEqual(routeRecordedWhere);
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

  it("with speech off for the account nothing about speech is asked or counted", async () => {
    const counts = await loadWaiting(ME, { speech: false, editing: false });
    expect(counts).toEqual({ record: 0, listen: 0, check: 0, tone: 0, fix: 0, fixTotal: 0 });
    expect(mockPrisma.speechRecording.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechComparison.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechCheck.findMany).not.toHaveBeenCalled();
  });
});

describe("the counting rules", () => {
  it("Record counts prompts, not answers", () => {
    expect(recordRemaining([{ promptId: "a" }, { promptId: "a" }, { promptId: "b" }])).toBe(2);
  });

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

  it("Check leaves out a clip whose answer has no text", () => {
    expect(checkRemaining(FIXTURE.toCheck)).toBe(2);
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
    const card = waitingCards({ annotate: 0, ...counts }, { researcher: false }).find(
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
    const cards = waitingCards(zero, { researcher: false });
    expect(cards.map((c) => [c.key, c.value])).toEqual([["annotate", 0]]);
    expect(nothingWaiting(zero)).toBe(true);
    expect(nothingWaiting({ ...zero, listen: 1 })).toBe(false);
  });

  it("a card shows only when its number is above zero, in the order of the spec, with its exact words", () => {
    const cards = waitingCards(
      { annotate: 12, record: 310, listen: 20, check: 4, tone: 30, fix: 17, fixTotal: 17 },
      { researcher: false },
    );
    expect(cards.map((c) => [c.title, c.value, c.line])).toEqual([
      ["Annotate", 12, "Prompts to answer and compare"],
      ["Record your answers", 310, "Answers you wrote that have no clip"],
      ["Listen", 20, "Pairs of clips to compare"],
      ["Check", 4, "Clips from other speakers to check"],
      ["Pass 2: tone marks", 30, "Answers that need tone marks"],
      ["Your answers to fix", 17, "Missing a meaning or a reason"],
    ]);
    expect(waitingCards({ ...zero, annotate: 3, check: 2 }, { researcher: false }).map((c) => c.key)).toEqual([
      "annotate",
      "check",
    ]);
  });

  it("each card opens its queue: annotators through /speak, researchers through the Lab paths they know", () => {
    const counts = { ...zero, annotate: 1, record: 1, listen: 1, check: 1 };
    const href = (researcher: boolean) =>
      Object.fromEntries(waitingCards(counts, { researcher }).map((c) => [c.key, c.href]));
    expect(href(false)).toEqual({
      annotate: "/annotator/annotate",
      record: "/speak",
      listen: "/speak/listen",
      check: "/speak/check",
    });
    expect(href(true)).toEqual({
      annotate: "/annotator/annotate",
      record: "/lab/speech",
      listen: "/lab/speech/listen",
      check: "/speak/check",
    });
  });
});
