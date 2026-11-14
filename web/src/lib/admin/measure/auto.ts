import {
  AUTO_KINDS,
  isCleanedLevels,
  isRawLevels,
  isVariantRef,
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
 *   Recognition: the recogniser's errors against the locked text
 *     (SpeechEvalResult, with ranges from the worker's rows when they exist).
 *   Voice: what the voice loses when our own recogniser hears it back, as the
 *     gap to a person's clip of the same sentence.
 *   Levels: how loud and how clean the clips are, before and after cleaning.
 *
 * Two rules. A difference between two versions is only ever drawn between
 * scores on the same clips. And it is called "better" or "worse" only when
 * the ranges leave no doubt; otherwise it is "tied at this size".
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
  /** What the share is a share of, when it is not the clips: marked vowels for tones. */
  n: number | null;
  /** A caveat printed under the number, when it needs one. */
  note: string | null;
  delta: Delta | null;
}

export interface Exam {
  manifestVersion: string;
  clips: number;
  speakers: number;
  /** False when the clips scored are not the locked exam. */
  locked: boolean;
  tier: ExamTier;
  next: string | null;
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

/** The latest scoring of a model, optionally on one clip set. */
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

/**
 * The worker's row for one recogniser on one clip set. Kind asr_three_ways
 * measures people's clips (modelRef "human") WITH a recogniser, so the
 * recogniser is the ruler.
 */
const scoredBy = (
  auto: AutoMeasureRow[],
  kind: string,
  recogniser: string,
  manifestVersion: string,
) =>
  auto.find(
    (r) =>
      r.kind === kind &&
      r.rulerRef === recogniser &&
      r.manifestVersion === manifestVersion,
  ) ?? null;

/**
 * Name a difference, or refuse to. Lower is better for every number here.
 * Without a stored range on both sides nothing is named. With ranges, the
 * difference is named only when the two ranges do not overlap, which is
 * stricter than a paired test: it never names a difference that a paired
 * test on the same clips would call a tie.
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
      why: `On a smoke test (under ${EXAM_TIERS.early} exam clips, or no locked exam) nothing is called better or worse.`,
    };
  }
  if (!mine.range || !other.range) {
    return {
      points: pts,
      word: null,
      why: "No range is stored for one of the two, so the difference is not named.",
    };
  }
  if (mine.range.hi < other.range.lo) {
    return { points: pts, word: "better", why: null };
  }
  if (mine.range.lo > other.range.hi) {
    return { points: pts, word: "worse", why: null };
  }
  return { points: pts, word: "tied at this size", why: null };
}

const KEYS = ["cer", "werStripped", "werRetained"] as const;

/** The tone number of one scoring: pooled over marked vowels when the counts exist. */
function toneNumber(e: EvalRow, row: AutoMeasureRow | null) {
  const pooled = pick(row?.values, "pooledTer");
  if (e.terPooled !== null) {
    return {
      value: e.terPooled,
      range: rangeOf(pooled),
      n: e.markedVowels,
      note: null,
    };
  }
  if (pooled) {
    return {
      value: pooled.value,
      range: rangeOf(pooled),
      n: pooled.n,
      note: null,
    };
  }
  return {
    value: e.ter,
    range: null,
    n: null,
    note: "An average over clips, where a text with no tone mark counts as 0. It reads low.",
  };
}

/**
 * The recognition block for one version, compared with another when both
 * were scored on the same clips. Two versions scored on different clip sets
 * are never compared: the block says so instead.
 */
export function recognitionBlock(
  data: Pick<SpeechMeasureData, "evals" | "auto">,
  modelRef: string,
  compareRef: string | null,
): RecognitionBlock | null {
  const mine = latestEval(data.evals, modelRef);
  if (!mine) return null;
  const tier = examTier(mine.nClips, mine.speakers, mine.onLockedExam);
  const mineStored = scoredBy(
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
    ? scoredBy(
        data.auto,
        AUTO_KINDS.recognition,
        other.modelRef,
        other.manifestVersion,
      )
    : null;

  const tone = toneNumber(mine, mineStored);
  const otherTone = other ? toneNumber(other, otherStored) : null;

  return {
    modelRef,
    comparedWith: other ? other.modelRef : null,
    notCompared,
    exam: {
      manifestVersion: mine.manifestVersion,
      clips: mine.nClips,
      speakers: mine.speakers,
      locked: mine.onLockedExam,
      tier,
      next: nextExamTier(mine.nClips, mine.speakers, mine.onLockedExam),
      scoredAt: mine.createdAt,
    },
    numbers: [
      ...KEYS.map((key): AutoNumber => {
        const range = rangeOf(pick(mineStored?.values, key));
        return {
          key,
          value: mine[key],
          range,
          n: null,
          note: null,
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
      {
        key: "ter",
        value: tone.value,
        range: tone.range,
        n: tone.n,
        note: tone.note,
        delta: otherTone
          ? nameDelta(
              tier,
              { value: tone.value, range: tone.range },
              { value: otherTone.value, range: otherTone.range },
            )
          : null,
      },
    ],
  };
}

// ─── the voice, heard back ──────────────────────────────────────────────────

export interface GapNumber {
  /** Model minus person, in percentage points. */
  gapPoints: number;
  /** The range of the gap, in points, when one was stored. */
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
  /**
   * True when the recogniser misreads people's own clips too often to
   * measure a voice with: 30 of 100 letters wrong or more, or fewer than 50
   * sentences. Then the gap cannot tell a voice from a person, and the page
   * must say so instead of showing a pass.
   */
  rulerTooBlurry: boolean;
  /** Letters the recogniser gets wrong on people's clips, out of 100. Null when not stored. */
  rulerLettersWrongPer100: number | null;
  scoredAt: string;
}

/** The ruler is trusted under this share of letters wrong on people's clips. */
export const RULER_MAX_CER = 0.3;
export const ROUND_TRIP_MIN_SENTENCES = 50;

function gap(
  values: AutoMeasureRow["values"],
  modelKey: "cerModel" | "terModel",
  personKey: "cerPerson" | "terPerson",
  gapKey?: "cerGap",
): GapNumber | null {
  const g = gapKey ? pick(values, gapKey) : null;
  const m = pick(values, modelKey);
  const p = pick(values, personKey);
  if (!g && !(m && p)) return null;
  const value = g ? g.value : m!.value - p!.value;
  const r = rangeOf(g);
  return {
    gapPoints: Math.round(value * 100 * 10) / 10,
    range: r
      ? { lo: Math.round(r.lo * 1000) / 10, hi: Math.round(r.hi * 1000) / 10 }
      : null,
    model: m?.value ?? null,
    person: p?.value ?? null,
  };
}

/** The round-trip block for one voice version. Null until the worker stores one. */
export function voiceBlock(
  data: Pick<SpeechMeasureData, "auto">,
  modelRef: string,
): VoiceBlock | null {
  const row =
    data.auto.find(
      (r) => r.kind === AUTO_KINDS.roundTrip && r.modelRef === modelRef,
    ) ?? null;
  if (!row) return null;
  const person = pick(row.values, "cerPerson")?.value ?? null;
  return {
    modelRef,
    ruler: row.rulerRef,
    sentences: row.nClips,
    letters: gap(row.values, "cerModel", "cerPerson", "cerGap"),
    tones: gap(row.values, "terModel", "terPerson"),
    rulerTooBlurry:
      person === null ||
      person >= RULER_MAX_CER ||
      row.nClips < ROUND_TRIP_MIN_SENTENCES,
    rulerLettersWrongPer100:
      person === null ? null : Math.round(person * 1000) / 10,
    scoredAt: row.createdAt,
  };
}

// ─── levels ─────────────────────────────────────────────────────────────────

export interface LevelRow {
  key: "peak" | "speech" | "noise" | "snr" | "clipped" | "rejected";
  /** As recorded. Null is "Not measured yet". */
  before: number | null;
  /** After cleaning. Null is "Not measured yet". */
  after: number | null;
  unit: "dBFS" | "dB" | "clips";
}

export interface CleaningAnswer {
  /** "no": the ranges overlap. "worse" or "better": they do not. "unknown": a range is missing. */
  answer: "no" | "worse" | "better" | "unknown";
  /** Cleaned minus raw, in points. Positive is more errors after cleaning. */
  lettersPoints: number | null;
  tonesPoints: number | null;
}

export interface LevelsBlock {
  clips: number;
  rows: LevelRow[];
  /** Where the "before" numbers came from. */
  source: "recorder" | "worker";
  /** Null until the worker has run the recogniser on raw and cleaned clips. */
  cleaning: CleaningAnswer | null;
}

/**
 * Did cleaning change what the recogniser hears? The same recogniser on the
 * same clips, raw (asr_three_ways) and cleaned (cleaning_check).
 */
function cleaningAnswer(auto: AutoMeasureRow[]): CleaningAnswer | null {
  const cleaned = auto.find((r) => r.kind === AUTO_KINDS.cleaning) ?? null;
  if (!cleaned) return null;
  const raw = scoredBy(
    auto,
    AUTO_KINDS.recognition,
    cleaned.rulerRef,
    cleaned.manifestVersion,
  );
  if (!raw)
    return { answer: "unknown", lettersPoints: null, tonesPoints: null };

  const compare = (name: "cer" | "pooledTer") => {
    const a = pick(cleaned.values, name);
    const b = pick(raw.values, name);
    if (!a || !b) return null;
    const ra = rangeOf(a);
    const rb = rangeOf(b);
    const word: CleaningAnswer["answer"] =
      !ra || !rb
        ? "unknown"
        : ra.lo > rb.hi
          ? "worse"
          : ra.hi < rb.lo
            ? "better"
            : "no";
    return { points: points(a.value, b.value), word };
  };
  const letters = compare("cer");
  const tones = compare("pooledTer");
  const words = [letters?.word, tones?.word];
  return {
    answer: words.includes("worse")
      ? "worse"
      : words.includes("better")
        ? "better"
        : words.includes("no")
          ? "no"
          : "unknown",
    lettersPoints: letters?.points ?? null,
    tonesPoints: tones?.points ?? null,
  };
}

export function levelsBlock(
  data: Pick<SpeechMeasureData, "auto"> & { levels: RecordedLevels },
): LevelsBlock {
  const rows = data.auto.filter((r) => r.kind === AUTO_KINDS.levels);
  const raw = rows.find((r) => isRawLevels(r.modelRef)) ?? null;
  const cleaned = rows.find((r) => isCleanedLevels(r.modelRef)) ?? null;
  const v = (r: AutoMeasureRow | null, name: Parameters<typeof pick>[1]) =>
    pick(r?.values, name)?.value ?? null;

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
        // Counted by the recorder when the clip was saved. The worker stores
        // a share per clip, not a count, so this row has no "after".
        before: data.levels.clips > 0 ? data.levels.clippedClips : null,
        after: null,
      },
      {
        key: "rejected",
        unit: "clips",
        before: v(raw, "rejected"),
        after: v(cleaned, "rejected"),
      },
    ],
    cleaning: cleaningAnswer(data.auto),
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
    if (r.kind !== AUTO_KINDS.roundTrip || isVariantRef(r.modelRef)) continue;
    if (!seen.has(r.modelRef)) seen.set(r.modelRef, null);
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
