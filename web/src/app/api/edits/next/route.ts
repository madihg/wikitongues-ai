import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeQueueState } from "@/lib/pairing";
import { loadCorrectionInputs, loadQueueInputs } from "@/lib/queue-input";

/**
 * Serve the next correction task (the editing ground's standalone lane,
 * tasks/editing-ground-spec.md). One OUTPUT at a time, own-verdicts-only:
 * the annotator already judged this output and already explained the verdict
 * in English - the lane replays that context and asks them to apply it.
 *
 * Servability (resolved by loadCorrectionInputs + computeQueueState, the same
 * loader/pure-function pair /api/annotator/summary uses, so counts can never
 * drift): pool-arm outputs only, never held-out prompts, only outputs this
 * annotator judged as winner / tie / both-inadequate (pure losers are not
 * served - the winner from the same comparison is the better target), no
 * existing non-demo edit from anyone, prompt not edit-skipped by this
 * annotator. Serving order is verdict age (oldest judgments first); within a
 * comparison the winner side first, else A before B - deterministic, so
 * refreshing never shuffles.
 *
 * The response carries NO model name anywhere: the lane inherits pairwise
 * blindness. The lane is hidden in demo mode (v1) - no demo param here.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const annotatorId = session.user.id;

  const [
    { byPromptId, queuePrompts },
    { correctionInputs, servableByPromptId },
  ] = await Promise.all([loadQueueInputs(), loadCorrectionInputs(annotatorId)]);

  // Only `corrections` is consumed here, and it does not depend on the
  // done/skipped sets (own-verdict servability already implies "done"), so
  // empty sets are passed rather than re-querying the annotator's history.
  const { corrections } = computeQueueState(
    queuePrompts,
    new Set(),
    new Set(),
    correctionInputs,
  );
  const waiting = corrections.length;

  for (const candidate of corrections) {
    const targets = servableByPromptId.get(candidate.promptId);
    if (!targets || targets.length === 0) continue; // defensive
    const target = targets[0];
    const prompt = byPromptId.get(candidate.promptId);
    if (!prompt) continue; // defensive: catalogue and verdicts should agree

    return NextResponse.json({
      complete: false,
      progress: { waiting },
      task: {
        prompt: {
          id: prompt.id,
          promptId: prompt.promptId,
          bucket: prompt.bucket,
          text: prompt.text,
          targetCulture: prompt.targetCulture,
        },
        // text is NFC - exactly what the editor diffs against and what
        // segment offsets address. No model name (the lane stays blind).
        output: { id: target.modelOutputId, text: target.outputTextNfc },
        verdict: {
          role: target.role,
          explanation: target.explanation,
          failureTags: target.failureTags,
        },
      },
    });
  }

  return NextResponse.json({ complete: true, progress: { waiting: 0 } });
}
