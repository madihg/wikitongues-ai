import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { rankByCoverage } from "@/lib/speech/coverage";
import { NOT_FROZEN, loadRecordQueue } from "@/lib/speech/record-queue";

/**
 * The Record queue (GET /api/lab/speech/next). For the speaker side of the
 * lab (researchers; annotators when SPEECH_LAYER_ANNOTATORS is on); 404 when
 * the lab flag is off. Order, per the lab design:
 *   1. prompts the researcher has an OWN written answer for and no recording
 *      of yet (the answer rides along: they read it aloud), oldest answer
 *      first;
 *   2. then prompts they have no answer for, in prompt-code order (they
 *      write the answer first, then record it).
 * Frozen prompts (isHoldout or split "test") never appear, in either step:
 * the filter is in the query itself, not applied after the fact. Prompts the
 * researcher already recorded in Igala (non-demo) are done; the English clip
 * of an answer is optional and does not keep a prompt in the queue. `?exclude=a,b` skips
 * prompts the screen has dismissed this visit. Demo mode (`?demo=<id>`)
 * ignores recording history, as the text queue does, so a live walkthrough
 * always has something to show.
 *
 * Within each step the prompts are ranked by coverage (lib/speech/coverage.ts):
 * the prompt the pool holds the fewest clips of comes first, a prompt with no
 * clip ahead of every other, and ties keep the order above. The ranking only
 * re-orders; it adds and drops nothing.
 */

export async function GET(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const annotatorId = gate.userId;

  const params = new URL(req.url).searchParams;
  const isDemo = !!params.get("demo");
  const exclude = (params.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);

  // Step 1: own answers with no recording, oldest answer first. One row per
  // prompt (the latest answer if there are several). The same loader counts
  // what is waiting for the sidebar (lib/speech/record-queue.ts).
  const { recordedIds, waiting: withAnswer } = await loadRecordQueue(
    annotatorId,
    { isDemo, exclude },
  );

  const progress = { recorded: recordedIds.length };

  // The clips the pool holds and the speaker's dialect, for the coverage
  // ranking. Real, confirmed, unfrozen clips only; ids and dialects, never
  // the audio.
  const rankPrompts = async <P extends { id: string }>(prompts: P[]) => {
    if (prompts.length < 2) return prompts;
    const [clips, profile] = await Promise.all([
      prisma.speechRecording.findMany({
        where: {
          promptId: { in: prompts.map((p) => p.id) },
          isDemo: false,
          uploadedAt: { not: null },
        },
        select: { promptId: true, annotatorId: true, dialect: true },
      }),
      prisma.speakerProfile.findUnique({
        where: { userId: annotatorId },
        select: { dialect: true },
      }),
    ]);
    return rankByCoverage(
      prompts,
      clips.map((c) => ({
        promptId: c.promptId,
        speakerId: c.annotatorId,
        dialect: c.dialect,
      })),
      { id: annotatorId, dialect: profile?.dialect ?? null },
    );
  };

  if (withAnswer.length > 0) {
    const ranked = await rankPrompts(
      withAnswer.map((a) => ({ id: a.prompt.id, a })),
    );
    const a = ranked[0].a;
    return NextResponse.json({
      complete: false,
      demo: isDemo,
      progress,
      task: {
        prompt: {
          id: a.prompt.id,
          promptId: a.prompt.promptId,
          text: a.prompt.text,
          bucket: a.prompt.bucket,
        },
        ownAnswer: {
          id: a.id,
          text: a.answerText,
          englishGloss: a.englishGloss,
          dialect: a.dialect,
        },
        source: "own_answer" as const,
      },
    });
  }

  // Step 2: prompts with no answer of mine and no recording.
  const candidates = await prisma.prompt.findMany({
    take: 500,
    where: {
      ...NOT_FROZEN,
      language: "igala",
      id: { notIn: recordedIds },
      promptId: { notIn: exclude },
      coldAuthorAnswers: { none: { annotatorId, isDemo: false } },
    },
    orderBy: { promptId: "asc" },
    select: { id: true, promptId: true, text: true, bucket: true },
  });
  if (candidates.length === 0) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }
  const prompt = (await rankPrompts(candidates))[0];
  return NextResponse.json({
    complete: false,
    demo: isDemo,
    progress,
    task: { prompt, ownAnswer: null, source: "no_answer" as const },
  });
}
