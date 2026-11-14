import { Prisma, type PrismaClient } from "@prisma/client";
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
 * This file is an adapter, on purpose. The tables it reads today are the
 * ones on main: SpeechEvalResult (the recogniser on the exam), SpeechCandidate
 * (versions), SpeechRecording.quality (levels at recording time),
 * SpeechComparison (Listen), SpeechCheck, SpeechMinimalPairAnswer. The speech
 * work is adding two tables for what the worker measures (SpeechAutoMeasure,
 * SpeechClipMeasure). They are read here by name, tolerantly: until their
 * migration is applied the read answers "not there yet" and the page says
 * "Not measured yet". When their row shapes are final, the key names at the
 * top of this file are the only thing to adjust.
 */

// ─── key names in SpeechAutoMeasure.values: adjust here, nowhere else ───────

/** For each number the page shows, the keys it may be stored under, first match wins. */
export const AUTO_KEYS = {
  // kind "asr_three_ways": the recogniser on the exam, with ranges
  cer: ["cer", "cerStripped"],
  werStripped: ["werStripped", "wer"],
  werRetained: ["werRetained", "werToneRetained"],
  ter: ["ter", "toneErrorRate"],
  markedVowels: ["markedVowels", "toneBearing", "nToneVowels"],
  // kind "tts_round_trip": the voice heard back by the recogniser
  cerGap: ["cerGap", "roundTripCerGap"],
  cerModel: ["cerModel", "cerSynth", "cer"],
  cerPerson: ["cerHuman", "cerPerson"],
  terGap: ["terGap", "roundTripTerGap"],
  terModel: ["terModel", "terSynth", "ter"],
  terPerson: ["terHuman", "terPerson"],
  // kind "clip_levels": medians over clips
  peakDbfs: ["peakDbfs", "samplePeakDbfs"],
  speechDbfs: ["speechDbfs", "rmsDbfs", "speechLevelDbfs"],
  noiseDbfs: ["noiseFloorDbfs", "noiseDbfs"],
  snrDb: ["snrDb", "wadaSnrDb"],
  clipped: ["clippedClips", "clipped"],
  // kind "cleaning_check": recogniser on cleaned minus raw, paired
  cleaningCerDelta: ["cerDelta", "cer"],
  cleaningTerDelta: ["terDelta", "ter"],
} as const;

export const AUTO_KINDS = {
  recognition: "asr_three_ways",
  roundTrip: "tts_round_trip",
  levels: "clip_levels",
  cleaning: "cleaning_check",
} as const;

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
  /** Distinct speakers in the exam, from perSpeaker's keys. */
  speakers: number;
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
  db: Pick<PrismaClient, "$queryRaw">,
): Promise<{ rows: AutoMeasureRow[]; ready: boolean }> {
  try {
    const rows = await db.$queryRaw<
      Array<{
        kind: string;
        modelRef: string;
        rulerRef: string;
        manifestVersion: string;
        nClips: number;
        values: unknown;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT "kind", "modelRef", "rulerRef", "manifestVersion", "nClips", "values", "createdAt"
      FROM "SpeechAutoMeasure"
      ORDER BY "createdAt" DESC
      LIMIT 300
    `);
    return {
      ready: true,
      rows: rows.map((r) => ({
        kind: r.kind,
        modelRef: r.modelRef,
        rulerRef: r.rulerRef,
        manifestVersion: r.manifestVersion,
        nClips: Number(r.nClips),
        values: readMeasuredValues(r.values),
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  } catch (e) {
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
  | "$queryRaw"
>;

export async function loadSpeechMeasure(db: Db): Promise<SpeechMeasureData> {
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
      db.speechComparison.findMany({
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
      }),
      db.speechCheck.findMany({
        where: { isDemo: false },
        select: {
          recordingId: true,
          reviewerId: true,
          verdict: true,
          level: true,
          isDemo: true,
        },
      }),
      db.speechMinimalPairAnswer.findMany({
        where: { isDemo: false },
        select: { recordingId: true, heard: true, isDemo: true },
      }),
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
  };
}
