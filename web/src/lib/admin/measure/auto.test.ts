import { describe, it, expect } from "vitest";
import {
  defaultComparison,
  defaultVersion,
  latestEval,
  levelsBlock,
  nameDelta,
  recognitionBlock,
  recognitionVersions,
  voiceBlock,
  voiceVersions,
} from "./auto";
import {
  isTableNotReady,
  median,
  pick,
  readMeasuredValues,
  summariseClips,
  type AutoMeasureRow,
  type EvalRow,
  type SpeechMeasureData,
  type VersionRow,
} from "./data";
import { speechHeadline } from "./headline";
import type { ListenRow } from "./human";

const EXAM = "exam-2026-11-18";

const ev = (over: Partial<EvalRow> = {}): EvalRow => ({
  id: `e-${over.modelRef ?? "m"}-${over.createdAt ?? ""}`,
  modelRef: "asr-1",
  manifestVersion: EXAM,
  cer: 0.312,
  werStripped: 0.58,
  werRetained: 0.715,
  ter: 0.44,
  nClips: 62,
  speakers: 3,
  createdAt: "2026-11-20T02:00:00.000Z",
  ...over,
});

const auto = (over: Partial<AutoMeasureRow> = {}): AutoMeasureRow => ({
  kind: "asr_three_ways",
  modelRef: "asr-1",
  rulerRef: "omnilingual-ctc-1b",
  manifestVersion: EXAM,
  nClips: 62,
  values: {},
  createdAt: "2026-11-20T02:00:00.000Z",
  ...over,
});

const version = (over: Partial<VersionRow> = {}): VersionRow => ({
  id: "c1",
  system: "asr",
  modelRef: "asr-1",
  createdAt: "2026-11-20T02:00:00.000Z",
  promoted: false,
  regressed: false,
  retrainRequired: false,
  evalResultId: null,
  ...over,
});

const EMPTY_DATA: SpeechMeasureData = {
  held: {
    clips: 0,
    minutes: 0,
    speakers: 0,
    examClips: 0,
    examSpeakers: 0,
    unchecked: 0,
  },
  evals: [],
  versions: [],
  levels: {
    clips: 0,
    medianPeakDbfs: null,
    medianSpeechDbfs: null,
    clippedClips: 0,
  },
  listen: [],
  checks: [],
  toneAnswers: [],
  auto: [],
  autoTableReady: false,
};

describe("recognitionBlock", () => {
  it("is null for a version that was never scored", () => {
    expect(recognitionBlock(EMPTY_DATA, "asr-1", null)).toBeNull();
  });

  it("reports the four numbers and the exam they were scored on", () => {
    const b = recognitionBlock({ evals: [ev()], auto: [] }, "asr-1", null)!;
    expect(b.numbers.map((n) => [n.key, n.value])).toEqual([
      ["cer", 0.312],
      ["werStripped", 0.58],
      ["werRetained", 0.715],
      ["ter", 0.44],
    ]);
    expect(b.exam).toMatchObject({
      manifestVersion: EXAM,
      clips: 62,
      speakers: 3,
      tier: "Early",
      next: "238 more exam clips to reach Trustworthy.",
    });
    // No stored range: none is invented.
    expect(b.numbers.every((n) => n.range === null && n.delta === null)).toBe(
      true,
    );
  });

  it("takes the range and the marked-vowel count from the worker's row for the same exam", () => {
    const b = recognitionBlock(
      {
        evals: [ev()],
        auto: [
          auto({
            values: {
              cer: { value: 0.312, lo: 0.27, hi: 0.35, n: 62 },
              markedVowels: { value: 812, lo: null, hi: null, n: null },
            },
          }),
          // A row for another exam is not this score's range.
          auto({
            manifestVersion: "other-exam",
            values: { ter: { value: 0.4, lo: 0.1, hi: 0.9, n: 9 } },
          }),
        ],
      },
      "asr-1",
      null,
    )!;
    expect(b.numbers[0].range).toEqual({ lo: 0.27, hi: 0.35 });
    expect(b.numbers[3].range).toBeNull();
    expect(b.exam.markedVowels).toBe(812);
  });

  it("never compares two versions scored on different exams", () => {
    const b = recognitionBlock(
      {
        evals: [
          ev(),
          ev({
            modelRef: "asr-0",
            manifestVersion: "exam-2026-10-01",
            cer: 0.5,
          }),
        ],
        auto: [],
      },
      "asr-1",
      "asr-0",
    )!;
    expect(b.comparedWith).toBeNull();
    expect(b.notCompared).toMatch(/different exam/);
    expect(b.numbers.every((n) => n.delta === null)).toBe(true);
  });

  it("compares on the same exam, using the other version's score on THAT exam", () => {
    const b = recognitionBlock(
      {
        evals: [
          ev(),
          ev({
            modelRef: "asr-0",
            cer: 0.353,
            createdAt: "2026-11-19T02:00:00.000Z",
          }),
          // A later score of asr-0 on another exam must not be picked up.
          ev({
            modelRef: "asr-0",
            manifestVersion: "x",
            cer: 0.1,
            createdAt: "2026-11-25T02:00:00.000Z",
          }),
        ],
        auto: [],
      },
      "asr-1",
      "asr-0",
    )!;
    expect(b.comparedWith).toBe("asr-0");
    expect(b.numbers[0].delta!.points).toBe(-4.1);
    // No ranges stored: the difference is shown but not named.
    expect(b.numbers[0].delta!.word).toBeNull();
    expect(b.numbers[0].delta!.why).toMatch(/No range/);
  });

  it("says so when the other version has no score at all", () => {
    const b = recognitionBlock({ evals: [ev()], auto: [] }, "asr-1", "ghost")!;
    expect(b.notCompared).toBe("The other version has not been scored.");
  });
});

describe("nameDelta: better, worse, or tied at this size", () => {
  const at = (value: number, lo: number, hi: number) => ({
    value,
    range: { lo, hi },
  });

  it("names a difference only when the ranges do not overlap", () => {
    expect(
      nameDelta("Early", at(0.3, 0.27, 0.33), at(0.4, 0.36, 0.44)).word,
    ).toBe("better");
    expect(
      nameDelta("Early", at(0.4, 0.36, 0.44), at(0.3, 0.27, 0.33)).word,
    ).toBe("worse");
    expect(
      nameDelta("Early", at(0.3, 0.25, 0.35), at(0.33, 0.28, 0.38)).word,
    ).toBe("tied at this size");
  });

  it("names nothing on a smoke test, whatever the ranges say", () => {
    const d = nameDelta("Smoke test", at(0.1, 0.09, 0.11), at(0.9, 0.89, 0.91));
    expect(d.word).toBeNull();
    expect(d.why).toMatch(/50 exam clips/);
    expect(d.points).toBe(-80);
  });

  it("names nothing when a range is missing", () => {
    expect(
      nameDelta("Trustworthy", { value: 0.3, range: null }, at(0.4, 0.36, 0.44))
        .word,
    ).toBeNull();
  });
});

describe("voiceBlock: what the voice loses on the way back", () => {
  it("is null until the worker has stored a round trip", () => {
    expect(voiceBlock({ auto: [] }, "tts-1")).toBeNull();
    expect(voiceBlock({ auto: [auto()] }, "tts-1")).toBeNull();
  });

  it("leads with the gap to the person's clip, in points", () => {
    const b = voiceBlock(
      {
        auto: [
          auto({
            kind: "tts_round_trip",
            modelRef: "tts-1",
            nClips: 21,
            values: {
              cerGap: { value: 0.094, lo: 0.04, hi: 0.15, n: 21 },
              cerModel: { value: 0.21, lo: null, hi: null, n: 21 },
              cerHuman: { value: 0.116, lo: null, hi: null, n: 21 },
              terModel: { value: 0.38, lo: null, hi: null, n: 21 },
              terHuman: { value: 0.24, lo: null, hi: null, n: 21 },
            },
          }),
        ],
      },
      "tts-1",
    )!;
    expect(b.ruler).toBe("omnilingual-ctc-1b");
    expect(b.sentences).toBe(21);
    expect(b.letters).toEqual({
      gapPoints: 9.4,
      range: { lo: 4, hi: 15 },
      model: 0.21,
      person: 0.116,
    });
    // No stored gap: it is the model's number minus the person's.
    expect(b.tones!.gapPoints).toBe(14);
    expect(b.tones!.range).toBeNull();
  });
});

describe("levelsBlock", () => {
  const recorded = {
    clips: 131,
    medianPeakDbfs: -26.1,
    medianSpeechDbfs: -41.3,
    clippedClips: 4,
  };

  it("shows what the recorder measured, and says the rest is not measured yet", () => {
    const b = levelsBlock({ auto: [], levels: recorded });
    expect(b.source).toBe("recorder");
    expect(b.clips).toBe(131);
    const row = (k: string) => b.rows.find((r) => r.key === k)!;
    expect(row("peak")).toMatchObject({ before: -26.1, after: null });
    expect(row("speech")).toMatchObject({ before: -41.3, after: null });
    expect(row("clipped")).toMatchObject({ before: 4, after: null });
    expect(row("noise")).toMatchObject({ before: null, after: null });
    expect(row("snr")).toMatchObject({ before: null, after: null });
    expect(b.cleaning).toBeNull();
  });

  it("with no clip at all, every cell is empty, not zero", () => {
    const b = levelsBlock({ auto: [], levels: EMPTY_DATA.levels });
    expect(b.rows.every((r) => r.before === null && r.after === null)).toBe(
      true,
    );
  });

  it("uses the worker's before and after once it has run, and answers the cleaning question", () => {
    const b = levelsBlock({
      levels: recorded,
      auto: [
        auto({
          kind: "clip_levels",
          modelRef: "human",
          rulerRef: "quality-v1:raw",
          nClips: 131,
          values: { peakDbfs: -26, snrDb: 19 } as never,
        }),
        auto({
          kind: "clip_levels",
          modelRef: "human",
          rulerRef: "quality-v1:cleaned",
          nClips: 131,
          values: { peakDbfs: -2, snrDb: 36 } as never,
        }),
        auto({
          kind: "cleaning_check",
          modelRef: "cleaning:clean-v1",
          values: { cerDelta: { value: 0.002, lo: -0.01, hi: 0.014, n: 131 } },
        }),
      ].map((r) => ({ ...r, values: readMeasuredValues(r.values) })),
    });
    expect(b.source).toBe("worker");
    const snr = b.rows.find((r) => r.key === "snr")!;
    expect(snr).toMatchObject({ before: 19, after: 36 });
    expect(b.cleaning).toEqual({
      changed: false,
      cerPoints: 0.2,
      terPoints: null,
    });
  });

  it("says cleaning changed what the recogniser hears when the range excludes 0", () => {
    const b = levelsBlock({
      levels: recorded,
      auto: [
        auto({
          kind: "cleaning_check",
          values: { terDelta: { value: 0.05, lo: 0.02, hi: 0.08, n: 131 } },
        }),
      ],
    });
    expect(b.cleaning!.changed).toBe(true);
  });
});

describe("which version is on screen", () => {
  const data = {
    evals: [
      ev({ modelRef: "base", createdAt: "2026-11-18T00:00:00.000Z" }),
      ev({ modelRef: "asr-1", createdAt: "2026-11-20T00:00:00.000Z" }),
      ev({ modelRef: "asr-2", createdAt: "2026-11-27T00:00:00.000Z" }),
    ],
    versions: [
      version({ modelRef: "asr-1", promoted: true }),
      version({ modelRef: "asr-2" }),
    ],
  };

  it("lists scored recognisers newest first and opens on the promoted one", () => {
    const options = recognitionVersions(data);
    expect(options.map((o) => o.modelRef)).toEqual(["asr-2", "asr-1", "base"]);
    expect(options.find((o) => o.modelRef === "base")!.label).toBe(
      "base (the untuned model)",
    );
    expect(defaultVersion(options)).toBe("asr-1");
    // Compared by default with the promoted one, else the base model.
    expect(defaultComparison(options, "asr-2")).toBe("asr-1");
    expect(defaultComparison(options, "asr-1")).toBe("base");
  });

  it("opens on the newest when nothing is promoted, and on nothing when nothing exists", () => {
    expect(defaultVersion(recognitionVersions({ ...data, versions: [] }))).toBe(
      "asr-2",
    );
    expect(defaultVersion([])).toBeNull();
    expect(defaultComparison([], null)).toBeNull();
  });

  it("knows a voice version from a candidate, a round trip or a Listen round", () => {
    const options = voiceVersions(
      {
        versions: [version({ system: "tts", modelRef: "tts-a" })],
        auto: [auto({ kind: "tts_round_trip", modelRef: "tts-b" })],
      },
      ["tts-c", "tts-a"],
    );
    expect(options.map((o) => o.modelRef)).toEqual(["tts-a", "tts-b", "tts-c"]);
  });

  it("latestEval takes the most recent score of a model", () => {
    const evals = [
      ev({ cer: 0.5, createdAt: "2026-11-01T00:00:00.000Z" }),
      ev({ cer: 0.3, createdAt: "2026-11-20T00:00:00.000Z" }),
    ];
    expect(latestEval(evals, "asr-1")!.cer).toBe(0.3);
    expect(latestEval(evals, "nope")).toBeNull();
  });
});

describe("the adapter's pure parts", () => {
  it("reads stored values as { value, lo, hi, n } or as a bare number, and drops anything else", () => {
    expect(
      readMeasuredValues({
        cer: { value: 0.3, lo: 0.2, hi: 0.4, n: 62 },
        ter: 0.4,
        bad: "0.3",
        worse: { lo: 1 },
        text: { value: "never" },
      }),
    ).toEqual({
      cer: { value: 0.3, lo: 0.2, hi: 0.4, n: 62 },
      ter: { value: 0.4, lo: null, hi: null, n: null },
    });
    expect(readMeasuredValues(null)).toEqual({});
  });

  it("finds a number under any of its known key names", () => {
    const values = readMeasuredValues({ cerHuman: 0.11, wer: 0.5 });
    expect(pick(values, "cerPerson")!.value).toBe(0.11);
    expect(pick(values, "werStripped")!.value).toBe(0.5);
    expect(pick(values, "ter")).toBeNull();
    expect(pick(undefined, "cer")).toBeNull();
  });

  it("treats a missing table, or one the app may not read yet, as not ready", () => {
    expect(isTableNotReady({ code: "P2021" })).toBe(true);
    expect(isTableNotReady({ code: "P2010", meta: { code: "42P01" } })).toBe(
      true,
    );
    expect(isTableNotReady({ code: "P2010", meta: { code: "42501" } })).toBe(
      true,
    );
    expect(
      isTableNotReady(new Error('relation "SpeechAutoMeasure" does not exist')),
    ).toBe(true);
    expect(isTableNotReady(new Error("connection refused"))).toBe(false);
    expect(isTableNotReady(null)).toBe(false);
  });

  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("counts kept clips, exam clips and unchecked clips, and never a model's clip as ours", () => {
    const clip = (over: Record<string, unknown> = {}) => ({
      id: Math.random().toString(36),
      annotatorId: "s1",
      durationMs: 6000,
      isTestSet: false,
      reviewStatus: null,
      quality: {
        durationMs: 6000,
        speechShare: 0.8,
        rmsDbfs: -40,
        peakDbfs: -26,
        clippingShare: 0,
      },
      sourceType: "contributor",
      sourceRef: null,
      modelOutputId: null,
      ...over,
    });
    const { held, levels } = summariseClips([
      clip(),
      clip({ annotatorId: "s2", isTestSet: true, reviewStatus: "keep" }),
      clip({ reviewStatus: "bad_audio" }),
      clip({ sourceType: "derived", sourceRef: "tts-1" }),
      clip({ quality: null }),
      clip({
        quality: {
          durationMs: 6000,
          speechShare: 0.8,
          rmsDbfs: -20,
          peakDbfs: -1,
          clippingShare: 0.02,
        },
      }),
    ] as never);
    expect(held).toEqual({
      clips: 4,
      minutes: 0.4,
      speakers: 2,
      examClips: 1,
      examSpeakers: 1,
      unchecked: 3,
    });
    expect(levels).toEqual({
      clips: 3,
      medianPeakDbfs: -26,
      medianSpeechDbfs: -40,
      clippedClips: 1,
    });
  });
});

describe("speechHeadline: the Today tile shows the Speech model view's own numbers", () => {
  const round = (i: number, winner: string): ListenRow => ({
    id: `c${i}`,
    promptId: `p${i}`,
    annotatorId: "l1",
    recordingAId: `a${i}`,
    recordingBId: `b${i}`,
    a: "tts-1",
    b: "human",
    winner,
    axes: null,
    isDemo: false,
    createdAt: "2026-11-21T10:00:00.000Z",
  });

  it("with nothing scored and no round, says so and still counts what we hold", () => {
    const h = speechHeadline({
      ...EMPTY_DATA,
      held: { ...EMPTY_DATA.held, clips: 131, minutes: 16.2 },
    });
    expect(h.recognition).toBeNull();
    expect(h.listeners).toBeNull();
    expect(h.empty).toBe("No speech model has been scored yet.");
    expect(h.held).toEqual({ clips: 131, minutes: 16.2 });
  });

  it("matches the recognition block and the preference of the version the view opens on", () => {
    const data: SpeechMeasureData = {
      ...EMPTY_DATA,
      evals: [
        ev(),
        ev({
          modelRef: "asr-2",
          cer: 0.25,
          createdAt: "2026-11-27T00:00:00.000Z",
        }),
      ],
      versions: [version({ modelRef: "asr-1", promoted: true })],
      listen: [
        ...Array.from({ length: 9 }, (_, i) => round(i, "a")),
        ...Array.from({ length: 31 }, (_, i) => round(100 + i, "b")),
      ],
    };
    const h = speechHeadline(data);
    // The promoted recogniser, not the newest.
    const block = recognitionBlock(data, "asr-1", null)!;
    expect(h.recognition).toEqual({
      modelRef: "asr-1",
      lettersWrongPer100: 31.2,
      examClips: block.exam.clips,
      tier: block.exam.tier,
    });
    expect(h.recognition!.lettersWrongPer100).toBeCloseTo(
      block.numbers[0].value * 100,
      6,
    );
    expect(h.listeners).toEqual({
      modelRef: "tts-1",
      chosen: 9,
      rounds: 40,
      tier: "Early",
    });
  });
});
