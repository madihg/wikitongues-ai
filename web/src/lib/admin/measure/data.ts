import type { PrismaClient } from "@prisma/client";
import { systemOf } from "@/lib/speech/decision";
import { sanitizeQuality, THRESHOLDS } from "@/lib/speech/analyse";
import { WITHDRAWN_REVIEW_STATUS } from "@/lib/speech/withdrawal";
import type { CheckRow, ListenRow } from "./human";

/**
 * The one place the speech measurement view reads the database. Everything
 * the page shows comes through here, as plain numbers and ids: no clip text,
 * no transcript, no audio bytes, no account name. Every recording read names
 * its select. Demo rows are left out in the WHERE clause.
 *
 * This file is an adapter, on purpose. It reads SpeechEvalResult (the
 * recogniser against the locked text), SpeechCandidate (versions),
 * SpeechRecording.quality (levels at recording time), SpeechComparison
 * (Listen), SpeechCheck, SpeechMinimalPairAnswer, and SpeechAutoMeasure (what
 * the worker measured: levels before and after cleaning, the recogniser with
 * its ranges, the round trip of a voice). The row shapes of that last table
 * are documented by the speech work; the key names at the top of this file
 * are the only thing to adjust if they change. A database where that table
 * is not there yet gives "Not measured yet", not an error.
 */

// ─── key names in SpeechAutoMeasure.values: adjust here, nowhere else ───────
//
// These follow out/speech/DATA.md (Nov 13). `values` is
// { key: { value, lo?, hi?, n } }.

/** For each number the page shows, the keys it may be stored under, first match wins. */
export const AUTO_KEYS = {
  // kinds "asr_three_ways" (raw clips) and "cleaning_check" (cleaned copies):
  // the recogniser against the locked text, mean over clips, 95% bootstrap.
  cer: ["cer"],
  werStripped: ["werStripped"],
  werRetained: ["werRetained"],
  /** Wrong marks over marked vowels. Its n is the marked vowels. */
  pooledTer: ["pooledTer"],
  // kind "tts_round_trip": the voice heard back by the recogniser.
  cerGap: ["cerGap"],
  cerModel: ["systemCer"],
  cerPerson: ["humanCer"],
  terModel: ["systemPooledTer"],
  terPerson: ["humanPooledTer"],
  // kind "clip_levels": the median over clips, lo and hi the range.
  peakDbfs: ["peakDbfs"],
  speechDbfs: ["speechRmsDbfs"],
  noiseDbfs: ["noiseFloorDbfs"],
  snrDb: ["snrDb"],
  rejected: ["gate_reject"],
} as const;

export const AUTO_KINDS = {
  recognition: "asr_three_ways",
  roundTrip: "tts_round_trip",
  levels: "clip_levels",
  cleaning: "cleaning_check",
} as const;

/** clip_levels rows: `human|<group>` is raw, `cleaning:<version>|<group>` is cleaned. */
export const LEVELS_GROUP = "all";
export const isRawLevels = (modelRef: string) =>
  modelRef === `human|${LEVELS_GROUP}`;
export const isCleanedLevels = (modelRef: string) =>
  modelRef.startsWith("cleaning:") && modelRef.endsWith(`|${LEVELS_GROUP}`);
/** A round-trip row against the cleaned human clips: a second view, not a second voice. */
export const isVariantRef = (modelRef: string) => modelRef.includes("|human-");

// ─── shapes ─────────────────────────────────────────────────────────────────

/** One stored number: a value, its range when one was stored, its count. */
export interface Measured {
  value: number;
  lo: number | null;
  hi: number | null;
  n: number | null;
}

export interface AutoMeasureRow {
  kind: string;
  modelRef: string;
  rulerRef: string;
  manifestVersion: string;
  nClips: number;
  values: Record<string, Measured>;
  createdAt: string;
}

/** One scoring of one recogniser on one exam (SpeechEvalResult). */
export interface EvalRow {
  id: string;
  modelRef: string;
  manifestVersion: string;
  cer: number;
  werStripped: number;
  werRetained: number;
  ter: number;
  nClips: number;
  /** Distinct speakers in the clip set, from perSpeaker's keys. */
  speakers: number;
  /**
   * Wrong tone marks over marked vowels, pooled over speakers. The `ter`
   * column is a mean over clips where a text with no tone mark scores 0, so
   * it reads far too low on a set where most texts carry no mark. Null when
   * the row was stored without the per-speaker counts.
   */
  terPooled: number | null;
  markedVowels: number | null;
  /** True when this clip set is the locked exam as it stands now. */
  onLockedExam: boolean;
  createdAt: string;
}

export interface VersionRow {
  id: string;
  system: "asr" | "tts";
  modelRef: string;
  createdAt: string;
  promoted: boolean;
  regressed: boolean;
  retrainRequired: boolean;
  evalResultId: string | null;
}

/** Levels as the recorder measured them when the clip was saved. */
export interface RecordedLevels {
  /** Kept clips that carry take metrics. */
  clips: number;
  medianPeakDbfs: number | null;
  medianSpeechDbfs: number | null;
  clippedClips: number;
}

export interface Held {
  clips: number;
  minutes: number;
  speakers: number;
  examClips: number;
  examSpeakers: number;
  unchecked: number;
}

/** Pool the per-speaker tone counts of one SpeechEvalResult.perSpeaker. */
export function pooledTone(perSpeaker: unknown): {
  terPooled: number | null;
  markedVowels: number | null;
} {
  if (!isRecord(perSpeaker)) return { terPooled: null, markedVowels: null };
  let wrong = 0;
  let marked = 0;
  let seen = false;
  for (const v of Object.values(perSpeaker)) {
    if (!isRecord(v)) continue;
    const m = num(v.markedVowels);
    const t = num(v.terPooled);
    if (m === null || t === null) continue;
    seen = true;
    marked += m;
    wrong += t * m;
  }
  if (!seen || marked === 0)
    return { terPooled: null, markedVowels: seen ? 0 : null };
  return { terPooled: wrong / marked, markedVowels: marked };
}

export interface SpeechMeasureData {
  held: Held;
  evals: EvalRow[];
  versions: VersionRow[];
  levels: RecordedLevels;
  listen: ListenRow[];
  checks: CheckRow[];
  toneAnswers: Array<{ system: string; heard: string; isDemo: boolean }>;
  /** Rows of SpeechAutoMeasure, newest first. Empty until the worker writes them. */
  auto: AutoMeasureRow[];
  /** False while the worker's measure table is not in the database yet. */
  autoTableReady: boolean;
  /**
   * False when what listeners decided was not loaded at all: the reader is
   * not a research lead. listen, checks and toneAnswers are then empty, and
   * the page must not read "empty" as "nobody has judged yet".
   */
  humanLoaded: boolean;
}

// ─── pure helpers ───────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Read SpeechAutoMeasure.values: { key: { value, lo?, hi?, n? } } or { key: number }. */
export function readMeasuredValues(raw: unknown): Record<string, Measured> {
  const out: Record<string, Measured> = {};
  if (!isRecord(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (num(v) !== null) {
      out[key] = { value: v as number, lo: null, hi: null, n: null };
    } else if (isRecord(v) && num(v.value) !== null) {
      out[key] = {
        value: v.value as number,
        lo: num(v.lo),
        hi: num(v.hi),
        n: num(v.n),
      };
    }
  }
  return out;
}

/** The first stored key that exists, for one of the names in AUTO_KEYS. */
export function pick(
  values: Record<string, Measured> | undefined,
  name: keyof typeof AUTO_KEYS,
): Measured | null {
  if (!values) return null;
  for (const k of AUTO_KEYS[name]) if (values[k]) return values[k];
  return null;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface ClipRow {
  id: string;
  annotatorId: string | null;
  durationMs: number;
  isTestSet: boolean;
  reviewStatus: string | null;
  quality: unknown;
  sourceType: string;
  sourceRef: string | null;
  modelOutputId: string | null;
}

/** A person's clip that is still ours to count: not withdrawn, not flagged as bad. */
const isKept = (c: ClipRow) =>
  c.sourceType !== "derived" &&
  (c.reviewStatus === null || c.reviewStatus === "keep");

export function summariseClips(clips: ClipRow[]): {
  held: Held;
  levels: RecordedLevels;
} {
  const kept = clips.filter(isKept);
  const exam = kept.filter((c) => c.isTestSet);
  const speakers = (rows: ClipRow[]) =>
    new Set(rows.map((c) => c.annotatorId).filter((x): x is string => !!x))
      .size;
  const metrics = kept
    .map((c) => sanitizeQuality(c.quality))
    .filter((q): q is NonNullable<typeof q> => q !== null);
  return {
    held: {
      clips: kept.length,
      minutes: kept.reduce((t, c) => t + c.durationMs, 0) / 60_000,
      speakers: speakers(kept),
      examClips: exam.length,
      examSpeakers: speakers(exam),
      unchecked: clips.filter(
        (c) => c.sourceType !== "derived" && c.reviewStatus === null,
      ).length,
    },
    levels: {
      clips: metrics.length,
      medianPeakDbfs: median(metrics.map((q) => q.peakDbfs)),
      medianSpeechDbfs: median(metrics.map((q) => q.rmsDbfs)),
      clippedClips: metrics.filter(
        (q) => q.clippingShare > THRESHOLDS.clippingShare,
      ).length,
    },
  };
}

// ─── the worker's measure table, read tolerantly ────────────────────────────

/** Postgres: undefined table, or a table the app role was not granted yet. */
const NOT_THERE_YET = new Set(["42P01", "42501"]);

export function isTableNotReady(e: unknown): boolean {
  if (!isRecord(e)) return false;
  if (e.code === "P2021") return true; // Prisma: the table does not exist
  const meta = isRecord(e.meta) ? e.meta : {};
  if (typeof meta.code === "string" && NOT_THERE_YET.has(meta.code))
    return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /42P01|42501|does not exist|permission denied/i.test(message);
}

async function loadAutoMeasures(
  db: Pick<PrismaClient, "speechAutoMeasure">,
): Promise<{ rows: AutoMeasureRow[]; ready: boolean }> {
  try {
    const rows = await db.speechAutoMeasure.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        kind: true,
        modelRef: true,
        rulerRef: true,
        manifestVersion: true,
        nClips: true,
        values: true,
        createdAt: true,
      },
    });
    return {
      ready: true,
      rows: rows.map((r) => ({
        kind: r.kind,
        modelRef: r.modelRef,
        rulerRef: r.rulerRef,
        manifestVersion: r.manifestVersion,
        nClips: r.nClips,
        values: readMeasuredValues(r.values),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    // The table is new. On a database where its migration has not been
    // applied, or the app role has not been granted it yet, the page says
    // "not in the database yet" instead of failing.
    if (isTableNotReady(e)) return { rows: [], ready: false };
    throw e;
  }
}

// ─── the loader ─────────────────────────────────────────────────────────────

const SYSTEM_FIELDS = {
  sourceType: true,
  sourceRef: true,
  modelOutputId: true,
} as const;

type Db = Pick<
  PrismaClient,
  | "speechRecording"
  | "speechEvalResult"
  | "speechCandidate"
  | "speechComparison"
  | "speechCheck"
  | "speechMinimalPairAnswer"
  | "speechAutoMeasure"
>;

export async function loadSpeechMeasure(
  db: Db,
  /**
   * `human: false` leaves out everything listeners decided (Listen
   * judgments, Check verdicts, tone pair answers). Those say how a voice is
   * doing against a person, and the people who rate must not see that while
   * they rate, so only a research lead's page loads them.
   */
  options: { human: boolean } = { human: true },
): Promise<SpeechMeasureData> {
  const [clips, evals, candidates, comparisons, checks, answers, auto] =
    await Promise.all([
      db.speechRecording.findMany({
        where: {
          isDemo: false,
          uploadedAt: { not: null },
          // Not a bare NOT: in SQL, NOT (status = 'withdrawn') is unknown for
          // a clip with no status, and every unchecked clip would vanish.
          OR: [
            { reviewStatus: null },
            { reviewStatus: { not: WITHDRAWN_REVIEW_STATUS } },
          ],
        },
        select: {
          id: true,
          annotatorId: true,
          durationMs: true,
          isTestSet: true,
          reviewStatus: true,
          quality: true,
          ...SYSTEM_FIELDS,
        },
      }),
      db.speechEvalResult.findMany({
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          modelRef: true,
          manifestVersion: true,
          cer: true,
          werStripped: true,
          werRetained: true,
          ter: true,
          nClips: true,
          perSpeaker: true,
          jobId: true,
          createdAt: true,
        },
      }),
      db.speechCandidate.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          system: true,
          modelRef: true,
          createdAt: true,
          promotedAt: true,
          regressed: true,
          retrainRequired: true,
          evalResultId: true,
        },
      }),
      options.human
        ? db.speechComparison.findMany({
            where: { isDemo: false },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              promptId: true,
              annotatorId: true,
              recordingAId: true,
              recordingBId: true,
              winner: true,
              axes: true,
              isDemo: true,
              createdAt: true,
              recordingA: { select: SYSTEM_FIELDS },
              recordingB: { select: SYSTEM_FIELDS },
            },
          })
        : [],
      options.human
        ? db.speechCheck.findMany({
            where: { isDemo: false },
            select: {
              recordingId: true,
              reviewerId: true,
              verdict: true,
              level: true,
              isDemo: true,
            },
          })
        : [],
      options.human
        ? db.speechMinimalPairAnswer.findMany({
            where: { isDemo: false },
            select: { recordingId: true, heard: true, isDemo: true },
          })
        : [],
      loadAutoMeasures(db),
    ]);

  const systemById = new Map(clips.map((c) => [c.id, systemOf(c)]));
  const { held, levels } = summariseClips(clips);

  return {
    held,
    levels,
    evals: evals.map((e) => ({
      id: e.id,
      modelRef: e.modelRef,
      manifestVersion: e.manifestVersion,
      cer: e.cer,
      werStripped: e.werStripped,
      werRetained: e.werRetained,
      ter: e.ter,
      nClips: e.nClips,
      speakers: isRecord(e.perSpeaker) ? Object.keys(e.perSpeaker).length : 0,
      ...pooledTone(e.perSpeaker),
      // The loop's evaluate job only ever scores the locked exam
      // (buildEvalManifest). A row with no job was run by hand on some other
      // set of clips: a smoke run, whatever its size.
      onLockedExam: e.jobId !== null,
      createdAt: e.createdAt.toISOString(),
    })),
    versions: candidates.map((c) => ({
      id: c.id,
      system: c.system,
      modelRef: c.modelRef,
      createdAt: c.createdAt.toISOString(),
      promoted: c.promotedAt !== null,
      regressed: c.regressed,
      retrainRequired: c.retrainRequired,
      evalResultId: c.evalResultId,
    })),
    listen: comparisons.map((c) => ({
      id: c.id,
      promptId: c.promptId,
      annotatorId: c.annotatorId,
      recordingAId: c.recordingAId,
      recordingBId: c.recordingBId,
      a: systemOf(c.recordingA),
      b: systemOf(c.recordingB),
      winner: c.winner,
      axes: c.axes,
      isDemo: c.isDemo,
      createdAt: c.createdAt.toISOString(),
    })),
    // A check of a clip we no longer count (withdrawn) is left out with it.
    checks: checks.flatMap((c) => {
      const system = systemById.get(c.recordingId);
      return system ? [{ ...c, system }] : [];
    }),
    toneAnswers: answers.flatMap((a) => {
      const system = systemById.get(a.recordingId);
      return system ? [{ system, heard: a.heard, isDemo: a.isDemo }] : [];
    }),
    auto: auto.rows,
    autoTableReady: auto.ready,
    humanLoaded: options.human,
  };
}
