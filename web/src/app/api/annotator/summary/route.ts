import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isResearcher } from "@/lib/personas";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";
import { loadRecentEdits } from "@/lib/recent-edits";
import { loadWaiting } from "@/lib/waiting";
import { computeQueueState } from "@/lib/pairing";
import { loadCorrectionInputs, loadQueueInputs } from "@/lib/queue-input";
import { addWeeks, lagosDate, weekFigure, weekStartOf } from "@/lib/hours";
import { loadHours } from "@/lib/hours-data";

/**
 * Real numbers for the annotator dashboard. Everything here is scoped to the
 * signed-in user and excludes demo-session rows (isDemo=true), so the cards and
 * activity feed reflect what this person actually logged — not mock data.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const annotatorId = session.user.id;
  const researcher = isResearcher(session.user.role, session.user.email);

  // Hours for this week and last, started now so they load while the queue
  // numbers do. The SAME loader and row builder as the researcher's hours
  // table (lib/hours-data.ts), so the two can never disagree.
  const thisWeek = weekStartOf(new Date());
  const lastWeek = addWeeks(thisWeek, -1);
  const hoursPromise = loadHours({
    weeks: [thisWeek, lastWeek],
    from: lastWeek,
    to: addWeeks(thisWeek, 1),
    userId: annotatorId,
  });
  // Awaited below; this only stops an early failure elsewhere from leaving
  // the promise unhandled.
  hoursPromise.catch(() => {});

  // Queue remaining — mirrors /api/annotations/next via the SAME loader
  // (loadQueueInputs: pairing-pool output filter, holdout exclusion, lane
  // metadata) and the shared computeQueueState(): eligible prompts (2+
  // pairing-eligible outputs) minus prompts this user has already compared
  // (any pair, including old-scheme history) or skipped. Identical input
  // path, so "Queue Remaining" here can never drift from what the queue
  // actually serves.
  const [{ queuePrompts }, { correctionInputs }, doneRows, skipRows] =
    await Promise.all([
      loadQueueInputs(),
      // The corrections lane count comes through the SAME loader + pure
      // function as /api/edits/next, so "Corrections waiting" can never
      // drift from what the lane actually serves.
      loadCorrectionInputs(annotatorId),
      prisma.pairwiseComparison.findMany({
        where: { annotatorId, isDemo: false },
        select: { promptId: true },
      }),
      // ANY flag by this annotator (skip or malformed-prompt) excludes the
      // prompt for them - mirrors /api/annotations/next exactly.
      prisma.promptFlag.findMany({
        where: { annotatorId },
        select: { prompt: { select: { promptId: true } } },
      }),
    ]);
  const donePromptIds = new Set(doneRows.map((r) => r.promptId));
  const skippedPromptIds = new Set(skipRows.map((r) => r.prompt.promptId));

  const { remaining, corrections } = computeQueueState(
    queuePrompts,
    donePromptIds,
    skippedPromptIds,
    correctionInputs,
  );
  const pending = remaining.length;
  const correctionsWaiting = corrections.length;

  const [completed, rubricScores, coldAnswers] = await Promise.all([
    prisma.pairwiseComparison.count({ where: { annotatorId, isDemo: false } }),
    prisma.rubricAxisScore.count({ where: { annotatorId, isDemo: false } }),
    prisma.coldAuthorAnswer.count({ where: { annotatorId, isDemo: false } }),
  ]);

  const [promptsInCatalogue, pendingReviews] = researcher
    ? await Promise.all([
        prisma.prompt.count(),
        prisma.handoffItem.count({ where: { status: "pending" } }),
      ])
    : [0, 0];

  // Speech is on for this account: the lab flag, and a researcher or (with
  // the annotator layer on) an annotator. The same rule as /api/lab/flags.
  const lab = speechLabEnabled();
  const speech = canUseSpeech(session.user.role, {
    lab,
    layer: lab && speechLayerAnnotatorsEnabled(),
  });

  // Recent activity = this user's latest comparisons, cold-authored answers,
  // clips and saved edits.
  const [recentPairwise, recentCold, recentClips, recentEdits, clips] =
    await Promise.all([
      prisma.pairwiseComparison.findMany({
        where: { annotatorId, isDemo: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { promptId: true, winner: true, createdAt: true },
      }),
      prisma.coldAuthorAnswer.findMany({
        where: { annotatorId, isDemo: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { createdAt: true, prompt: { select: { text: true } } },
      }),
      prisma.speechRecording.findMany({
        where: { annotatorId, isDemo: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { createdAt: true, prompt: { select: { text: true } } },
      }),
      loadRecentEdits(annotatorId),
      prisma.speechRecording.count({ where: { annotatorId, isDemo: false } }),
    ]);

  // PairwiseComparison stores the PUBLIC promptId string, not a FK — map to text.
  const promptIds = [...new Set(recentPairwise.map((r) => r.promptId))];
  const promptText = new Map(
    (
      await prisma.prompt.findMany({
        where: { promptId: { in: promptIds } },
        select: { promptId: true, text: true },
      })
    ).map((p) => [p.promptId, p.text]),
  );

  const WINNER_LABEL: Record<string, string> = {
    a: "Picked A",
    b: "Picked B",
    tie: "Tie",
    both_inadequate: "Both inadequate",
  };

  const recent = [
    ...recentPairwise.map((r) => ({
      prompt: promptText.get(r.promptId) ?? r.promptId,
      type: "Comparison",
      status: WINNER_LABEL[r.winner] ?? "Logged",
      createdAt: r.createdAt,
    })),
    ...recentCold.map((r) => ({
      prompt: r.prompt?.text ?? "(prompt removed)",
      type: "Gold answer",
      status: "Saved",
      createdAt: r.createdAt,
    })),
    ...recentClips.map((r) => ({
      prompt: r.prompt?.text ?? "(prompt removed)",
      type: "Clip",
      status: "Saved",
      createdAt: r.createdAt,
    })),
    ...recentEdits.map((r) => ({
      prompt: r.prompt,
      type: "Edit",
      status: "Saved",
      createdAt: r.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6)
    .map(({ createdAt, ...rest }) => ({
      ...rest,
      date: createdAt.toISOString(),
    }));

  // Time worked, this week and last (annotator experience spec 10.3): the
  // figure here is this person's row in the researcher's hours table.
  const hours = await hoursPromise;
  const rowFor = (week: Date) =>
    hours.rows.find(
      (r) => r.userId === annotatorId && r.weekStart === lagosDate(week),
    );
  const time = {
    thisWeek: weekFigure(rowFor(thisWeek)),
    lastWeek: weekFigure(rowFor(lastWeek)),
    measuredSince: hours.measuredSince?.toISOString() ?? null,
  };

  // "Waiting for you": each number is the length of the queue its card
  // opens (lib/waiting.ts asks what the queue routes ask). The fix card
  // needs authors to be able to edit their own answers, which arrives with
  // the edit log: until that table exists the count stays at zero.
  const waitingRest = await loadWaiting(annotatorId, {
    speech,
    editing: hours.revisionsCounted,
  });
  const waiting = { annotate: pending, ...waitingRest };

  return NextResponse.json({
    time,
    waiting,
    speech,
    clips,
    pending,
    correctionsWaiting,
    completed,
    rubricScores,
    coldAnswers,
    promptsInCatalogue,
    pendingReviews,
    recent,
  });
}
