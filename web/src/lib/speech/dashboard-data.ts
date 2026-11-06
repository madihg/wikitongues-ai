import type { PrismaClient } from "@prisma/client";
import { loadLedger, type Ledger } from "./ledger";
import {
  buildOvernight,
  type MetricSet,
  type OvernightCandidate,
  type OvernightView,
} from "./overnight";

/**
 * Everything /admin/speech shows, as plain JSON-safe values. Explicit selects
 * only; the one recording read selects id and duration, never audio.
 */

export interface CandidateRow {
  id: string;
  system: string;
  modelRef: string;
  createdAt: string;
  regressed: boolean;
  retrainRequired: boolean;
  promoted: boolean;
  promoteReason: string | null;
  metrics: MetricSet | null;
}

export interface TrendPoint {
  at: string;
  cer: number;
  ter: number;
  trainingHours: number | null;
}

export interface AlertRow {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
}

export interface Dashboard {
  overnight: OvernightView | null;
  ledger: Ledger;
  trend: TrendPoint[];
  candidates: CandidateRow[];
  alerts: AlertRow[];
  loop: {
    paused: boolean;
    monthlyCapUsd: number;
    monthSpendUsd: number;
    lastAsrRunAt: string | null;
    lastTtsRunAt: string | null;
  };
}

const DAY = 86_400_000;
const metricsOf = (r: {
  cer: number;
  werStripped: number;
  werRetained: number;
  ter: number;
}): MetricSet => ({
  cer: r.cer,
  werStripped: r.werStripped,
  werRetained: r.werRetained,
  ter: r.ter,
});

export async function loadDashboard(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<Dashboard> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [run, cands, results, state, alerts, ledger, spend] = await Promise.all([
    db.speechNightlyRun.findFirst({
      orderBy: { runDate: "desc" },
      select: { id: true, runDate: true, outcome: true, stepLog: true, costUsd: true },
    }),
    db.speechCandidate.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        system: true,
        modelRef: true,
        jobId: true,
        createdAt: true,
        regressed: true,
        retrainRequired: true,
        promotedAt: true,
        promoteReason: true,
        evalResult: {
          select: { cer: true, werStripped: true, werRetained: true, ter: true },
        },
      },
    }),
    db.speechEvalResult.findMany({
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { modelRef: true, createdAt: true, cer: true, ter: true },
    }),
    db.speechLoopState.findUnique({
      where: { id: 1 },
      select: { paused: true, monthlyCapUsd: true, lastAsrRunAt: true, lastTtsRunAt: true },
    }),
    db.speechAlert.findMany({
      where: { readAt: null, createdAt: { gte: new Date(now.getTime() - 3 * DAY) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, kind: true, message: true, createdAt: true },
    }),
    loadLedger(db),
    db.costEntry.aggregate({
      _sum: { amountUsd: true },
      where: {
        category: "finetune",
        refType: "speech_train_job",
        createdAt: { gte: monthStart },
      },
    }),
  ]);

  // Training hours behind each scored model: its train job's clip ids, summed.
  const refs = [...new Set(results.map((r) => r.modelRef))];
  const trainJobs = refs.length
    ? await db.speechTrainJob.findMany({
        where: { outputRef: { in: refs } },
        select: { outputRef: true, manifestLines: true },
      })
    : [];
  const idsByRef = new Map<string, string[]>();
  for (const j of trainJobs) {
    if (!j.outputRef || !Array.isArray(j.manifestLines)) continue;
    idsByRef.set(
      j.outputRef,
      (j.manifestLines as Array<{ id?: unknown }>)
        .map((l) => l.id)
        .filter((x): x is string => typeof x === "string"),
    );
  }
  const allIds = [...new Set([...idsByRef.values()].flat())];
  const durations = allIds.length
    ? await db.speechRecording.findMany({
        where: { id: { in: allIds } },
        select: { id: true, durationMs: true },
      })
    : [];
  const ms = new Map(durations.map((d) => [d.id, d.durationMs]));
  const hoursOf = (ref: string) => {
    const ids = idsByRef.get(ref);
    return ids ? ids.reduce((t, id) => t + (ms.get(id) ?? 0), 0) / 3_600_000 : null;
  };

  const withMetrics: OvernightCandidate[] = cands.flatMap((c) =>
    c.evalResult
      ? [{ id: c.id, jobId: c.jobId, regressed: c.regressed, metrics: metricsOf(c.evalResult) }]
      : [],
  );
  const promoted = cands.find((c) => c.system === "asr" && c.promotedAt && c.evalResult);

  let overnight: OvernightView | null = null;
  if (run) {
    const finish = Array.isArray(run.stepLog)
      ? (run.stepLog as Array<Record<string, unknown>>).find((e) => e?.step === "finish")
      : undefined;
    const jobIds = (Array.isArray(finish?.launched) ? finish.launched : [])
      .map((l: { jobId?: unknown }) => l?.jobId)
      .filter((x: unknown): x is string => typeof x === "string");
    const cost = jobIds.length
      ? await db.costEntry.aggregate({
          _sum: { amountUsd: true },
          where: { refType: "speech_train_job", refId: { in: jobIds } },
        })
      : null;
    overnight = buildOvernight(
      run,
      withMetrics,
      promoted?.evalResult ? metricsOf(promoted.evalResult) : null,
      cost?._sum.amountUsd ?? null,
    );
  }

  return {
    overnight,
    ledger,
    trend: results.map((r) => ({
      at: r.createdAt.toISOString(),
      cer: r.cer,
      ter: r.ter,
      trainingHours: hoursOf(r.modelRef),
    })),
    candidates: cands.map((c) => ({
      id: c.id,
      system: c.system,
      modelRef: c.modelRef,
      createdAt: c.createdAt.toISOString(),
      regressed: c.regressed,
      retrainRequired: c.retrainRequired,
      promoted: c.promotedAt !== null,
      promoteReason: c.promoteReason,
      metrics: c.evalResult ? metricsOf(c.evalResult) : null,
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      kind: a.kind,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
    loop: {
      paused: state?.paused ?? false,
      monthlyCapUsd: state?.monthlyCapUsd ?? 200,
      monthSpendUsd: spend._sum.amountUsd ?? 0,
      lastAsrRunAt: state?.lastAsrRunAt?.toISOString() ?? null,
      lastTtsRunAt: state?.lastTtsRunAt?.toISOString() ?? null,
    },
  };
}
