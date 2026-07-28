import type { EvalBucket, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SftSourceRow } from "./training-export";

/**
 * SFT source loader.
 *
 * The platform's Igala gold for supervised fine-tuning lives in TWO tables:
 *   - ColdAuthorAnswer.answerText — the speaker's OWN answer, authored before any
 *     model output is revealed (source-free, the anti-translationese signal). This
 *     is the bulk of the gold (hundreds of rows).
 *   - OutputEdit.correctedText — an annotator's correction of a shown model output.
 *
 * Both are pure Igala targets. Training METADATA that must NEVER leak into a
 * completion — ColdAuthorAnswer.englishGloss / instructionIg, OutputEdit.rationale —
 * is deliberately not read here: only answerText / correctedText become targets.
 *
 * The single most important invariant (held-out prompts NEVER trained on) is
 * enforced downstream by buildSftExamples via the isHoldout flag carried on each
 * row; this loader additionally drops demo rows and rows without training consent.
 */

/** Decoupled-from-Prisma input shape for a cold author answer (source-free gold). */
export interface ColdAnswerInput {
  promptId: string;
  promptText: string;
  answerText: string;
  bucket: EvalBucket | null;
  promptBucket: EvalBucket | null;
  isHoldout: boolean;
  verificationStatus: VerificationStatus;
  consentTraining: boolean;
  isDemo: boolean;
}

/** Decoupled-from-Prisma input shape for an annotator edit. */
export interface EditInput {
  promptId: string;
  promptText: string;
  correctedText: string;
  bucket: EvalBucket | null;
  promptBucket: EvalBucket | null;
  isHoldout: boolean;
  verificationStatus: VerificationStatus;
  consentTraining: boolean;
  isDemo: boolean;
}

/**
 * ColdAuthorAnswer -> SFT source rows. answerText is the pure Igala completion;
 * the English gloss / Igala-instruction metadata is never carried in. Drops demo
 * rows and rows the speaker did not consent to train on.
 */
export function coldAnswersToSftRows(rows: ColdAnswerInput[]): SftSourceRow[] {
  const out: SftSourceRow[] = [];
  for (const r of rows) {
    if (r.isDemo) continue; // demo guard
    if (!r.consentTraining) continue; // consent guard
    if (!r.answerText?.trim()) continue;
    out.push({
      promptId: r.promptId,
      promptText: r.promptText,
      correctedText: r.answerText,
      bucket: r.bucket ?? r.promptBucket,
      isHoldout: r.isHoldout, // contamination guard applied by buildSftExamples
      verificationStatus: r.verificationStatus,
    });
  }
  return out;
}

/** OutputEdit -> SFT source rows. correctedText is the completion; rationale is dropped. */
export function editsToSftRows(rows: EditInput[]): SftSourceRow[] {
  const out: SftSourceRow[] = [];
  for (const r of rows) {
    if (r.isDemo) continue;
    if (!r.consentTraining) continue;
    if (!r.correctedText?.trim()) continue;
    out.push({
      promptId: r.promptId,
      promptText: r.promptText,
      correctedText: r.correctedText,
      bucket: r.bucket ?? r.promptBucket,
      isHoldout: r.isHoldout,
      verificationStatus: r.verificationStatus,
    });
  }
  return out;
}

/**
 * Load all eligible SFT source rows for a job from the live signal: cold author
 * answers (all non-demo, consented) plus output edits (optionally narrowed to the
 * job's sourceEditIds). Held-out prompts are NOT filtered here — that guard is
 * applied by buildSftExamples so the reported row count and the uploaded JSONL are
 * always built from the identical path.
 */
export async function loadSftSourceRows(job: {
  sourceEditIds: string[];
}): Promise<SftSourceRow[]> {
  const cold = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false },
    include: {
      prompt: { select: { text: true, isHoldout: true, bucket: true } },
    },
  });

  const edits = await prisma.outputEdit.findMany({
    where: {
      isDemo: false,
      ...(job.sourceEditIds.length > 0
        ? { id: { in: job.sourceEditIds } }
        : {}),
    },
    include: {
      modelOutput: {
        select: {
          prompt: { select: { text: true, isHoldout: true, bucket: true } },
        },
      },
    },
  });

  const coldRows = coldAnswersToSftRows(
    cold.map((c) => ({
      promptId: c.promptId,
      promptText: c.prompt.text,
      answerText: c.answerText,
      bucket: c.bucket,
      promptBucket: c.prompt.bucket,
      isHoldout: c.prompt.isHoldout,
      verificationStatus: c.verificationStatus,
      consentTraining: c.consentTraining,
      isDemo: c.isDemo,
    })),
  );

  const editRows = editsToSftRows(
    edits.map((e) => ({
      promptId: e.promptId,
      promptText: e.modelOutput.prompt.text,
      correctedText: e.correctedText,
      bucket: e.bucket,
      promptBucket: e.modelOutput.prompt.bucket,
      isHoldout: e.modelOutput.prompt.isHoldout,
      verificationStatus: e.verificationStatus,
      consentTraining: e.consentTraining,
      isDemo: e.isDemo,
    })),
  );

  return [...coldRows, ...editRows];
}
