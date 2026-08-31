import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchRag } from "@/lib/rag";
import {
  bucketWatchFor,
  bucketScoring,
  isFactualBucket,
  isGoldFirstBucket,
  axesForBucket,
} from "@/lib/buckets";
import {
  assignedPair,
  computeQueueState,
  goldFirstFor,
  laneFor,
} from "@/lib/pairing";
import { loadQueueInputs } from "@/lib/queue-input";

/**
 * Serve the next annotation task. The response carries everything the
 * episode needs:
 *   - goldFirst: ask the annotator to author their own answer before models show
 *   - watchFor:  the per-bucket fail-mode to look for
 *   - scoring:   "subjective" (blind) vs "factual" (scored against a reference)
 *   - reference: RAG snippets + expected context, ONLY for factual buckets
 *
 * Each annotator sees each prompt AT MOST ONCE, and which model pair they get
 * for a prompt is decided by assignedPair() (src/lib/pairing.ts) - see that
 * file for why this spreads C(n,2) coverage across the team instead of every
 * annotator getting the same first couple of pairs.
 *
 * Since the 2026-08-20 pivot (tasks/annotation-pivot-decision.md), the prompt
 * catalogue, the pairing-pool output filter and the lane ordering all come
 * from loadQueueInputs() + computeQueueState(), shared verbatim with
 * /api/annotator/summary: pairs are drawn only from pool-arm outputs, frozen
 * prompts stay out of the pairwise queue, zero-gold prompts are served first,
 * and strong-pair episodes interleave 2:1 against long-form cold-mandatory
 * ones. goldFirst is mandatory on zero-gold and long-form prompts, optional
 * (skipped) once a prompt holds >= 2 gold answers, and the per-bucket default
 * in between. The episode itself - inline edit, failure tags, rubric - is
 * unchanged.
 *
 * A prompt is excluded from an annotator's remaining queue once they have ANY
 * non-demo comparison for it (covers history from the old scheme, regardless
 * of which pair was done) or once they've flagged it - either the explicit
 * skip (reason "skip" via /api/annotations/skip) or a malformed-prompt flag
 * (/api/annotations/flag): someone who just told us a prompt is broken must
 * not be served that same prompt again on the next fetch.
 *
 * Demo mode (?demo=<sessionId>) serves the first eligible prompt's pair
 * regardless of history, so a live walkthrough always has something to show.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const annotatorId = session.user.id;
  const demoSessionId = new URL(req.url).searchParams.get("demo");
  const isDemo = !!demoSessionId;

  const { byPromptId, queuePrompts } = await loadQueueInputs();

  // (2026-08-28 rework: the all-caught-up screen's corrections cross-link is
  // gone - corrections now happen inside the episode - so this route no
  // longer computes the lane size. Stale clients read a missing field as 0
  // and simply render no link. The lane itself still serves researchers via
  // /api/edits/next and /api/annotator/summary.)
  if (queuePrompts.length === 0) {
    return NextResponse.json({
      complete: true,
      message: "No prompts with model outputs available yet.",
    });
  }

  // In demo mode we don't track completion/skips against the annotator's real
  // history - a live walkthrough always has something to show.
  let donePromptIds = new Set<string>();
  let skippedPromptIds = new Set<string>();
  if (!isDemo) {
    const [doneRows, skipRows] = await Promise.all([
      prisma.pairwiseComparison.findMany({
        where: { annotatorId, isDemo: false },
        select: { promptId: true },
      }),
      // ANY flag by this annotator excludes the prompt for them - skip flags
      // and malformed-prompt flags alike (see the route doc above).
      prisma.promptFlag.findMany({
        where: { annotatorId },
        select: { prompt: { select: { promptId: true } } },
      }),
    ]);
    donePromptIds = new Set(doneRows.map((r) => r.promptId));
    skippedPromptIds = new Set(skipRows.map((r) => r.prompt.promptId));
  }

  // In demo mode donePromptIds/skippedPromptIds are empty (never fetched
  // above), so `remaining` already equals every eligible prompt in lane
  // order - exactly "serve the first eligible prompt regardless of history".
  const { total, completed, remaining } = computeQueueState(
    queuePrompts,
    donePromptIds,
    skippedPromptIds,
  );

  for (const candidate of remaining) {
    const prompt = byPromptId.get(candidate.promptId)!;
    const outputs = prompt.pairableOutputs;
    const pair = assignedPair(annotatorId, prompt.promptId, outputs.length);
    if (!pair) continue; // defensive: candidates are already >= 2 outputs
    const [i, j] = pair;

    // Randomly assign A/B to avoid position bias.
    const swap = Math.random() > 0.5;
    const outputA = swap ? outputs[j] : outputs[i];
    const outputB = swap ? outputs[i] : outputs[j];

    // For factual buckets, surface a reference so fluency can't rescue an
    // invented fact. Subjective buckets stay blind (no reference shown).
    let reference: {
      note: string | null;
      entries: { topic: string; content: string; source: string }[];
    } | null = null;
    if (isFactualBucket(prompt.bucket)) {
      let entries: {
        topic: string;
        content: string;
        source: string;
      }[] = [];
      try {
        const rag = await searchRag(prompt.text, prompt.language, 3);
        entries = rag.map((r) => ({
          topic: r.topic,
          content: r.content,
          source: r.source,
        }));
      } catch {
        entries = [];
      }
      reference = {
        note: prompt.expectedCulturalContext,
        entries,
      };
    }

    return NextResponse.json({
      complete: false,
      demo: isDemo,
      progress: { completed, total },
      task: {
        prompt: {
          id: prompt.id,
          promptId: prompt.promptId,
          bucket: prompt.bucket,
          language: prompt.language,
          text: prompt.text,
          targetCulture: prompt.targetCulture,
          expectedCulturalContext: prompt.expectedCulturalContext,
        },
        goldFirst: goldFirstFor(candidate, isGoldFirstBucket(prompt.bucket)),
        lane: laneFor(candidate),
        watchFor: bucketWatchFor(prompt.bucket),
        scoring: bucketScoring(prompt.bucket),
        applicableAxes: axesForBucket(prompt.bucket),
        reference,
        outputA: { id: outputA.id, text: outputA.outputText },
        outputB: { id: outputB.id, text: outputB.outputText },
      },
    });
  }

  return NextResponse.json({
    complete: true,
    progress: { completed, total },
  });
}
