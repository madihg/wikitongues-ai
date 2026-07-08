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
import { firstPairs, MAX_SHOWS_PER_PROMPT } from "@/lib/pairing";

/**
 * Serve the next annotation task. The response now carries everything the
 * episode needs:
 *   - goldFirst: ask the annotator to author their own answer before models show
 *   - watchFor:  the per-bucket fail-mode to look for
 *   - scoring:   "subjective" (blind) vs "factual" (scored against a reference)
 *   - reference: RAG snippets + expected context, ONLY for factual buckets
 *
 * Demo mode (?demo=<sessionId>) serves the first eligible pair regardless of what
 * has already been compared, so a live walkthrough always has something to show.
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
    // Deterministic order (id as a tiebreak on equal timestamps) so the capped
    // pair selection here matches /api/annotator/summary's pending calc exactly.
    include: {
      modelOutputs: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });

  const eligiblePrompts = promptsWithOutputs.filter(
    (p) => p.modelOutputs.length >= 2,
  );

  if (eligiblePrompts.length === 0) {
    return NextResponse.json({
      complete: true,
      message: "No prompts with model outputs available yet.",
    });
  }

  // In demo mode we don't track completion against the annotator's real history.
  const completedPairs = new Set<string>();
  if (!isDemo) {
    const existing = await prisma.pairwiseComparison.findMany({
      where: { annotatorId, isDemo: false },
      select: { modelOutputAId: true, modelOutputBId: true, promptId: true },
    });
    for (const c of existing) {
      completedPairs.add(
        `${c.promptId}:${[c.modelOutputAId, c.modelOutputBId].sort().join(":")}`,
      );
    }
  }

  // Cap how many pairs a single prompt yields so annotators don't see the same
  // prompt on every C(n,2) combination. With 3 model outputs this shows a prompt
  // at most MAX_SHOWS_PER_PROMPT times instead of 3.
  let totalComparisons = 0;
  let completedCount = 0;
  for (const prompt of eligiblePrompts) {
    const outputs = prompt.modelOutputs;
    for (const [i, j] of firstPairs(outputs.length, MAX_SHOWS_PER_PROMPT)) {
      totalComparisons++;
      const key = `${prompt.promptId}:${[outputs[i].id, outputs[j].id].sort().join(":")}`;
      if (completedPairs.has(key)) completedCount++;
    }
  }

  for (const prompt of eligiblePrompts) {
    const outputs = prompt.modelOutputs;
    for (const [i, j] of firstPairs(outputs.length, MAX_SHOWS_PER_PROMPT)) {
      const key = `${prompt.promptId}:${[outputs[i].id, outputs[j].id].sort().join(":")}`;
      if (completedPairs.has(key)) continue;

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
        progress: { completed: completedCount, total: totalComparisons },
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
  }

  return NextResponse.json({
    complete: true,
    progress: { completed: completedCount, total: totalComparisons },
  });
}
