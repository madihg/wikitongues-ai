import { describe, it, expect, vi } from "vitest";
import { loadSpeechMeasure, pooledTone } from "./data";

/**
 * The adapter's queries, checked without a database: what each one asks for
 * and what it leaves out. The view shows numbers, so the adapter must never
 * select a clip's bytes, a transcript, an answer's text or an account name,
 * and it must leave demo rows out in the WHERE clause, not afterwards.
 */

type Args = {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

function fakeDb(
  over: Record<string, unknown[]> = {},
  autoFails: unknown = null,
) {
  const calls: Record<string, Args> = {};
  const model = (name: string) => ({
    findMany: vi.fn(async (args: Args) => {
      calls[name] = args;
      if (name === "speechAutoMeasure" && autoFails) throw autoFails;
      return over[name] ?? [];
    }),
  });
  return {
    calls,
    db: {
      speechRecording: model("speechRecording"),
      speechEvalResult: model("speechEvalResult"),
      speechCandidate: model("speechCandidate"),
      speechComparison: model("speechComparison"),
      speechCheck: model("speechCheck"),
      speechMinimalPairAnswer: model("speechMinimalPairAnswer"),
      speechAutoMeasure: model("speechAutoMeasure"),
    } as never,
  };
}

const flat = (select: Record<string, unknown> | undefined): string[] =>
  Object.entries(select ?? {}).flatMap(([k, v]) =>
    v && typeof v === "object" && "select" in (v as object)
      ? [
          k,
          ...flat((v as { select: Record<string, unknown> }).select).map(
            (x) => `${k}.${x}`,
          ),
        ]
      : [k],
  );

describe("loadSpeechMeasure: what it reads", () => {
  it("names a select on every read, and never selects audio, text or a name", async () => {
    const { db, calls } = fakeDb();
    await loadSpeechMeasure(db);
    const FORBIDDEN = [
      "bytes",
      "storagePath",
      "storageKey",
      "studioText",
      "text",
      "answerText",
      "note",
      "reasonTags",
      "name",
      "email",
      "licenseText",
    ];
    for (const [model, args] of Object.entries(calls)) {
      expect(args.select, `${model} has no select`).toBeDefined();
      const fields = flat(args.select).map((f) => f.split(".").pop());
      for (const f of FORBIDDEN) {
        expect(fields, `${model} selects ${f}`).not.toContain(f);
      }
    }
    expect(Object.keys(calls).sort()).toEqual([
      "speechAutoMeasure",
      "speechCandidate",
      "speechCheck",
      "speechComparison",
      "speechEvalResult",
      "speechMinimalPairAnswer",
      "speechRecording",
    ]);
  });

  it("leaves demo rows out in the WHERE clause of every table that has them", async () => {
    const { db, calls } = fakeDb();
    await loadSpeechMeasure(db);
    for (const model of [
      "speechRecording",
      "speechComparison",
      "speechCheck",
      "speechMinimalPairAnswer",
    ]) {
      expect(calls[model].where, model).toMatchObject({ isDemo: false });
    }
  });

  it("keeps clips with no review status: withdrawn clips are excluded without a bare NOT", async () => {
    const { db, calls } = fakeDb();
    await loadSpeechMeasure(db);
    const where = calls.speechRecording.where!;
    // NOT (status = 'withdrawn') is unknown for NULL in SQL and would drop
    // every unchecked clip. The filter must say "no status, or another one".
    expect(where).not.toHaveProperty("NOT");
    expect(where.OR).toEqual([
      { reviewStatus: null },
      { reviewStatus: { not: "withdrawn" } },
    ]);
    expect(where.uploadedAt).toEqual({ not: null });
  });
});

describe("loadSpeechMeasure for a reader who is not a research lead", () => {
  it("reads no Listen judgment, no Check verdict and no tone answer", async () => {
    const { db, calls } = fakeDb({
      speechComparison: [{ id: "should-never-be-read" }],
    });
    const d = await loadSpeechMeasure(db, { human: false });
    expect(Object.keys(calls).sort()).toEqual([
      "speechAutoMeasure",
      "speechCandidate",
      "speechEvalResult",
      "speechRecording",
    ]);
    expect(d.humanLoaded).toBe(false);
    expect(d.listen).toEqual([]);
    expect(d.checks).toEqual([]);
    expect(d.toneAnswers).toEqual([]);
  });

  it("loads them by default, for a lead", async () => {
    const { db, calls } = fakeDb();
    const d = await loadSpeechMeasure(db);
    expect(d.humanLoaded).toBe(true);
    expect(Object.keys(calls)).toContain("speechComparison");
  });
});

describe("loadSpeechMeasure: what it returns", () => {
  const clip = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    annotatorId: "s1",
    durationMs: 60_000,
    isTestSet: false,
    reviewStatus: null,
    quality: null,
    sourceType: "contributor",
    sourceRef: null,
    modelOutputId: null,
    ...over,
  });

  it("with empty tables: zeros and empty lists, and the worker table marked not ready", async () => {
    const missing = Object.assign(new Error("relation does not exist"), {
      code: "P2010",
      meta: { code: "42P01" },
    });
    const { db } = fakeDb({}, missing);
    const d = await loadSpeechMeasure(db);
    expect(d.held).toEqual({
      clips: 0,
      minutes: 0,
      speakers: 0,
      examClips: 0,
      examSpeakers: 0,
      unchecked: 0,
    });
    expect(d.evals).toEqual([]);
    expect(d.listen).toEqual([]);
    expect(d.auto).toEqual([]);
    expect(d.autoTableReady).toBe(false);
  });

  it("a real database error is not swallowed", async () => {
    const { db } = fakeDb({}, new Error("connection refused"));
    await expect(loadSpeechMeasure(db)).rejects.toThrow("connection refused");
  });

  it("names each clip's system, and drops a check of a clip it no longer counts", async () => {
    const sys = {
      sourceType: "contributor",
      sourceRef: null,
      modelOutputId: null,
    };
    const { db } = fakeDb({
      speechRecording: [
        clip("h1"),
        clip("m1", {
          sourceType: "derived",
          sourceRef: "tts-1",
          annotatorId: null,
        }),
      ],
      speechEvalResult: [
        {
          id: "e1",
          modelRef: "base",
          manifestVersion: "exam-1",
          cer: 0.418,
          werStripped: 0.8,
          werRetained: 0.9,
          ter: 0.5,
          nClips: 72,
          perSpeaker: {
            spk_a: { nClips: 60, markedVowels: 348, terPooled: 0.96 },
            spk_b: { nClips: 12, markedVowels: 17, terPooled: 0.88 },
          },
          jobId: null,
          createdAt: new Date("2026-11-13T20:00:00Z"),
        },
      ],
      speechComparison: [
        {
          id: "c1",
          promptId: "p1",
          annotatorId: "l1",
          recordingAId: "m1",
          recordingBId: "h1",
          winner: "b",
          axes: null,
          isDemo: false,
          createdAt: new Date("2026-11-14T09:00:00Z"),
          recordingA: {
            sourceType: "derived",
            sourceRef: "tts-1",
            modelOutputId: null,
          },
          recordingB: sys,
        },
      ],
      speechCheck: [
        {
          recordingId: "h1",
          reviewerId: "r1",
          verdict: "matches",
          level: null,
          isDemo: false,
        },
        {
          recordingId: "gone",
          reviewerId: "r1",
          verdict: "matches",
          level: null,
          isDemo: false,
        },
      ],
      speechMinimalPairAnswer: [
        { recordingId: "m1", heard: "target", isDemo: false },
      ],
      speechAutoMeasure: [
        {
          kind: "tts_round_trip",
          modelRef: "tts-1",
          rulerRef: "the-recogniser",
          manifestVersion: "exam-1",
          nClips: 72,
          values: {
            systemCer: { value: 0.426, n: 72 },
            humanCer: { value: 0.418, n: 72 },
          },
          createdAt: new Date("2026-11-13T21:00:00Z"),
        },
      ],
    });
    const d = await loadSpeechMeasure(db);
    expect(d.held.clips).toBe(1);
    expect(d.held.minutes).toBe(1);
    expect(d.evals[0]).toMatchObject({
      modelRef: "base",
      nClips: 72,
      speakers: 2,
    });
    expect(d.listen[0]).toMatchObject({ a: "tts-1", b: "human", winner: "b" });
    expect(d.checks).toEqual([
      {
        recordingId: "h1",
        reviewerId: "r1",
        verdict: "matches",
        level: null,
        isDemo: false,
        system: "human",
      },
    ]);
    expect(d.toneAnswers).toEqual([
      { system: "tts-1", heard: "target", isDemo: false },
    ]);
    expect(d.autoTableReady).toBe(true);
    expect(d.auto[0]).toMatchObject({
      kind: "tts_round_trip",
      modelRef: "tts-1",
      nClips: 72,
    });
    expect(d.auto[0].values.humanCer).toEqual({
      value: 0.418,
      lo: null,
      hi: null,
      n: 72,
    });
  });
});

describe("pooledTone", () => {
  it("pools wrong marks over marked vowels across speakers", () => {
    expect(
      pooledTone({
        a: { markedVowels: 300, terPooled: 0.5 },
        b: { markedVowels: 100, terPooled: 1 },
      }),
    ).toEqual({ terPooled: 0.625, markedVowels: 400 });
  });

  it("is null when the counts were not stored, and never divides by zero", () => {
    expect(pooledTone({ a: { cer: 0.3 } })).toEqual({
      terPooled: null,
      markedVowels: null,
    });
    expect(pooledTone({ a: { markedVowels: 0, terPooled: 0 } })).toEqual({
      terPooled: null,
      markedVowels: 0,
    });
    expect(pooledTone(null)).toEqual({ terPooled: null, markedVowels: null });
  });
});
