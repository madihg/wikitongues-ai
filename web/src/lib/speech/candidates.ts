import type { Prisma } from "@prisma/client";
import type { CallbackPayload } from "./job-callback";
import { REGRESSION } from "./loop-config";

/**
 * Candidate registration (PR F). When an evaluate job succeeds for a model a
 * train job produced, that model becomes a SpeechCandidate, flagged
 * `regressed` when it is clearly worse than the promoted model of its system.
 * Called by the callback route inside the same transaction that wrote the
 * SpeechEvalResult. A baseline evaluate (modelRef "base", no train job) makes
 * no candidate: it is a measurement, not something to promote.
 */

export interface Scored {
  cer: number;
  ter: number;
}

/** Points are percentage points; the stored metrics are fractions. */
export function deltaPoints(next: Scored, promoted: Scored) {
  // Rounded so that exactly 1.0 or 2.0 points is not tipped over by float error.
  const pts = (a: number, b: number) => Math.round((a - b) * 100 * 1e6) / 1e6;
  return { cer: pts(next.cer, promoted.cer), ter: pts(next.ter, promoted.ter) };
}

/** True when CER is more than 1.0 point worse or TER more than 2.0 points worse. */
export function isRegressed(next: Scored, promoted: Scored | null): boolean {
  if (!promoted) return false;
  const d = deltaPoints(next, promoted);
  return d.cer > REGRESSION.cerPoints || d.ter > REGRESSION.terPoints;
}

export interface Registered {
  candidateId: string;
  regressed: boolean;
  /** Percentage points against the promoted model; null with nothing promoted. */
  delta: { cer: number; ter: number } | null;
}

export async function registerCandidate(
  tx: Prisma.TransactionClient,
  p: CallbackPayload,
): Promise<Registered | null> {
  if (p.kind !== "evaluate" || p.status !== "succeeded" || !p.modelRef) {
    return null;
  }
  const modelRef = p.modelRef;
  const train = await tx.speechTrainJob.findFirst({
    where: { outputRef: modelRef, system: "asr" },
    select: { id: true },
  });
  if (!train) return null;
  const existing = await tx.speechCandidate.findUnique({
    where: { modelRef },
    select: { id: true },
  });
  if (existing) return null;
  const result = await tx.speechEvalResult.findFirst({
    where: { jobId: p.jobId, modelRef },
    select: { id: true, cer: true, ter: true },
  });
  if (!result) return null;

  const promoted = await tx.speechCandidate.findFirst({
    where: { system: "asr", promotedAt: { not: null } },
    select: { evalResult: { select: { cer: true, ter: true } } },
  });
  const against = promoted?.evalResult ?? null;
  const regressed = isRegressed(result, against);
  const created = await tx.speechCandidate.create({
    data: {
      system: "asr",
      modelRef,
      jobId: train.id,
      evalResultId: result.id,
      regressed,
    },
    select: { id: true },
  });
  return {
    candidateId: created.id,
    regressed,
    delta: against ? deltaPoints(result, against) : null,
  };
}
