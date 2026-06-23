import type { EvalBucket, VerificationStatus } from "@prisma/client";

/**
 * Training-set export. Turns the platform's collected signal into clean
 * training data:
 *   - pairwise winner/loser  -> DPO triples (chosen / rejected)
 *   - annotator edits        -> SFT (prompt -> corrected completion)
 *
 * The single most important invariant: held-out (test-split) prompts are NEVER
 * exported. Improvement on a benchmark that leaked into training is meaningless.
 */

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
}

const VERIFICATION_RANK: Record<VerificationStatus, number> = {
  seed: 0,
  single_annotator: 1,
  multi_annotator_verified: 2,
  expert_reviewed: 3,
};

export interface ExportFilters {
  buckets?: EvalBucket[];
  minVerification?: VerificationStatus;
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

/** Build SFT (prompt -> corrected Igala) examples. Drops held-out prompts and low-verification edits. */
export function buildSftExamples(
  rows: SftSourceRow[],
  filters: ExportFilters = {},
): SftExample[] {
  const minRank =
    filters.minVerification !== undefined
      ? VERIFICATION_RANK[filters.minVerification]
      : 0;
  const out: SftExample[] = [];
  for (const r of rows) {
    if (r.isHoldout) continue; // contamination guard
    if (!r.correctedText?.trim()) continue;
    if (VERIFICATION_RANK[r.verificationStatus] < minRank) continue;
    if (filters.buckets && filters.buckets.length > 0) {
      if (!r.bucket || !filters.buckets.includes(r.bucket)) continue;
    }
    out.push({
      messages: [
        { role: "user", content: r.promptText },
        { role: "assistant", content: r.correctedText },
      ],
      bucket: r.bucket,
    });
  }
  return out;
}

/** Serialize any array of records to JSON Lines. */
export function toJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}
