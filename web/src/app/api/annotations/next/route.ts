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
  abSwap,
  assignedPair,
  computeQueueState,
  goldFirstFor,
  laneFor,
  type QueuePrompt,
} from "@/lib/pairing";
import { loadQueueInputs, type QueuePromptDetail } from "@/lib/queue-input";
import type { PinnedStatus } from "@/lib/annotate-url";

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
 *
 * A pinned prompt (?prompt=<public code>, researchers only) serves THAT
 * prompt instead of the queue head. It exists for the review drawer's
 * "Annotate this prompt": a researcher reading someone's judgment can open the
 * same question in the real episode. Everyone else is refused with 403,
 * because an annotator who could choose their questions would no longer be
 * working the assigned queue, and the queue's coverage is the design. The pin
 * changes WHICH prompt is served and nothing else: the pair, the A/B
 * orientation, goldFirst, lane and reference all come from buildTask(), the
 * one function the queue loop uses too. The answer always carries
 * `pinned: { promptId, status }`, and a task only when status is "served":
 *   - "already_judged": this user has a counted comparison on it, and the
 *     submit route would refuse a second one;
 *   - "skipped": this user skipped or flagged it;
 *   - "not_in_queue": the code is unknown, the prompt is a frozen exam
 *     question, or it has no servable pair. One status for all three, on
 *     purpose: a frozen question is never served, and nothing about it is
 *     said beyond "not here".
 * In demo mode history is ignored, as it is for the queue head, so a prompt
 * this user already judged is served.
 */

/** The empty history a prompt's bare eligibility is asked against. */
const NO_HISTORY: ReadonlySet<string> = new Set();

/**
 * Everything one episode needs for one queue candidate, or null when there
 * is nothing to serve for it. The queue loop and the pinned path both go
 * through here and nowhere else, so a prompt opened from review is the same
 * episode the queue would have dealt this annotator: same blind pair, same
 * A and B, same cold-first rule.
 */
async function buildTask(
  annotatorId: string,
  prompt: QueuePromptDetail,
  candidate: QueuePrompt,
) {
  const outputs = prompt.pairableOutputs;
  const pair = assignedPair(
    annotatorId,
    prompt.promptId,
    outputs.length,
    outputs.map((o) => o.slug),
  );
  // null here means either < 2 outputs (defensive, candidates are already
  // filtered) or - with a non-empty ALLOWED_PAIRINGS - none of this
  // prompt's pairable outputs form a whitelisted combination. Either way
  // there is nothing to serve for this prompt.
  if (!pair) return null;
  const [i, j] = pair;

  // A/B orientation against position bias: varies across prompts, fixed
  // for one (annotator, prompt), so a reload with the same pair keeps the
  // same A and B and the episode draft keyed on them is found again.
  const swap = abSwap(annotatorId, prompt.promptId);
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

  return {
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
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const annotatorId = session.user.id;
  const params = new URL(req.url).searchParams;
  const demoSessionId = params.get("demo");
  const isDemo = !!demoSessionId;

  // The pin is decided on the parameter's PRESENCE, before anything is
  // loaded: a request that carries it from anyone but a researcher is
  // refused whole, so there is no value of it that reaches the queue.
  const pinnedPromptId = params.has("prompt")
    ? (params.get("prompt") ?? "").trim()
    : null;
  if (pinnedPromptId !== null && session.user.role !== "RESEARCHER") {
    return NextResponse.json(
      {
        error:
          "Opening a specific question is for researchers. Your own queue is unchanged.",
      },
      { status: 403 },
    );
  }

  // A pinned prompt that is not served: HTTP 200, no task, and the reason.
  const pinnedOutcome = (
    status: Exclude<PinnedStatus, "served">,
    progress: { completed: number; total: number },
  ) =>
    NextResponse.json({
      complete: false,
      demo: isDemo,
      progress,
      pinned: { promptId: pinnedPromptId, status },
    });

  const { byPromptId, queuePrompts } = await loadQueueInputs();

  // (2026-08-28 rework: the all-caught-up screen's corrections cross-link is
  // gone - corrections now happen inside the episode - so this route no
  // longer computes the lane size. Stale clients read a missing field as 0
  // and simply render no link. The lane itself still serves researchers via
  // /api/edits/next and /api/annotator/summary.)
  if (queuePrompts.length === 0) {
    // Nothing is servable at all, so a pinned prompt is not either; the same
    // answer an unknown code gets (computeQueueState of nothing is 0 of 0).
    if (pinnedPromptId !== null) {
      return pinnedOutcome("not_in_queue", { completed: 0, total: 0 });
    }
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

  if (pinnedPromptId !== null) {
    const progress = { completed, total };
    // Eligibility is asked of the function that builds the queue, with the
    // history left out, so the pin can never serve what the queue could not:
    // an unknown code, a frozen exam question and a prompt without a
    // drawable pair are all simply absent from this list, and all three get
    // the same answer.
    const candidate = computeQueueState(
      queuePrompts,
      NO_HISTORY,
      NO_HISTORY,
    ).remaining.find((c) => c.promptId === pinnedPromptId);
    const prompt = candidate ? byPromptId.get(candidate.promptId) : undefined;
    if (!candidate || !prompt) return pinnedOutcome("not_in_queue", progress);

    // What the submit route would refuse: a counted comparison by this user
    // on this prompt, stored under the public code or (rows written with it)
    // the Prompt.id cuid. Checked before the skip, the order
    // computeQueueState uses. In demo both sets are empty (the history is
    // never fetched above), which is what serves a judged prompt there.
    if (donePromptIds.has(prompt.promptId) || donePromptIds.has(prompt.id)) {
      return pinnedOutcome("already_judged", progress);
    }
    if (skippedPromptIds.has(prompt.promptId)) {
      return pinnedOutcome("skipped", progress);
    }

    const task = await buildTask(annotatorId, prompt, candidate);
    if (!task) return pinnedOutcome("not_in_queue", progress);
    return NextResponse.json({
      complete: false,
      demo: isDemo,
      progress,
      task,
      pinned: { promptId: prompt.promptId, status: "served" },
    });
  }

  for (const candidate of remaining) {
    const prompt = byPromptId.get(candidate.promptId)!;
    const task = await buildTask(annotatorId, prompt, candidate);
    // Nothing to serve for this prompt (see buildTask); try the next one.
    if (!task) continue;

    return NextResponse.json({
      complete: false,
      demo: isDemo,
      progress: { completed, total },
      task,
    });
  }

  return NextResponse.json({
    complete: true,
    progress: { completed, total },
  });
}
