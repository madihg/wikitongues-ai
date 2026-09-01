import type { GenerateArgs } from "@/lib/arena/providers";
import type { RetrievalV4Result } from "@/lib/arena/retrieval-v4";
import { buildUserTurnV4, IGALA_SYSTEM_V4 } from "@/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";
import type { RepairCheckOptions } from "@/lib/arena/repair-round";

/**
 * The v4-family SERVING ASSEMBLY, extracted as one pure function so a frozen
 * exam and the live eval-generation route cannot drift apart.
 *
 * WHY THIS EXISTS
 * ---------------
 * scripts/exam-rag-v4-1.ts was written to mirror the rag-v4-1 branch of
 * src/app/api/arena/eval-runs/[id]/generate/route.ts byte for byte, and its
 * header says exactly why: "an output stored here must be indistinguishable
 * from one the route would store, or the frozen numbers describe a system
 * nobody can chat with". That mirroring was a copy, and a copy holds only
 * until someone edits one side. Running the frozen exam for a SECOND version
 * label (rag-v4) would have meant a second copy, so the assembly moved here
 * and both labels are now one switch with a test on it.
 *
 * WHAT IS AND IS NOT IN HERE
 * --------------------------
 * The retrieval call itself (buildRetrievalV4) stays at the call site: it
 * needs Prisma, and it is IDENTICAL for both labels - v4.1 is "the same
 * retrieval with a different system prompt plus the repair round", which is
 * precisely the difference this function encodes:
 *
 *   rag-v4    -> IGALA_SYSTEM_V4    , no repair round
 *   rag-v4-1  -> IGALA_SYSTEM_V4_1  , repair round
 *
 * The repair round is not decided here either. generateWithRepairRound keys
 * off the candidate's versionLabel and is a documented, unit-tested no-op
 * passthrough for every label except rag-v4-1, so a caller that wraps BOTH
 * labels in it (as the route does) gets "no repair round for rag-v4" for
 * free, from the one implementation that ships to users. `runsRepairRound`
 * below is exported for reporting and for assertions, never as a second
 * decision procedure.
 *
 * R8.3: allowTone is true exactly when the question itself asks about tone -
 * the same /\btone/i test the serving routes apply to the RAW question text.
 */

/** The version labels whose serving path is the v4 retrieval assembly. */
export const V4_FAMILY_VERSION_LABELS = ["rag-v4", "rag-v4-1"] as const;

export type V4FamilyVersionLabel = (typeof V4_FAMILY_VERSION_LABELS)[number];

export function isV4FamilyVersionLabel(
  label: string | null | undefined,
): label is V4FamilyVersionLabel {
  return (V4_FAMILY_VERSION_LABELS as readonly string[]).includes(
    label as string,
  );
}

/** The system prompt served for a v4-family label. */
export function systemPromptForVersion(label: V4FamilyVersionLabel): string {
  return label === "rag-v4-1" ? IGALA_SYSTEM_V4_1 : IGALA_SYSTEM_V4;
}

/**
 * True when this label's serving path runs the deterministic repair round.
 * Mirrors REPAIR_ROUND_VERSION_LABEL; pinned equal to it by test so the two
 * can never disagree.
 */
export function runsRepairRound(label: V4FamilyVersionLabel): boolean {
  return label === "rag-v4-1";
}

export interface ExamTurn {
  args: GenerateArgs;
  opts: RepairCheckOptions;
}

/**
 * Assemble one prompt's request exactly as the eval-generation route does for
 * the v4 family.
 */
export function buildV4FamilyTurn(
  label: V4FamilyVersionLabel,
  prompt: { text: string; bucket: string | null },
  retrieval: RetrievalV4Result,
): ExamTurn {
  return {
    args: {
      userMessage: buildUserTurnV4(prompt.text, retrieval, prompt.bucket),
      goldExamples: retrieval.exampleTurns,
      systemPromptOverride: systemPromptForVersion(label),
    },
    opts: { allowTone: /\btone/i.test(prompt.text) },
  };
}
