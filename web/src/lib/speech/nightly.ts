import type { Prisma, SpeechNightlyRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { canTrain } from "./can-train";
import { decide } from "./decide";
import { BASE_MODELS, estimateCostUsd, isStudioRow } from "./loop-config";
import {
  buildSigned,
  launchSpeechJob,
  loopProvider,
  monthSpendUsd,
  scoreModel,
  type LoopJobKind,
} from "./loop-launch";
import { loadTestSetRows, loadTrainableRows } from "./loop-rows";
import {
  buildEvalManifest,
  buildTrainingManifest,
  type LoopRow,
} from "./training-manifest";
import type { SpeechTrainProvider } from "./train-providers";
import { retrainRequired, withdrawnSpeakerIds } from "./withdrawal";

/**
 * One night of the speech loop (POST /api/speech/nightly). Steps, each logged
 * into SpeechNightlyRun.stepLog as {step, ok, ...numbers and ids}:
 *
 *   poll        ask the worker about running jobs; fail the ones it lost
 *   withdrawal  mark the promoted model "retrain required" when a speaker
 *               who trained it has since withdrawn
 *   ingest      count the kept, consented, non-demo, non-test clips
 *   decide      decide() says whether to train ASR and TTS tonight
 *   launch      build manifests, create jobs, call the worker
 *   score       evaluate any trained model that is not yet scored
 *   transcribe  transcribe new clips so the Check panel has a transcript
 *
 * A step that throws is captured as {ok: false, error} and the run goes on.
 * Nothing is thrown to the caller: the cron only needs the row. The log holds
 * counts, reasons and ids, never clip text.
 */

export type StepEntry = { step: string; ok: boolean } & Record<string, unknown>;

const MINUTE = 60_000;
/** A job the worker calls "done" but that never called back is lost after this long. */
const LOST_CALLBACK_MS = 60 * MINUTE;

const utcDate = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);
const minutes = (rows: { durationMs: number }[]) =>
  rows.reduce((t, r) => t + r.durationMs, 0) / MINUTE;
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function runNightly(
  now: Date = new Date(),
  provider: SpeechTrainProvider = loopProvider(),
): Promise<{ run: SpeechNightlyRun; created: boolean }> {
  const runDate = utcDate(now);
  const existing = await prisma.speechNightlyRun.findUnique({ where: { runDate } });
  if (existing) return { run: existing, created: false };

  let run: SpeechNightlyRun;
  try {
    run = await prisma.speechNightlyRun.create({
      data: { runDate, outcome: "running", stepLog: [], startedAt: now },
    });
  } catch (e) {
    // Two calls raced for the same date: the other one owns the run.
    const other = await prisma.speechNightlyRun.findUnique({ where: { runDate } });
    if (other) return { run: other, created: false };
    throw e;
  }

  const log: StepEntry[] = [];
  const launched: Array<{ jobId: string; kind: LoopJobKind }> = [];
  let errors = 0;

  async function step(
    name: string,
    fn: () => Promise<Record<string, unknown> | void>,
  ): Promise<boolean> {
    try {
      log.push({ step: name, ok: true, ...((await fn()) ?? {}) });
      return true;
    } catch (e) {
      errors += 1;
      log.push({ step: name, ok: false, error: errText(e) });
      return false;
    }
  }

  async function launch(
    plan: Parameters<typeof launchSpeechJob>[0],
  ): Promise<string | null> {
    try {
      const id = await launchSpeechJob(plan, provider, now);
      launched.push({ jobId: id, kind: plan.kind });
      return id;
    } catch (e) {
      errors += 1;
      log.push({ step: `launch_${plan.kind}`, ok: false, error: errText(e) });
      await notify("job_failed", [`${plan.kind} could not start: ${errText(e)}`], {
        now,
        runId: run.id,
      });
      return null;
    }
  }

  let outcome = "failed";
  try {
    const state = (await prisma.speechLoopState.findUnique({ where: { id: 1 } })) ?? {
      paused: false,
      monthlyCapUsd: 200,
      lastAsrRunAt: null,
      lastTtsRunAt: null,
    };
    const spend = await monthSpendUsd(now);
    const blocked: "paused" | "cap" | null = state.paused
      ? "paused"
      : spend >= state.monthlyCapUsd
        ? "cap"
        : null;

    // poll
    await step("poll", async () => {
      const pending = await prisma.speechTrainJob.findMany({
        where: { status: { in: ["queued", "running"] }, externalId: { not: null } },
        select: { id: true, kind: true, externalId: true, startedAt: true },
      });
      const failed: string[] = [];
      for (const j of pending) {
        const status = await provider.status(j.externalId as string);
        const lost =
          status === "done" &&
          j.startedAt !== null &&
          now.getTime() - j.startedAt.getTime() > LOST_CALLBACK_MS;
        if (status !== "failed" && !lost) continue;
        const res = await prisma.speechTrainJob.updateMany({
          where: { id: j.id, status: { in: ["queued", "running"] } },
          data: {
            status: "failed",
            error:
              status === "failed"
                ? "the worker reported the job failed"
                : "the worker finished but no callback arrived",
            completedAt: now,
          },
        });
        if (res.count > 0) failed.push(j.id);
      }
      if (failed.length > 0) {
        await notify("job_failed", [`jobs failed: ${failed.join(", ")}`], {
          now,
          runId: run.id,
        });
      }
      return { pending: pending.length, failed };
    });

    // withdrawal
    await step("withdrawal", async () => {
      const [promoted, grants] = await Promise.all([
        prisma.speechCandidate.findMany({
          where: { promotedAt: { not: null } },
          select: {
            id: true,
            retrainRequired: true,
            job: { select: { manifestLines: true } },
          },
        }),
        prisma.consentGrant.findMany({
          select: { userId: true, grantedAt: true, withdrawn: true },
        }),
      ]);
      const gone = withdrawnSpeakerIds(grants);
      const flagged: Array<{ candidateId: string; clipIds: string[] }> = [];
      for (const c of promoted) {
        const lines = c.job?.manifestLines as
          | Array<{ id: string; speakerPseudonym: string }>
          | null
          | undefined;
        if (!Array.isArray(lines)) continue;
        const r = retrainRequired(gone, lines);
        if (!r.required) continue;
        if (!c.retrainRequired) {
          await prisma.speechCandidate.update({
            where: { id: c.id },
            data: { retrainRequired: true },
          });
        }
        flagged.push({ candidateId: c.id, clipIds: r.clipIds });
      }
      return { withdrawnSpeakers: gone.length, retrainRequired: flagged };
    });

    // ingest
    let rows: LoopRow[] = [];
    let eligible: LoopRow[] = [];
    let newAsrMinutes = 0;
    let newStudioMinutes = 0;
    let studioTotalHours = 0;
    const ingested = await step("ingest", async () => {
      rows = await loadTrainableRows(prisma);
      eligible = rows.filter((r) => canTrain(r, { scope: "internal", purpose: "asr" }).ok);
      const prev = await prisma.speechNightlyRun.findFirst({
        where: { runDate: { lt: runDate } },
        orderBy: { runDate: "desc" },
        select: { startedAt: true },
      });
      const since = (r: LoopRow, at: Date | null) =>
        !at || (r.uploadedAt !== null && r.uploadedAt > at);
      const fresh = eligible.filter((r) => since(r, prev?.startedAt ?? null));
      const studio = eligible.filter(isStudioRow);
      newAsrMinutes = minutes(eligible.filter((r) => since(r, state.lastAsrRunAt)));
      newStudioMinutes = minutes(studio.filter((r) => since(r, state.lastTtsRunAt)));
      studioTotalHours = minutes(studio) / 60;
      return {
        newClips: fresh.length,
        newHours: round1(minutes(fresh) / 60),
        newAsrMinutes: round1(newAsrMinutes),
        newStudioMinutes: round1(newStudioMinutes),
        studioTotalHours: round1(studioTotalHours),
      };
    });

    // decide
    const decision = decide({
      newAsrMinutes,
      newStudioMinutes,
      studioTotalHours,
      lastAsrRunAt: state.lastAsrRunAt,
      lastTtsRunAt: state.lastTtsRunAt,
      paused: state.paused,
      monthSpendUsd: spend,
      monthlyCapUsd: state.monthlyCapUsd,
      now,
    });
    log.push({
      step: "decide",
      ok: true,
      asr: decision.asr,
      tts: decision.tts,
      reasons: decision.reasons,
      monthSpendUsd: Math.round(spend * 100) / 100,
      monthlyCapUsd: state.monthlyCapUsd,
    });
    if (blocked === "cap") {
      await notify(
        "cap_reached",
        [`month spend ${spend.toFixed(2)} has reached the cap ${state.monthlyCapUsd.toFixed(2)}`],
        { now, runId: run.id },
      );
    }

    // launch
    if (ingested && blocked === null && (decision.asr === "train" || decision.tts === "train")) {
      const examLines = buildEvalManifest(await loadTestSetRows(prisma), {
        scope: "internal",
        purpose: "asr",
        signedUrl: (k) => k,
      }).lines.length;
      if (examLines === 0) {
        log.push({ step: "launch", ok: false, error: "frozen_set_missing: the exam set has 0 usable clips" });
        await notify("frozen_set_missing", ["the exam set has 0 usable clips; nothing launched"], {
          now,
          runId: run.id,
        });
      } else {
        if (decision.asr === "train") {
          await step("launch_asr", async () => {
            const m = await buildSigned(buildTrainingManifest, rows, "asr", provider);
            const devIds = new Set(
              rows
                .filter((r) => r.prompt?.split === "dev")
                .map((r) => r.id),
            );
            const lines = m.lines.filter((l) => !devIds.has(l.id));
            if (lines.length === 0) return { launched: false, reason: "no usable clips" };
            const jobId = await launch({
              kind: "train_asr",
              system: "asr",
              baseModel: BASE_MODELS.asr,
              manifestVersion: m.version,
              manifest: { lines, devLines: m.lines.filter((l) => devIds.has(l.id)) },
              recordLines: true,
            });
            if (jobId) {
              await prisma.speechLoopState.upsert({
                where: { id: 1 },
                create: { id: 1, lastAsrRunAt: now },
                update: { lastAsrRunAt: now },
              });
            }
            return { jobId, clips: lines.length, manifestVersion: m.version };
          });
        }
        if (decision.tts === "train") {
          await step("launch_tts", async () => {
            const studio = rows.filter(isStudioRow);
            const m = await buildSigned(buildTrainingManifest, studio, "tts", provider);
            if (m.lines.length === 0) return { launched: false, reason: "no usable clips" };
            const jobId = await launch({
              kind: "train_tts",
              system: "tts",
              baseModel: BASE_MODELS.tts,
              manifestVersion: m.version,
              manifest: { lines: m.lines },
              recordLines: true,
            });
            if (jobId) {
              await prisma.speechLoopState.upsert({
                where: { id: 1 },
                create: { id: 1, lastTtsRunAt: now },
                update: { lastTtsRunAt: now },
              });
            }
            return { jobId, clips: m.lines.length, manifestVersion: m.version };
          });
        }
      }
    }

    // score: trained models that no evaluate has picked up yet
    await step("score", async () => {
      const trained = await prisma.speechTrainJob.findMany({
        where: { kind: "train_asr", status: "succeeded", outputRef: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { outputRef: true },
      });
      const results: Array<{ launched: boolean; reason?: string; jobId?: string }> = [];
      for (const t of trained) {
        const r = await scoreModel(t.outputRef as string, provider, now);
        if (r.launched) launched.push({ jobId: r.jobId, kind: "evaluate" });
        results.push(r);
      }
      return { models: trained.length, results };
    });

    // transcribe
    if (blocked === null) {
      await step("transcribe", async () => {
        const promoted = await prisma.speechCandidate.findFirst({
          where: { system: "asr", promotedAt: { not: null } },
          select: { modelRef: true },
        });
        const modelRef = promoted?.modelRef ?? "base";
        const prev = await prisma.speechNightlyRun.findFirst({
          where: { runDate: { lt: runDate } },
          orderBy: { runDate: "desc" },
          select: { startedAt: true },
        });
        const done = new Set(
          (
            await prisma.speechTranscript.findMany({
              where: { modelRef },
              select: { recordingId: true },
            })
          ).map((t) => t.recordingId),
        );
        const fresh = eligible.filter(
          (r) =>
            !done.has(r.id) &&
            (!prev || (r.uploadedAt !== null && r.uploadedAt > prev.startedAt)),
        );
        if (fresh.length === 0) return { clips: 0 };
        const m = await buildSigned(buildTrainingManifest, fresh, "asr", provider);
        if (m.lines.length === 0) return { clips: 0 };
        const jobId = await launch({
          kind: "transcribe",
          system: "asr",
          baseModel: modelRef,
          modelRef,
          manifestVersion: m.version,
          manifest: { lines: m.lines },
        });
        return { jobId, clips: m.lines.length, modelRef };
      });
    }

    const trainedTonight = launched.some((j) => j.kind.startsWith("train"));
    outcome = trainedTonight ? "trained" : errors > 0 && launched.length === 0 ? "failed" : "skipped";
  } catch (e) {
    errors += 1;
    log.push({ step: "run", ok: false, error: errText(e) });
    outcome = "failed";
  }

  try {
    if (outcome === "skipped") {
      const prev = await prisma.speechNightlyRun.findFirst({
        where: { runDate: { lt: runDate } },
        orderBy: { runDate: "desc" },
        select: { outcome: true },
      });
      if (prev?.outcome === "skipped") {
        await notify("two_skipped_nights", ["the loop trained nothing two nights in a row"], {
          now,
          runId: run.id,
        });
      }
    }
    if (outcome === "failed") {
      await notify("job_failed", [`the nightly run failed with ${errors} error(s); see stepLog`], {
        now,
        runId: run.id,
      });
    }
  } catch {
    // alerts never fail the run
  }

  log.push({
    step: "finish",
    ok: true,
    outcome,
    launched,
  });
  // The mock spends nothing; a real run's estimate is replaced job by job on callback.
  const estimated =
    provider.name === "mock"
      ? 0
      : launched.reduce((t, j) => t + estimateCostUsd(j.kind), 0);
  const finished = await prisma.speechNightlyRun.update({
    where: { id: run.id },
    data: {
      outcome,
      stepLog: log as unknown as Prisma.InputJsonValue,
      costUsd: Math.round(estimated * 100) / 100,
      finishedAt: new Date(),
    },
  });
  return { run: finished, created: true };
}
