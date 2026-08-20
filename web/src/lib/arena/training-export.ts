import type { EvalBucket, VerificationStatus } from "@prisma/client";

/**
 * Training-set export. Turns the platform's collected signal into clean
 * training data:
 *   - pairwise winner/loser  -> DPO triples (chosen / rejected)
 *   - annotator edits        -> SFT (prompt -> corrected completion)
 *
 * The single most important invariant: held-out (test-split) prompts are NEVER
 * exported. Improvement on a benchmark that leaked into training is meaningless.
 *
 * PROVENANCE (2026-08-20 pivot precondition, tasks/annotation-pivot-decision.md):
 * every SFT row carries where its completion came from -
 *   - "cold_sourcefree": authored before any model output was revealed. The
 *     anti-translationese core (Toral 2019: post-edited text inherits the
 *     machine's distribution even when quality metrics call it equivalent).
 *   - "cold_salvage": authored fresh, but AFTER seeing rejected model outputs
 *     (the both-inadequate salvage path). Post-exposure, separately weightable.
 *   - "edit": an annotator's correction of a shown model output. Post-editese
 *     by construction.
 * Default export = cold only. Edits enter ONLY behind an explicit flag
 * (includeEdits) and are capped (maxEditShare, default 30% of the emitted
 * set), so edited text can never silently become indistinguishable from cold
 * gold in a training set.
 */

export type SftProvenance = "cold_sourcefree" | "cold_salvage" | "edit";

export interface DpoSourceRow {
  promptId: string;
  promptText: string;
  chosenText: string;
  rejectedText: string;
  bucket: EvalBucket | null;
  isHoldout: boolean;
}

export interface SftSourceRow {
  promptId: string;
  promptText: string;
  correctedText: string;
  bucket: EvalBucket | null;
  isHoldout: boolean;
  verificationStatus: VerificationStatus;
  /** Where the completion came from. See SftProvenance above. */
  provenance: SftProvenance;
}

export interface DpoExample {
  prompt: string;
  chosen: string;
  rejected: string;
  bucket: EvalBucket | null;
}

export interface SftExample {
  messages: { role: "user" | "assistant"; content: string }[];
  bucket: EvalBucket | null;
  /** Carried into the JSONL so an exported set is self-auditing. */
  provenance: SftProvenance;
}

const VERIFICATION_RANK: Record<VerificationStatus, number> = {
  seed: 0,
  single_annotator: 1,
  multi_annotator_verified: 2,
  expert_reviewed: 3,
};

/** Default cap on the edit share of any export that includes edits. */
export const DEFAULT_MAX_EDIT_SHARE = 0.3;

export interface ExportFilters {
  buckets?: EvalBucket[];
  minVerification?: VerificationStatus;
  /**
   * Let "edit"-provenance rows into the SFT export at all. Defaults to FALSE:
   * a plain export is cold-only, so post-editese cannot contaminate the SFT
   * corpus by omission of a flag.
   */
  includeEdits?: boolean;
  /**
   * With includeEdits, the maximum fraction of the EMITTED examples that may
   * be edits (default DEFAULT_MAX_EDIT_SHARE = 0.3). Excess edits are dropped
   * deterministically from the end of the row order.
   */
  maxEditShare?: number;
}

/** Build DPO (prompt, chosen, rejected) examples. Drops held-out prompts and degenerate pairs. */
export function buildDpoExamples(
  rows: DpoSourceRow[],
  filters: ExportFilters = {},
): DpoExample[] {
  const out: DpoExample[] = [];
  for (const r of rows) {
    if (r.isHoldout) continue; // contamination guard
    if (!r.chosenText || !r.rejectedText) continue;
    if (r.chosenText.trim() === r.rejectedText.trim()) continue;
    if (filters.buckets && filters.buckets.length > 0) {
      if (!r.bucket || !filters.buckets.includes(r.bucket)) continue;
    }
    out.push({
      prompt: r.promptText,
      chosen: r.chosenText,
      rejected: r.rejectedText,
      bucket: r.bucket,
    });
  }
  return out;
}

/**
 * Build SFT (prompt -> corrected Igala) examples. Drops held-out prompts and
 * low-verification rows. Edit-provenance rows are excluded unless
 * includeEdits is set, and even then capped at maxEditShare of the emitted
 * set (cold rows are never dropped by the cap - only excess edits are).
 */
export function buildSftExamples(
  rows: SftSourceRow[],
  filters: ExportFilters = {},
): SftExample[] {
  const minRank =
    filters.minVerification !== undefined
      ? VERIFICATION_RANK[filters.minVerification]
      : 0;
  const includeEdits = filters.includeEdits ?? false;
  const maxEditShare = filters.maxEditShare ?? DEFAULT_MAX_EDIT_SHARE;

  const cold: SftExample[] = [];
  const edits: SftExample[] = [];
  for (const r of rows) {
    if (r.isHoldout) continue; // contamination guard
    if (!r.correctedText?.trim()) continue;
    if (r.provenance === "edit" && !includeEdits) continue;
    if (VERIFICATION_RANK[r.verificationStatus] < minRank) continue;
    if (filters.buckets && filters.buckets.length > 0) {
      if (!r.bucket || !filters.buckets.includes(r.bucket)) continue;
    }
    const example: SftExample = {
      messages: [
        { role: "user", content: r.promptText },
        { role: "assistant", content: r.correctedText },
      ],
      bucket: r.bucket,
      provenance: r.provenance,
    };
    (r.provenance === "edit" ? edits : cold).push(example);
  }

  if (edits.length === 0) return cold;

  // Cap: edits may make up at most maxEditShare of the final set.
  // maxEdits solves edits <= share * (cold + edits) for the largest integer.
  const maxEdits =
    maxEditShare >= 1
      ? edits.length
      : Math.floor((maxEditShare * cold.length) / (1 - maxEditShare));
  return [...cold, ...edits.slice(0, Math.max(0, maxEdits))];
}

/** Serialize any array of records to JSON Lines. */
export function toJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}
