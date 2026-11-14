import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { insights, metrics, measure } = vi.hoisted(() => ({
  insights: vi.fn(),
  metrics: vi.fn(),
  measure: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/annotation-insights", () => ({
  computeAnnotationInsights: insights,
}));
vi.mock("@/lib/method-metrics", () => ({ computeMethodMetrics: metrics }));
vi.mock("@/lib/admin/measure/data", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/measure/data")>()),
  loadSpeechMeasure: measure,
}));

import {
  HoldingsBlock,
  ModelsBlock,
  NeedsYouBlock,
  WeekWorkBlock,
} from "./today-sections";
import { BenchmarkBars } from "@/components/arena/benchmark-bars";
import type { CandidateScore } from "@/lib/method-metrics";
import type { TodayWork } from "@/lib/admin/today-data";
import {
  weekRows,
  weekTotals,
  holdings,
  type PersonWeek,
} from "@/lib/admin/today";

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const person = (over: Partial<PersonWeek>): PersonWeek => ({
  id: "u1",
  name: "Ada",
  role: "ANNOTATOR",
  comparisons: 0,
  answers: 0,
  edits: 0,
  clips: 0,
  clipMinutes: 0,
  listenRounds: 0,
  checks: 0,
  promptsLeft: 100,
  lastActiveAt: "2026-11-12T10:00:00.000Z",
  ...over,
});

const people = [
  person({
    id: "a",
    name: "Ada",
    comparisons: 40,
    answers: 24,
    edits: 8,
    promptsLeft: 14,
  }),
  person({
    id: "b",
    name: "Bea",
    clips: 93,
    clipMinutes: 11.2,
    edits: 31,
    promptsLeft: 0,
  }),
  person({ id: "c", name: "Cy" }),
];
const rows = weekRows(people);
const work = (over: Partial<TodayWork> = {}): Promise<TodayWork> =>
  Promise.resolve({
    people,
    rows,
    totals: weekTotals(rows),
    needs: [],
    holdings: holdings({
      answers: { total: 1996, inWeek: 41 },
      comparisons: { total: 2183, inWeek: 60 },
      corrections: { total: 463, inWeek: 12 },
      speechMs: { total: 972_000, inWeek: 660_000 },
    }),
    ...over,
  });

const candidate = (
  name: string,
  agreementScore: number | null,
): CandidateScore =>
  ({
    name,
    approach: "retrieval v4.5",
    n: 25,
    nClean: 25,
    nLikeForLike: 25,
    emptyOutputs: 0,
    strippedChrfAll: 30,
    strippedChrfClean: 30,
    agreementScore,
    agreementCiLow: agreementScore === null ? null : agreementScore - 5,
    agreementCiHigh: agreementScore === null ? null : agreementScore + 5,
    agreementUnderpowered: false,
  }) as CandidateScore;

const HEADLINE = {
  poolComparisons: 191,
  poolDecided: 73,
  poolTies: 4,
  poolBothInadequate: 114,
  leaderName: "Gemini + method",
  leaderWins: 51,
  leaderCommunityTaught: true,
  runnerUpName: "Bare Gemini",
  runnerUpWins: 22,
  otherWins: 0,
  otherArms: 0,
};
const CANDIDATES = [
  candidate("Gemini + method", 118.4),
  candidate("Bare Gemini", 61.2),
];
const EMPTY_MEASURE = {
  held: {
    clips: 131,
    minutes: 16.2,
    speakers: 2,
    examClips: 0,
    examSpeakers: 0,
    unchecked: 131,
  },
  evals: [],
  versions: [],
  levels: {
    clips: 131,
    medianPeakDbfs: -26,
    medianSpeechDbfs: -40,
    clippedClips: 0,
  },
  listen: [],
  checks: [],
  toneAnswers: [],
  auto: [],
  autoTableReady: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  insights.mockResolvedValue({ headline: HEADLINE });
  metrics.mockResolvedValue({ candidates: CANDIDATES });
  measure.mockResolvedValue(EMPTY_MEASURE);
});

describe("Needs you", () => {
  it("is absent when no line qualifies", async () => {
    expect(renderToStaticMarkup(await NeedsYouBlock({ work: work() }))).toBe(
      "",
    );
  });

  it("shows each line with its link", async () => {
    const html = renderToStaticMarkup(
      await NeedsYouBlock({
        work: work({
          needs: [
            {
              key: "flags",
              text: "39 prompt flags are open. The oldest is 112 days old.",
              href: "/admin/data/prompts",
              linkLabel: "See prompts",
            },
          ],
        }),
      }),
    );
    expect(text(html)).toContain("Needs you");
    expect(text(html)).toContain(
      "39 prompt flags are open. The oldest is 112 days old.",
    );
    expect(html).toContain('href="/admin/data/prompts"');
  });
});

describe("The models", () => {
  it("makes one call to each computation, and none from the browser", async () => {
    await ModelsBlock({ speech: true });
    expect(insights).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("does not read the speech tables when speech is off, and says so", async () => {
    const html = renderToStaticMarkup(await ModelsBlock({ speech: false }));
    expect(measure).not.toHaveBeenCalled();
    expect(text(html)).toContain("Speech is switched off on this server.");
    expect(html).not.toContain('href="/admin/speech"');
  });

  it("the agreement tile shows the number the Benchmark tab highlights", async () => {
    const tile = text(
      renderToStaticMarkup(await ModelsBlock({ speech: true })),
    );
    const bars = renderToStaticMarkup(
      <BenchmarkBars
        candidates={CANDIDATES}
        ceilingChrf={34.3}
        leakFreePrompts={25}
      />,
    );
    // The bar chart names its best model and prints its score; the tile shows both.
    expect(bars).toContain("Gemini + method 118.4");
    expect(tile).toContain("118.4");
    expect(tile).toContain("Gemini + method, the best of the models examined.");
    expect(tile).toContain("100 is one speaker agreeing with another.");
  });

  it("the verdict tile is the Verdict tab's own headline card", async () => {
    const tile = text(
      renderToStaticMarkup(await ModelsBlock({ speech: true })),
    );
    expect(tile).toContain("191");
    expect(tile).toContain("51");
    expect(tile).toContain("73");
  });

  it("before any speech model is scored, the speech tile says so and still counts the clips", async () => {
    const tile = text(
      renderToStaticMarkup(await ModelsBlock({ speech: true })),
    );
    expect(tile).toContain("No speech model has been scored yet.");
    expect(tile).toContain(
      "No listener has compared a model with a person yet.",
    );
    expect(tile).toContain("We hold 131 clips, 16.2 minutes.");
  });

  it("a score run on clips that are not a locked exam is never called an exam on the tile", async () => {
    measure.mockResolvedValue({
      ...EMPTY_MEASURE,
      evals: [
        {
          id: "e1",
          modelRef: "recogniser",
          manifestVersion: "m",
          cer: 0.351,
          werStripped: 0.9,
          werRetained: 0.94,
          ter: 0.2,
          nClips: 72,
          speakers: 2,
          terPooled: 1,
          markedVowels: 365,
          onLockedExam: false,
          createdAt: "2026-11-13T22:00:00.000Z",
        },
      ],
    });
    const tile = text(
      renderToStaticMarkup(await ModelsBlock({ speech: true })),
    );
    expect(tile).toContain("35.1 of 100 letters wrong");
    expect(tile).toContain("72 clips, not a locked exam. Sample: Smoke test.");
    expect(tile).not.toContain("exam clips");
  });

  it("links each tile to its view", async () => {
    const html = renderToStaticMarkup(await ModelsBlock({ speech: true }));
    for (const href of [
      "/admin/arena/verdict",
      "/admin/arena/eval",
      "/admin/speech",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});

describe("This week's work", () => {
  it("lists who worked, with the Running low badge under 20 prompts", async () => {
    const html = renderToStaticMarkup(
      await WeekWorkBlock({ work: work(), speech: true, thisWeek: true }),
    );
    const t = text(html);
    expect(t).toContain("This week's work");
    expect(t).toContain("Ada");
    expect(t).toContain("Bea");
    expect(t).not.toContain("Cy");
    expect(t.match(/Running low/g)).toHaveLength(2);
    expect(t).toContain("93 (11.2 min)");
    expect(t).toContain("Total, 2 people");
    expect(html).toContain('href="/admin/annotations?annotator=a"');
    expect(html).toContain('href="/admin/people"');
  });

  it("hides the speech columns when speech is off", async () => {
    const t = text(
      renderToStaticMarkup(
        await WeekWorkBlock({ work: work(), speech: false, thisWeek: true }),
      ),
    );
    expect(t).not.toContain("Recordings");
    expect(t).not.toContain("Listen and Check");
  });

  it("an empty week says so", async () => {
    const html = renderToStaticMarkup(
      await WeekWorkBlock({
        work: work({ rows: [], totals: weekTotals([]) }),
        speech: true,
        thisWeek: true,
      }),
    );
    expect(text(html)).toContain("No work recorded this week.");
  });
});

describe("What we hold", () => {
  it("prints each total with what the week added", async () => {
    const t = text(
      renderToStaticMarkup(
        await HoldingsBlock({ work: work(), thisWeek: true }),
      ),
    );
    expect(t).toContain("1,996 +41 this week answers written");
    expect(t).toContain("2,183 +60 this week comparisons");
    expect(t).toContain("16.2 +11 this week minutes of speech recorded");
  });
});
