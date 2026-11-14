import {
  AUTO_KINDS,
  pick,
  type AutoMeasureRow,
  type EvalRow,
  type Measured,
  type RecordedLevels,
  type SpeechMeasureData,
  type VersionRow,
} from "./data";
import { EXAM_TIERS, examTier, nextExamTier, type ExamTier } from "./tiers";

/**
 * The automatic half of the speech measurement view, as pure functions: what
 * can be computed without a listener. Three blocks.
 *
 *   Recognition: the recogniser's errors on the locked exam (SpeechEvalResult).
 *   Voice: what the voice loses when our own recogniser hears it back, as the
 *     gap to a person's clip of the same sentence.
 *   Levels: how loud and how clean the clips are.
 *
 * Two rules. A difference between two versions is only ever drawn between
 * scores on the same exam. And it is called "better" or "worse" only when the
 * ranges leave no doubt; otherwise it is "tied at this size".
 */

export type DeltaWord = "better" | "worse" | "tied at this size";

export interface Range {
  lo: number;
  hi: number;
}

export interface Delta {
  /** This version minus the other, in percentage points. Negative is fewer errors. */
  points: number;
  /** Null when the page must not name the difference (see `why`). */
  word: DeltaWord | null;
  why: string | null;
}

export interface AutoNumber {
  key: "cer" | "werStripped" | "werRetained" | "ter";
  /** A share between 0 and 1. */
  value: number;
  range: Range | null;
  delta: Delta | null;
}

export interface Exam {
  manifestVersion: string;
  clips: number;
  speakers: number;
  tier: ExamTier;
  next: string | null;
  /** Marked vowels in the exam text, when the worker stored the count. */
  markedVowels: number | null;
  scoredAt: string;
}

export interface RecognitionBlock {
  modelRef: string;
  exam: Exam;
  numbers: AutoNumber[];
  comparedWith: string | null;
  /** Set when a comparison was asked for and refused. */
  notCompared: string | null;
}

const rangeOf = (m: Measured | null): Range | null =>
  m && m.lo !== null && m.hi !== null ? { lo: m.lo, hi: m.hi } : null;

const points = (a: number, b: number) => Math.round((a - b) * 100 * 10) / 10;

/** The latest scoring of a model, optionally on one exam. */
export function latestEval(
  evals: EvalRow[],
  modelRef: string,
  manifestVersion?: string,
): EvalRow | null {
  const mine = evals.filter(
    (e) =>
      e.modelRef === modelRef &&
      (manifestVersion === undefined || e.manifestVersion === manifestVersion),
  );
  return mine.length
    ? mine.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b))
    : null;
}

const stored = (
  auto: AutoMeasureRow[],
  kind: string,
  modelRef: string,
  manifestVersion?: string,
) =>
  auto.find(
    (r) =>
      r.kind === kind &&
      r.modelRef === modelRef &&
      (manifestVersion === undefined || r.manifestVersion === manifestVersion),
  ) ?? null;

/**
 * Name a difference, or refuse to. Lower is better for every number here.
 * Without a stored range on both sides nothing is named. With ranges, the
 * difference is named only when the two ranges do not overlap, which is
 * stricter than a paired test and never names a difference a paired test
 * would call a tie because of the exam's size.
 */
export function nameDelta(
  tier: ExamTier,
  mine: { value: number; range: Range | null },
  other: { value: number; range: Range | null },
): Delta {
  const pts = points(mine.value, other.value);
  if (tier === "Smoke test") {
    return {
      points: pts,
      word: null,
      why: `Under ${EXAM_TIERS.early} exam clips nothing is called better or worse.`,
    };
  }
  if (!mine.range || !other.range) {
    return {
      points: pts,
      word: null,
      why: "No range is stored for one of the two, so the difference is not named.",
    };
  }
  if (mine.range.hi < other.range.lo)
    return { points: pts, word: "better", why: null };
  if (mine.range.lo > other.range.hi)
    return { points: pts, word: "worse", why: null };
  return { points: pts, word: "tied at this size", why: null };
}

const KEYS = ["cer", "werStripped", "werRetained", "ter"] as const;

/**
 * The recognition block for one version, compared with another when both
 * were scored on the same exam. Two versions scored on different exams are
 * never compared: the block says so instead.
 */
export function recognitionBlock(
  data: Pick<SpeechMeasureData, "evals" | "auto">,
  modelRef: string,
  compareRef: string | null,
): RecognitionBlock | null {
  const mine = latestEval(data.evals, modelRef);
  if (!mine) return null;
  const tier = examTier(mine.nClips, mine.speakers);
  const mineStored = stored(
    data.auto,
    AUTO_KINDS.recognition,
    modelRef,
    mine.manifestVersion,
  );

  let other: EvalRow | null = null;
  let notCompared: string | null = null;
  if (compareRef && compareRef !== modelRef) {
    other = latestEval(data.evals, compareRef, mine.manifestVersion);
    if (!other) {
      notCompared = latestEval(data.evals, compareRef)
        ? "The other version was scored on a different exam. Two exams are never compared."
        : "The other version has not been scored.";
    }
  }
  const otherStored = other
    ? stored(
        data.auto,
        AUTO_KINDS.recognition,
        other.modelRef,
        other.manifestVersion,
      )
    : null;

  return {
    modelRef,
    comparedWith: other ? other.modelRef : null,
    notCompared,
    exam: {
      manifestVersion: mine.manifestVersion,
      clips: mine.nClips,
      speakers: mine.speakers,
      tier,
      next: nextExamTier(mine.nClips, mine.speakers),
      markedVowels: pick(mineStored?.values, "markedVowels")?.value ?? null,
      scoredAt: mine.createdAt,
    },
    numbers: KEYS.map((key) => {
      const range = rangeOf(pick(mineStored?.values, key));
      return {
        key,
        value: mine[key],
        range,
        delta: other
          ? nameDelta(
              tier,
              { value: mine[key], range },
              {
                value: other[key],
                range: rangeOf(pick(otherStored?.values, key)),
              },
            )
          : null,
      };
    }),
  };
}

// ─── the voice, heard back ──────────────────────────────────────────────────

export interface GapNumber {
  /** Model minus person, in percentage points. */
  gapPoints: number;
  range: Range | null;
  model: number | null;
  person: number | null;
}

export interface VoiceBlock {
  modelRef: string;
  /** The recogniser that listened: the ruler. */
  ruler: string;
  sentences: number;
  letters: GapNumber | null;
  tones: GapNumber | null;
  scoredAt: string;
}

function gap(
  values: AutoMeasureRow["values"],
  gapKey: "cerGap" | "terGap",
  modelKey: "cerModel" | "terModel",
  personKey: "cerPerson" | "terPerson",
): GapNumber | null {
  const g = pick(values, gapKey);
  const m = pick(values, modelKey);
  const p = pick(values, personKey);
  if (!g && !(m && p)) return null;
  const value = g ? g.value : m!.value - p!.value;
  const r = rangeOf(g);
  return {
    gapPoints: Math.round(value * 100 * 10) / 10,
    range: r ? { lo: r.lo * 100, hi: r.hi * 100 } : null,
    model: m?.value ?? null,
    person: p?.value ?? null,
  };
}

/** The round-trip block for one voice version. Null until the worker stores one. */
export function voiceBlock(
  data: Pick<SpeechMeasureData, "auto">,
  modelRef: string,
): VoiceBlock | null {
  const row = stored(data.auto, AUTO_KINDS.roundTrip, modelRef);
  if (!row) return null;
  return {
    modelRef,
    ruler: row.rulerRef,
    sentences: row.nClips,
    letters: gap(row.values, "cerGap", "cerModel", "cerPerson"),
    tones: gap(row.values, "terGap", "terModel", "terPerson"),
    scoredAt: row.createdAt,
  };
}

// ─── levels ─────────────────────────────────────────────────────────────────

export interface LevelRow {
  key: "peak" | "speech" | "noise" | "snr" | "clipped";
  /** As recorded. Null is "Not measured yet". */
  before: number | null;
  /** After cleaning. Null is "Not measured yet". */
  after: number | null;
  unit: "dBFS" | "dB" | "clips";
}

export interface LevelsBlock {
  clips: number;
  rows: LevelRow[];
  /** Where the "before" numbers came from. */
  source: "recorder" | "worker";
  /** Null until the worker has run the recogniser on raw and cleaned clips. */
  cleaning: {
    changed: boolean;
    cerPoints: number | null;
    terPoints: number | null;
  } | null;
}

export function levelsBlock(
  data: Pick<SpeechMeasureData, "auto"> & { levels: RecordedLevels },
): LevelsBlock {
  // The worker's aggregates, when they exist: one row for raw clips and one
  // for cleaned, told apart by the ruler or the manifest carrying the stage.
  const rows = data.auto.filter((r) => r.kind === AUTO_KINDS.levels);
  const stageOf = (r: AutoMeasureRow) =>
    /clean/i.test(`${r.modelRef} ${r.rulerRef} ${r.manifestVersion}`)
      ? "cleaned"
      : "raw";
  const raw = rows.find((r) => stageOf(r) === "raw") ?? null;
  const cleaned = rows.find((r) => stageOf(r) === "cleaned") ?? null;
  const v = (r: AutoMeasureRow | null, name: Parameters<typeof pick>[1]) =>
    pick(r?.values, name)?.value ?? null;

  const cleaningRow =
    data.auto.find((r) => r.kind === AUTO_KINDS.cleaning) ?? null;
  const cer = pick(cleaningRow?.values, "cleaningCerDelta");
  const ter = pick(cleaningRow?.values, "cleaningTerDelta");
  const excludesZero = (m: Measured | null) =>
    !!m && m.lo !== null && m.hi !== null && (m.lo > 0 || m.hi < 0);

  return {
    clips: raw ? raw.nClips : data.levels.clips,
    source: raw ? "worker" : "recorder",
    rows: [
      {
        key: "peak",
        unit: "dBFS",
        before: v(raw, "peakDbfs") ?? data.levels.medianPeakDbfs,
        after: v(cleaned, "peakDbfs"),
      },
      {
        key: "speech",
        unit: "dBFS",
        before: v(raw, "speechDbfs") ?? data.levels.medianSpeechDbfs,
        after: v(cleaned, "speechDbfs"),
      },
      {
        key: "noise",
        unit: "dBFS",
        before: v(raw, "noiseDbfs"),
        after: v(cleaned, "noiseDbfs"),
      },
      {
        key: "snr",
        unit: "dB",
        before: v(raw, "snrDb"),
        after: v(cleaned, "snrDb"),
      },
      {
        key: "clipped",
        unit: "clips",
        before:
          v(raw, "clipped") ??
          (data.levels.clips > 0 ? data.levels.clippedClips : null),
        after: v(cleaned, "clipped"),
      },
    ],
    cleaning: cleaningRow
      ? {
          changed: excludesZero(cer) || excludesZero(ter),
          cerPoints: cer ? Math.round(cer.value * 100 * 10) / 10 : null,
          terPoints: ter ? Math.round(ter.value * 100 * 10) / 10 : null,
        }
      : null,
  };
}

// ─── which version is on screen ─────────────────────────────────────────────

export interface VersionOption {
  modelRef: string;
  label: string;
  promoted: boolean;
}

const BASE_REF = "base";

/** Recogniser versions that have a score, newest first, the promoted one named. */
export function recognitionVersions(
  data: Pick<SpeechMeasureData, "evals" | "versions">,
): VersionOption[] {
  const promoted = new Set(
    data.versions
      .filter((v) => v.system === "asr" && v.promoted)
      .map((v) => v.modelRef),
  );
  const latest = new Map<string, string>();
  for (const e of data.evals) {
    const cur = latest.get(e.modelRef);
    if (!cur || e.createdAt > cur) latest.set(e.modelRef, e.createdAt);
  }
  return [...latest.entries()]
    .sort(([, a], [, b]) => (a < b ? 1 : -1))
    .map(([modelRef]) => ({
      modelRef,
      promoted: promoted.has(modelRef),
      label:
        modelRef === BASE_REF
          ? "base (the untuned model)"
          : promoted.has(modelRef)
            ? `${modelRef} (promoted)`
            : modelRef,
    }));
}

/** Voice versions known from any source: a candidate, a round trip, a Listen round. */
export function voiceVersions(
  data: Pick<SpeechMeasureData, "versions" | "auto">,
  heardByListeners: string[],
): VersionOption[] {
  const seen = new Map<string, VersionRow | null>();
  for (const v of data.versions)
    if (v.system === "tts") seen.set(v.modelRef, v);
  for (const r of data.auto) {
    if (r.kind === AUTO_KINDS.roundTrip && !seen.has(r.modelRef))
      seen.set(r.modelRef, null);
  }
  for (const s of heardByListeners) if (!seen.has(s)) seen.set(s, null);
  return [...seen.entries()].map(([modelRef, v]) => ({
    modelRef,
    promoted: !!v?.promoted,
    label: v?.promoted ? `${modelRef} (promoted)` : modelRef,
  }));
}

/** The version shown when none is asked for: the promoted one, else the first listed. */
export function defaultVersion(options: VersionOption[]): string | null {
  return (options.find((o) => o.promoted) ?? options[0])?.modelRef ?? null;
}

/** What a version is compared with by default: the promoted one, else the base model. */
export function defaultComparison(
  options: VersionOption[],
  selected: string | null,
): string | null {
  const others = options.filter((o) => o.modelRef !== selected);
  return (
    others.find((o) => o.promoted)?.modelRef ??
    others.find((o) => o.modelRef === BASE_REF)?.modelRef ??
    null
  );
}
