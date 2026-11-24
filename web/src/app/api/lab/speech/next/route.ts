import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { rankByCoverage } from "@/lib/speech/coverage";
import {
  NOT_FROZEN,
  isSpeechSetPrompt,
  loadRecordQueue,
  speechSetFirst,
} from "@/lib/speech/record-queue";
import { v46SpeechEnglish } from "@/lib/prompt-bank-v46";

/**
 * The Record queue (GET /api/lab/speech/next). For the speaker side of the
 * lab (researchers; annotators when SPEECH_LAYER_ANNOTATORS is on); 404 when
 * the lab flag is off. Order, per the lab design:
 *   1. prompts the researcher has an OWN written answer for and no recording
 *      of yet (the answer rides along: they read it aloud), oldest answer
 *      first. Within this step, answers to the v4.6 speech set (the 120
 *      prompts chosen for sound coverage) come before every other answer:
 *      coverage matters more than volume for the first voice;
 *   2. then prompts they have an own answer AND an Igala clip for, but no
 *      English clip yet (`igalaDone: true`): the English clip is part of
 *      finishing a prompt on the Record page, so these come back at the end
 *      of the speaker's own answers with the Igala part shown as done;
 *   3. then prompts they have no answer for, in prompt-code order (they
 *      write the answer first, then record it), the speech set first here
 *      too.
 * A speech-set prompt whose English sentence is given carries it as
 * `suggestedTranslation`, so the short English translation box starts filled
 * with it (the speaker can still change it).
 * Frozen prompts (isHoldout or split "test") never appear, in any step: the
 * filter is in the query itself, not applied after the fact. A prompt is done
 * once it has the speaker's Igala clip and English clip (non-demo). The
 * answer carries its short English translation when one was typed. `?exclude=a,b` skips
 * prompts the screen has dismissed this visit. Demo mode (`?demo=<id>`)
 * ignores recording history, as the text queue does, so a live walkthrough
 * always has something to show.
 *
 * Within each step (and within the speech set and the rest of a step,
 * separately, so the ranking never moves an older answer ahead of the speech
 * set) the prompts are ranked by coverage (lib/speech/coverage.ts):
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
  const {
    recordedIds,
    waiting: withAnswer,
    englishMissing,
  } = await loadRecordQueue(annotatorId, { isDemo, exclude });

  // `waiting`: own answers that still need a clip, the Record header's
  // "N left" (the same loader as the sidebar count).
  const progress = {
    recorded: recordedIds.length,
    waiting: withAnswer.length + englishMissing.length,
  };

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

  // Steps 1 and 2: an own answer that waits for a clip. Step 1 (no clip at
  // all) is served before step 2 (the English clip is missing), and inside
  // step 1 the speech set is served before every other answer.
  const step1 = speechSetFirst(withAnswer, (a) => a.prompt.promptId);
  for (const [answers, igalaDone] of [
    [step1.speechSet, false],
    [step1.rest, false],
    [englishMissing, true],
  ] as const) {
    if (answers.length === 0) continue;
    const ranked = await rankPrompts(
      answers.map((a) => ({ id: a.prompt.id, a })),
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
          englishTranslation: a.englishTranslation,
          dialect: a.dialect,
        },
        source: "own_answer" as const,
        // True when the Igala clip is already saved and only the English
        // clip is missing.
        igalaDone,
        suggestedTranslation: v46SpeechEnglish(a.prompt.promptId),
      },
    });
  }

  // Step 3: prompts with no answer of mine and no recording. The speech set
  // is asked for first, on its own, so the 500-row cap of the general query
  // can never cut it off; with none left, every other prompt.
  const noAnswerWhere = {
    ...NOT_FROZEN,
    language: "igala",
    id: { notIn: recordedIds },
    coldAuthorAnswers: { none: { annotatorId, isDemo: false } },
  };
  const PROMPT_SELECT = {
    id: true,
    promptId: true,
    text: true,
    bucket: true,
  } as const;
  const speechSet = (
    await prisma.prompt.findMany({
      take: 500,
      where: {
        ...noAnswerWhere,
        promptId: { startsWith: "ig_v46_sp", notIn: exclude },
      },
      orderBy: { promptId: "asc" },
      select: PROMPT_SELECT,
    })
  ).filter((p) => isSpeechSetPrompt(p.promptId));
  const candidates =
    speechSet.length > 0
      ? speechSet
      : await prisma.prompt.findMany({
          take: 500,
          where: { ...noAnswerWhere, promptId: { notIn: exclude } },
          orderBy: { promptId: "asc" },
          select: PROMPT_SELECT,
        });
  if (candidates.length === 0) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }
  const prompt = (await rankPrompts(candidates))[0];
  return NextResponse.json({
    complete: false,
    demo: isDemo,
    progress,
    task: {
      prompt,
      ownAnswer: null,
      source: "no_answer" as const,
      suggestedTranslation: v46SpeechEnglish(prompt.promptId),
    },
  });
}
