import { describe, it, expect } from "vitest";
import {
  LOW_PROMPTS,
  benchmarkLeader,
  formatHolding,
  holdings,
  needsYou,
  recentlyActive,
  runningLow,
  submissionsOf,
  weekRows,
  weekTotals,
  type NeedsYouInput,
  type PersonWeek,
} from "./today";
import { assemblePeople, type PeopleRaw } from "./people-data";
import { computeQueueState, type QueuePrompt } from "@/lib/pairing";
import type { CandidateScore } from "@/lib/method-metrics";

const NOW = new Date("2026-11-13T15:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const person = (over: Partial<PersonWeek> = {}): PersonWeek => ({
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
  lastActiveAt: daysAgo(1),
  ...over,
});

const quiet: NeedsYouInput = {
  now: NOW,
  people: [person()],
  flags: { open: 0, oldestAt: null },
  uncheckedClips: 0,
  alerts: [],
  spend: { monthUsd: 0, capUsd: 200 },
};
const keys = (input: Partial<NeedsYouInput>) =>
  needsYou({ ...quiet, ...input }).map((l) => l.key);

describe("needsYou: a line appears only above its threshold", () => {
  it("is empty when nothing needs anyone, so the block is not drawn", () => {
    expect(needsYou(quiet)).toEqual([]);
  });

  it("prompts running low: from one person under 20, counting only the working team", () => {
    expect(keys({ people: [person({ promptsLeft: LOW_PROMPTS })] })).toEqual(
      [],
    );
    const lines = needsYou({
      ...quiet,
      people: [
        person({ id: "a", promptsLeft: 19 }),
        person({ id: "b", promptsLeft: 0 }),
        // Nothing on record for 40 days: not part of the working team.
        person({ id: "c", promptsLeft: 0, lastActiveAt: daysAgo(40) }),
        // Never worked at all.
        person({ id: "d", promptsLeft: 0, lastActiveAt: null }),
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      key: "low-prompts",
      text: "2 annotators have fewer than 20 prompts left.",
      href: "/admin/people",
    });
    expect(
      needsYou({ ...quiet, people: [person({ promptsLeft: 3 })] })[0].text,
    ).toBe("1 annotator has fewer than 20 prompts left.");
  });

  it("prompt flags: from one open flag, with the age of the oldest", () => {
    expect(keys({ flags: { open: 0, oldestAt: daysAgo(9) } })).toEqual([]);
    expect(
      needsYou({ ...quiet, flags: { open: 39, oldestAt: daysAgo(112) } })[0],
    ).toMatchObject({
      text: "39 prompt flags are open. The oldest is 112 days old.",
      href: "/admin/data/prompts",
    });
    expect(
      needsYou({ ...quiet, flags: { open: 1, oldestAt: daysAgo(1) } })[0].text,
    ).toBe("1 prompt flag is open. The oldest is 1 day old.");
  });

  it("unchecked clips: from 20, and never when speech is off", () => {
    expect(keys({ uncheckedClips: 19 })).toEqual([]);
    expect(keys({ uncheckedClips: null })).toEqual([]);
    expect(needsYou({ ...quiet, uncheckedClips: 131 })[0]).toMatchObject({
      text: "131 clips have not been checked.",
      href: "/admin/data/clips",
    });
  });

  it("speech alerts: each unread one, in its own words", () => {
    const lines = needsYou({
      ...quiet,
      alerts: [
        {
          id: "x",
          message: "Last night's speech run stopped at the scoring step.",
        },
      ],
    });
    expect(lines[0]).toMatchObject({
      key: "alert-x",
      text: "Last night's speech run stopped at the scoring step.",
      href: "/admin/speech/loop",
    });
  });

  it("spend: from 80% of the cap", () => {
    expect(keys({ spend: { monthUsd: 159, capUsd: 200 } })).toEqual([]);
    expect(
      needsYou({ ...quiet, spend: { monthUsd: 164, capUsd: 200 } })[0].text,
    ).toBe("Speech training spend this month is at 82% of the cap.");
    expect(keys({ spend: null })).toEqual([]);
    expect(keys({ spend: { monthUsd: 10, capUsd: 0 } })).toEqual([]);
  });

  it("a quiet person: worked in the last 30 days, nothing for 7", () => {
    expect(keys({ people: [person({ lastActiveAt: daysAgo(6) })] })).toEqual(
      [],
    );
    expect(
      needsYou({
        ...quiet,
        people: [person({ name: "Ada", lastActiveAt: daysAgo(9) })],
      })[0].text,
    ).toBe("Ada has recorded no work for 9 days.");
    expect(keys({ people: [person({ lastActiveAt: daysAgo(31) })] })).toEqual(
      [],
    );
  });

  it("says nothing about corrections waiting for a second reader: nobody is named to read them", () => {
    const all = needsYou({
      ...quiet,
      people: [person({ promptsLeft: 1, lastActiveAt: daysAgo(10) })],
      flags: { open: 3, oldestAt: daysAgo(2) },
      uncheckedClips: 50,
      alerts: [{ id: "x", message: "The run stopped." }],
      spend: { monthUsd: 199, capUsd: 200 },
    });
    expect(all.map((l) => l.key)).toEqual([
      "low-prompts",
      "flags",
      "unchecked-clips",
      "alert-x",
      "spend",
      "quiet-u1",
    ]);
    expect(all.some((l) => /correction/i.test(l.text))).toBe(false);
    for (const l of all) {
      expect(l.text.endsWith(".")).toBe(true);
      expect(l.linkLabel.split(" ").length).toBeLessThanOrEqual(3);
    }
  });
});

describe("the week's rows, shared by Today and People", () => {
  const people = [
    person({ id: "a", name: "Zed", comparisons: 10, answers: 5 }),
    person({ id: "b", name: "Ada", clips: 93, clipMinutes: 11.2, edits: 31 }),
    person({ id: "c", name: "Idle" }),
    person({ id: "d", name: "Bea", listenRounds: 2, checks: 1 }),
  ];

  it("lists only people who worked in the week, busiest first", () => {
    expect(weekRows(people).map((p) => p.name)).toEqual(["Ada", "Zed", "Bea"]);
  });

  it("totals are the sum of the rows on screen", () => {
    const t = weekTotals(weekRows(people));
    expect(t).toEqual({
      people: 3,
      submissions: 15,
      edits: 31,
      clips: 93,
      clipMinutes: 11.2,
      listenAndCheck: 3,
    });
  });

  it("submissions are comparisons plus own answers", () => {
    expect(submissionsOf(people[0])).toBe(15);
  });

  it("running low is under 20, and the working team is the last 30 days", () => {
    expect(runningLow(person({ promptsLeft: 19 }))).toBe(true);
    expect(runningLow(person({ promptsLeft: 20 }))).toBe(false);
    expect(
      recentlyActive(
        [
          person({ lastActiveAt: daysAgo(29) }),
          person({ lastActiveAt: daysAgo(30) }),
        ],
        NOW,
      ),
    ).toHaveLength(1);
  });
});

describe("assemblePeople: prompts left is what Annotate would serve", () => {
  const prompt = (
    id: string,
    over: Partial<QueuePrompt> = {},
  ): QueuePrompt => ({
    promptId: id,
    outputCount: 2,
    ...over,
  });
  const queuePrompts = [
    prompt("p1"),
    prompt("p2"),
    prompt("p3"),
    prompt("p4", { outputCount: 1 }), // not pairable: one output
    prompt("p5", { isHoldout: true } as Partial<QueuePrompt>),
  ];
  const at = new Date("2026-11-12T10:00:00Z");
  const raw: PeopleRaw = {
    users: [
      { id: "ada", name: "Ada", email: "ada@example.org", role: "ANNOTATOR" },
      { id: "bea", name: null, email: "bea@example.org", role: "RESEARCHER" },
      { id: "seed", name: "Seed", email: "seed@test.com", role: "ANNOTATOR" },
      { id: "new", name: "New", email: "new@example.org", role: "ANNOTATOR" },
    ],
    inWeek: {
      comparisons: [{ id: "ada", n: 2, last: at }],
      answers: [{ id: "ada", n: 1, last: at }],
      edits: [],
      clips: [{ id: "bea", n: 3, ms: 90_000, last: at }],
      listenRounds: [],
      checks: [{ id: "bea", n: 4, last: at }],
    },
    lastEver: [
      { id: "ada", n: 9, last: new Date("2026-11-01T00:00:00Z") },
      { id: "ada", n: 2, last: at },
      { id: "bea", n: 3, last: at },
      { id: "seed", n: 50, last: at },
      { id: null, n: 1, last: at },
    ],
    queuePrompts,
    done: [
      { annotatorId: "ada", promptId: "p1" },
      { annotatorId: "ada", promptId: "p1" },
    ],
    skipped: [{ annotatorId: "ada", promptId: "p2" }],
  };

  it("leaves out seed accounts and people with nothing on record", () => {
    expect(assemblePeople(raw).map((p) => p.id)).toEqual(["ada", "bea"]);
  });

  it("counts the week, and takes the last save across every kind of work", () => {
    const [ada, bea] = assemblePeople(raw);
    expect(ada).toMatchObject({
      comparisons: 2,
      answers: 1,
      edits: 0,
      clips: 0,
      lastActiveAt: at.toISOString(),
    });
    expect(bea).toMatchObject({
      name: "bea@example.org",
      clips: 3,
      clipMinutes: 1.5,
      checks: 4,
    });
  });

  it("prompts left equals the queue function's own answer for that person", () => {
    const [ada, bea] = assemblePeople(raw);
    const own = (done: string[], skipped: string[]) =>
      computeQueueState(queuePrompts, new Set(done), new Set(skipped)).remaining
        .length;
    expect(ada.promptsLeft).toBe(own(["p1"], ["p2"]));
    expect(ada.promptsLeft).toBe(1);
    expect(bea.promptsLeft).toBe(own([], []));
    expect(bea.promptsLeft).toBe(3);
  });
});

describe("benchmarkLeader: the agreement tile names the bar the Benchmark tab highlights", () => {
  const c = (name: string, agreementScore: number | null) =>
    ({ name, approach: "retrieval v4.5", agreementScore }) as CandidateScore;

  it("is the first scoreable row, in the order the metrics module sorted them", () => {
    expect(
      benchmarkLeader([
        c("unscored", null),
        c("Gemini + method", 118.4),
        c("Bare", 61),
      ]),
    ).toEqual({
      name: "Gemini + method",
      approach: "retrieval v4.5",
      score: 118.4,
    });
  });

  it("is null when nothing can be scored yet", () => {
    expect(benchmarkLeader([])).toBeNull();
    expect(benchmarkLeader([c("x", null)])).toBeNull();
  });
});

describe("holdings: what we hold, and what the week added", () => {
  it("lists answers, comparisons, corrections, and speech only when speech is on", () => {
    const base = {
      answers: { total: 1996, inWeek: 41 },
      comparisons: { total: 2183, inWeek: 60 },
      corrections: { total: 463, inWeek: 12 },
    };
    expect(holdings({ ...base, speechMs: null }).map((h) => h.key)).toEqual([
      "answers",
      "comparisons",
      "corrections",
    ]);
    const all = holdings({
      ...base,
      speechMs: { total: 972_000, inWeek: 660_000 },
    });
    expect(all.map((h) => formatHolding(h))).toEqual([
      { total: "1,996", inWeek: "+41" },
      { total: "2,183", inWeek: "+60" },
      { total: "463", inWeek: "+12" },
      { total: "16.2", inWeek: "+11" },
    ]);
  });
});
