import { describe, it, expect } from "vitest";
import {
  axisTable,
  checkTable,
  humanHalf,
  listenerAgreement,
  preference,
  roundsAgainstHuman,
  systemsAgainstHuman,
  tonePairs,
  type CheckRow,
  type ListenRow,
} from "./human";

const MODEL = "tts-2026-11-20";
const OTHER = "tts-2026-11-27";

let seq = 0;
/** One Listen judgment. The model plays on side A unless `modelSide` says B. */
function row(
  over: Partial<ListenRow> & { modelSide?: "a" | "b"; model?: string } = {},
): ListenRow {
  const { modelSide = "a", model = MODEL, ...rest } = over;
  seq++;
  return {
    id: `c${seq}`,
    promptId: `p${seq}`,
    annotatorId: "listener1",
    recordingAId: `ra${seq}`,
    recordingBId: `rb${seq}`,
    a: modelSide === "a" ? model : "human",
    b: modelSide === "a" ? "human" : model,
    winner: "a",
    axes: null,
    isDemo: false,
    createdAt: new Date(Date.UTC(2026, 10, 20, 9, seq % 60)).toISOString(),
    ...rest,
  };
}
const many = (n: number, over: Parameters<typeof row>[0] = {}) =>
  Array.from({ length: n }, () => row(over));

const scored = (
  model: Record<string, number | "na">,
  person: Record<string, number | "na">,
  modelSide: "a" | "b" = "a",
) => ({
  version: "provisional-1",
  scores: modelSide === "a" ? { a: model, b: person } : { a: person, b: model },
});

describe("roundsAgainstHuman", () => {
  it("resolves the choice whichever side the model played on", () => {
    const rounds = roundsAgainstHuman(
      [
        row({ modelSide: "a", winner: "a" }),
        row({ modelSide: "b", winner: "a" }),
        row({ modelSide: "b", winner: "b" }),
        row({ winner: "tie" }),
        row({ winner: "both_unusable" }),
      ],
      MODEL,
    );
    expect(rounds.map((r) => r.outcome)).toEqual([
      "model",
      "person",
      "model",
      "tie",
      "both_unusable",
    ]);
  });

  it("leaves out demo rows, rounds between two people, and rounds of another model", () => {
    const rounds = roundsAgainstHuman(
      [
        row({ isDemo: true }),
        row({ a: "human", b: "human" }),
        row({ model: OTHER }),
        row({ a: MODEL, b: OTHER }),
        row({ winner: "nonsense" }),
        row(),
      ],
      MODEL,
    );
    expect(rounds).toHaveLength(1);
  });

  it("lists the models that have met a person, most rounds first, never a demo round", () => {
    expect(
      systemsAgainstHuman([
        ...many(2, { model: OTHER }),
        ...many(3),
        row({ isDemo: true, model: "demo-only" }),
        row({ a: "human", b: "human" }),
      ]),
    ).toEqual([MODEL, OTHER]);
  });
});

describe("preference: how often listeners chose the model", () => {
  it("keeps ties and both-unusable beside the choice, never inside it", () => {
    const p = preference(
      roundsAgainstHuman(
        [
          ...many(9, { winner: "a" }), // model chosen
          ...many(24, { winner: "b" }), // person chosen
          ...many(5, { winner: "tie" }),
          ...many(2, { winner: "both_unusable" }),
        ],
        MODEL,
      ),
    );
    expect(p).toMatchObject({
      rounds: 40,
      model: 9,
      person: 24,
      tie: 5,
      bothUnusable: 2,
      tier: "Early",
    });
    // 9 of the 33 rounds that named a winner, not 9 of 40.
    expect(p.share?.mean).toBeCloseTo(9 / 33, 6);
    expect(p.share?.n).toBe(33);
    expect(p.share!.ciLow).toBeLessThan(p.share!.mean);
    expect(p.share!.ciHigh).toBeGreaterThan(p.share!.mean);
  });

  it("below 30 rounds gives counts only: no percentage, and the way to the next word", () => {
    const p = preference(roundsAgainstHuman(many(8), MODEL));
    expect(p.tier).toBe("Too few");
    expect(p.share).toBeNull();
    expect(p.model).toBe(8);
    expect(p.next).toBe("22 more rounds to reach Early.");
  });

  it("counts sentences and listeners, and dates the first and last round", () => {
    const rows = [
      row({
        promptId: "s1",
        annotatorId: "l1",
        createdAt: "2026-11-20T09:00:00.000Z",
      }),
      row({
        promptId: "s1",
        annotatorId: "l2",
        createdAt: "2026-11-22T09:00:00.000Z",
      }),
      row({
        promptId: "s2",
        annotatorId: "l1",
        createdAt: "2026-11-21T09:00:00.000Z",
      }),
    ];
    const p = preference(roundsAgainstHuman(rows, MODEL));
    expect(p).toMatchObject({
      rounds: 3,
      sentences: 2,
      listeners: 2,
      firstAt: "2026-11-20T09:00:00.000Z",
      lastAt: "2026-11-22T09:00:00.000Z",
    });
  });

  it("walks the thresholds: 30, 100 on 50 sentences, 300 from 5 listeners, 600", () => {
    const tierOf = (n: number, listeners: number, sentences = n) =>
      preference(
        roundsAgainstHuman(
          Array.from({ length: n }, (_, i) =>
            row({
              annotatorId: `l${i % listeners}`,
              promptId: `s${i % sentences}`,
            }),
          ),
          MODEL,
        ),
      ).tier;
    expect(tierOf(29, 1)).toBe("Too few");
    expect(tierOf(30, 1)).toBe("Early");
    expect(tierOf(100, 1, 40)).toBe("Early");
    expect(tierOf(100, 1)).toBe("Readable");
    expect(tierOf(300, 4)).toBe("Readable");
    expect(tierOf(300, 5)).toBe("Ranking");
    expect(tierOf(600, 5)).toBe("Strong");
  });

  it("an empty model is zero rounds, Too few, no share", () => {
    const h = humanHalf([], null);
    expect(h.preference).toMatchObject({
      rounds: 0,
      tier: "Too few",
      share: null,
    });
    expect(h.agreement).toEqual({ sharedRounds: 0, alpha: null });
  });
});

describe("axisTable: the score lines for both clips", () => {
  it("averages each line per clip and takes the gap inside the round", () => {
    const rows = many(30).map((r, i) => ({
      ...r,
      axes: scored({ tone: 2, pace: 4 }, { tone: i % 2 ? 5 : 4, pace: 4 }),
    }));
    const t = axisTable(roundsAgainstHuman(rows, MODEL));
    const tone = t.lines.find((l) => l.key === "tone")!;
    expect(tone.rated).toBe(30);
    expect(tone.model).toBe(2);
    expect(tone.person).toBe(4.5);
    expect(tone.gap!.mean).toBeCloseTo(-2.5, 6);
    expect(tone.gap!.distinguishable).toBe(true);
    const pace = t.lines.find((l) => l.key === "pace")!;
    expect(pace.gap!.mean).toBe(0);
    expect(pace.gap!.distinguishable).toBe(false);
    // A line nobody rated is present, empty.
    expect(t.lines.find((l) => l.key === "naturalness")).toMatchObject({
      rated: 0,
      model: null,
      person: null,
      gap: null,
    });
  });

  it("reads the model's scores from the side the model played on", () => {
    const rows = many(30, { modelSide: "b" }).map((r) => ({
      ...r,
      axes: scored({ tone: 1 }, { tone: 5 }, "b"),
    }));
    const tone = axisTable(roundsAgainstHuman(rows, MODEL)).lines.find(
      (l) => l.key === "tone",
    )!;
    expect(tone.model).toBe(1);
    expect(tone.person).toBe(5);
  });

  it("shows no gap under 30 rated rounds, and calls it quotable only from 100", () => {
    const mk = (n: number) =>
      axisTable(
        roundsAgainstHuman(
          many(n).map((r) => ({
            ...r,
            axes: scored({ tone: 2 }, { tone: 4 }),
          })),
          MODEL,
        ),
      ).lines.find((l) => l.key === "tone")!;
    expect(mk(29).gap).toBeNull();
    expect(mk(29).model).toBe(2);
    expect(mk(30).gap).not.toBeNull();
    expect(mk(30).quotable).toBe(false);
    expect(mk(100).quotable).toBe(true);
  });

  it("leaves N/A out of its own line only", () => {
    const rows = many(2).map((r) => ({
      ...r,
      axes: scored({ tone: "na", pace: 3 }, { tone: 4, pace: 3 }),
    }));
    const t = axisTable(roundsAgainstHuman(rows, MODEL));
    expect(t.lines.find((l) => l.key === "tone")!.rated).toBe(0);
    expect(t.lines.find((l) => l.key === "pace")!.rated).toBe(2);
  });

  it("leaves out rows stored when only the winner was scored, and counts them", () => {
    const rows = [
      {
        ...row(),
        axes: { version: "provisional-1", target: "a", scores: { tone: 5 } },
      },
      { ...row(), axes: scored({ tone: 2 }, { tone: 4 }) },
    ];
    const t = axisTable(roundsAgainstHuman(rows, MODEL));
    expect(t.winnerOnlyExcluded).toBe(1);
    expect(t.lines.find((l) => l.key === "tone")!.rated).toBe(1);
  });

  it("never mixes rubric versions: a row under another version is left out and counted", () => {
    const rows = [
      {
        ...row(),
        axes: {
          version: "lydia-1",
          scores: { a: { slot: 5 }, b: { slot: 1 } },
        },
      },
      { ...row(), axes: scored({ tone: 2 }, { tone: 4 }) },
    ];
    const t = axisTable(roundsAgainstHuman(rows, MODEL));
    expect(t.version).toBe("provisional-1");
    expect(t.otherVersionExcluded).toBe(1);
    expect(t.lines.every((l) => l.rated <= 1)).toBe(true);
    expect(t.lines.map((l) => l.key)).not.toContain("slot");
  });
});

describe("checkTable: does the clip say what is written?", () => {
  const check = (over: Partial<CheckRow> = {}): CheckRow => ({
    recordingId: `r${++seq}`,
    reviewerId: "rev1",
    verdict: "matches",
    level: null,
    system: "human",
    isDemo: false,
    ...over,
  });

  it("splits people's clips from the model's, and leaves demo rows out", () => {
    const t = checkTable(
      [
        check(),
        check({ verdict: "does_not_match", level: "tone" }),
        check({ verdict: "cannot_hear" }),
        check({ isDemo: true }),
        check({ system: MODEL, verdict: "does_not_match", level: "word" }),
        check({ system: OTHER }),
      ],
      MODEL,
    );
    expect(t.person.checked).toBe(3);
    expect(t.person.counts).toEqual({
      matches: 1,
      does_not_match: 1,
      cannot_hear: 1,
    });
    expect(t.person.levels.tone).toBe(1);
    expect(t.model.checked).toBe(1);
    expect(t.model.levels.word).toBe(1);
  });

  it("gives counts only under 30 checked clips, then shares with a range", () => {
    const few = checkTable(
      Array.from({ length: 29 }, () => check()),
      null,
    );
    expect(few.person.shares).toBeNull();
    const enough = checkTable(
      [
        ...Array.from({ length: 27 }, () => check()),
        ...Array.from({ length: 3 }, () =>
          check({ verdict: "does_not_match", level: "sound" }),
        ),
      ],
      null,
    );
    expect(enough.person.shares!.matches.mean).toBeCloseTo(0.9, 6);
    expect(enough.person.shares!.matches.ciLow).toBeLessThan(0.9);
    expect(enough.person.levels.sound).toBe(3);
  });

  it("an empty model column is zero, not missing", () => {
    const t = checkTable([check()], null);
    expect(t.model.checked).toBe(0);
    expect(t.model.shares).toBeNull();
  });
});

describe("tonePairs", () => {
  const ans = (heard: string, system = MODEL, isDemo = false) => ({
    system,
    heard,
    isDemo,
  });

  it("counts not sure as not correct, and leaves demo and other systems out", () => {
    const t = tonePairs(
      [
        ans("target"),
        ans("foil"),
        ans("unsure"),
        ans("target", "human"),
        ans("target", MODEL, true),
      ],
      MODEL,
    );
    expect(t).toMatchObject({
      answered: 3,
      correct: 1,
      unsure: 1,
      share: null,
      trusted: false,
    });
  });

  it("shows a share from 30 answers and trusts it from 50", () => {
    const of = (n: number) =>
      tonePairs(
        Array.from({ length: n }, (_, i) =>
          ans(i % 5 === 0 ? "foil" : "target"),
        ),
        MODEL,
      );
    expect(of(30).share!.mean).toBeCloseTo(0.8, 6);
    expect(of(30).trusted).toBe(false);
    expect(of(50).trusted).toBe(true);
  });
});

describe("listenerAgreement", () => {
  it("needs two listeners on the same two clips, whichever side each clip played on", () => {
    const base = row({ winner: "a" });
    const swapped: ListenRow = {
      ...base,
      id: "swap",
      annotatorId: "listener2",
      recordingAId: base.recordingBId,
      recordingBId: base.recordingAId,
      a: base.b,
      b: base.a,
      winner: "b", // the model again, now on side B
    };
    const rounds = roundsAgainstHuman([base, swapped, row()], MODEL);
    const a = listenerAgreement(rounds);
    expect(a.sharedRounds).toBe(1);
    // Under 30 shared rounds: the count, no number.
    expect(a.alpha).toBeNull();
  });

  it("reports alpha from 30 shared rounds on", () => {
    const rows: ListenRow[] = [];
    for (let i = 0; i < 30; i++) {
      const first = row({ winner: i % 2 ? "a" : "b" });
      rows.push(first, {
        ...first,
        id: `${first.id}-2`,
        annotatorId: "listener2",
      });
    }
    const a = listenerAgreement(roundsAgainstHuman(rows, MODEL));
    expect(a.sharedRounds).toBe(30);
    expect(a.alpha).toBe(1);
  });

  it("with one listener there is nothing to compare", () => {
    expect(listenerAgreement(roundsAgainstHuman(many(40), MODEL))).toEqual({
      sharedRounds: 0,
      alpha: null,
    });
  });
});
