import type { EvalBucket, VerificationStatus } from "@prisma/client";
import { isFrozenPrompt } from "@/lib/speech/guard";

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
  /** Prompt split ("train" | "dev" | "test"); a "test" prompt is frozen too. */
  split?: string | null;
}

/**
 * Tone-mark pass 2 layers of one pass-1 answer (src/lib/tone). Present only
 * on an answer that got a second pass. The completion that is trained on
 * stays the pass-1 text; these travel beside it, each named by its layer.
 */
export interface ToneLayers {
  /** Every marker's tone-marked copy. */
  pass2: { annotatorId: string; text: string }[];
  /** The agreed pass-2 text, when the markers (or an adjudicator) agreed. */
  agreed: { text: string; method: string } | null;
}

export interface SftSourceRow {
  /** The pass-1 row this completion came from, when the loader knows it. */
  source?: { type: "cold" | "edit"; id: string };
  /** Set only for an answer that got a tone-mark second pass. */
  tone?: ToneLayers;
  promptId: string;
  promptText: string;
  correctedText: string;
  bucket: EvalBucket | null;
  isHoldout: boolean;
  /** Prompt split ("train" | "dev" | "test"); a "test" prompt is frozen too. */
  split?: string | null;
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
  /**
   * Only on an answer that got a tone-mark second pass: the assistant
   * message above is the pass-1 text (`layer: "pass1"`), then every pass-2
   * copy with its marker, then the agreed text. An answer with no second
   * pass has no such key and exports exactly as before.
   */
  tone?: {
    layer: "pass1";
    pass2: { layer: "pass2"; annotatorId: string; text: string }[];
    agreed: { layer: "agreed"; text: string; method: string } | null;
  };
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

/** Held out by flag or by test split; same rule as the speech guard. */
function isFrozen(r: { isHoldout: boolean; split?: string | null }): boolean {
  return isFrozenPrompt({ isHoldout: r.isHoldout, split: r.split ?? "" });
}

/** Build DPO (prompt, chosen, rejected) examples. Drops held-out prompts and degenerate pairs. */
export function buildDpoExamples(
  rows: DpoSourceRow[],
  filters: ExportFilters = {},
): DpoExample[] {
  const out: DpoExample[] = [];
  for (const r of rows) {
    if (isFrozen(r)) continue; // contamination guard
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
    if (isFrozen(r)) continue; // contamination guard
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
    if (r.tone && r.tone.pass2.length > 0) {
      example.tone = {
        layer: "pass1",
        pass2: r.tone.pass2.map((p) => ({
          layer: "pass2",
          annotatorId: p.annotatorId,
          text: p.text,
        })),
        agreed: r.tone.agreed
          ? {
              layer: "agreed",
              text: r.tone.agreed.text,
              method: r.tone.agreed.method,
            }
          : null,
      };
    }
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
