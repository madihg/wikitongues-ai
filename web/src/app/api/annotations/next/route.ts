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
  type QueuePrompt,
} from "@/lib/pairing";

/**
 * Serve the next annotation task. The response now carries everything the
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
 * A prompt is excluded from an annotator's remaining queue once they have ANY
 * non-demo comparison for it (covers history from the old scheme, regardless
 * of which pair was done) or once they've skipped it via /api/annotations/skip.
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

  const promptsWithOutputs = await prisma.prompt.findMany({
    where: { modelOutputs: { some: {} } },
    // Deterministic order (id as a tiebreak on equal timestamps) so the
    // assigned-pair index picked here matches /api/annotator/summary exactly.
    include: {
      modelOutputs: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });

  if (promptsWithOutputs.length === 0) {
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
      prisma.promptFlag.findMany({
        where: { annotatorId, reason: "skip" },
        select: { prompt: { select: { promptId: true } } },
      }),
    ]);
    donePromptIds = new Set(doneRows.map((r) => r.promptId));
    skippedPromptIds = new Set(skipRows.map((r) => r.prompt.promptId));
  }

  const queuePrompts: QueuePrompt[] = promptsWithOutputs.map((p) => ({
    promptId: p.promptId,
    outputCount: p.modelOutputs.length,
  }));
  // In demo mode donePromptIds/skippedPromptIds are empty (never fetched
  // above), so `remaining` already equals every eligible prompt in order -
  // exactly "serve the first eligible prompt regardless of history".
  const { total, completed, remaining } = computeQueueState(
    queuePrompts,
    donePromptIds,
    skippedPromptIds,
  );

  const byPromptId = new Map(promptsWithOutputs.map((p) => [p.promptId, p]));

  for (const candidate of remaining) {
    const prompt = byPromptId.get(candidate.promptId)!;
    const outputs = prompt.modelOutputs;
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
        goldFirst: isGoldFirstBucket(prompt.bucket),
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
