import { isFrozenPrompt, type ExportableRow } from "./guard";
import { REJECTED_REVIEW_STATUSES } from "./limits";

/**
 * The one guard every training read passes (US-037). Pure: a row and a
 * context in, a verdict and a reason out. buildTrainingManifest filters
 * through it and nowhere else; canEvaluate is the mirror used only by
 * buildEvalManifest. Registered in export-paths.test.ts.
 *
 *  - scope "internal": a worker the platform controls; community_only clips
 *    may train there.
 *  - scope "provider": an outside provider; community_only never goes.
 */
export interface TrainContext {
  scope: "internal" | "provider";
  purpose: "asr" | "tts" | "cloning";
}

export type TrainRefusal =
  | "test_set"
  | "demo"
  | "frozen_prompt"
  | "rejected"
  | "no_consent"
  | "not_uploaded"
  | "no_cloning_opt_in"
  | "community_only_provider"
  | "third_party_uncleared"
  | "not_kept"
  | "not_test_set";

export type TrainVerdict = { ok: true } | { ok: false; reason: TrainRefusal };

const no = (reason: TrainRefusal): TrainVerdict => ({ ok: false, reason });

export function canTrain(row: ExportableRow, ctx: TrainContext): TrainVerdict {
  if (row.isTestSet) return no("test_set");
  if (row.isDemo) return no("demo");
  if (row.prompt && isFrozenPrompt(row.prompt)) return no("frozen_prompt");
  if (row.reviewStatus && REJECTED_REVIEW_STATUSES.includes(row.reviewStatus)) {
    return no("rejected");
  }
  if (row.consentId === null) return no("no_consent");
  if (row.uploadedAt === null) return no("not_uploaded");
  if (ctx.purpose === "cloning" && !row.voiceCloningOptIn) {
    return no("no_cloning_opt_in");
  }
  if (ctx.scope === "provider" && row.tier === "community_only") {
    return no("community_only_provider");
  }
  if (row.sourceType === "third_party" && row.rightsStatus !== "cleared") {
    return no("third_party_uncleared");
  }
  // Last, so a more specific reason above wins: only a reviewed "keep" trains.
  if (row.reviewStatus !== "keep") return no("not_kept");
  return { ok: true };
}

/**
 * The same checks for an exam clip: the row must BE in the test set, and a
 * frozen prompt is expected there (freezing forces isTestSet), so the two
 * checks canTrain makes for those are lifted. Everything else still applies.
 */
export function canEvaluate(
  row: ExportableRow,
  ctx: TrainContext,
): TrainVerdict {
  if (!row.isTestSet) return no("not_test_set");
  return canTrain({ ...row, isTestSet: false, prompt: null }, ctx);
}
