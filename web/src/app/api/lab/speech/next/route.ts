import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";

/**
 * The Record queue (GET /api/lab/speech/next). Researcher-only, 404 when the
 * lab flag is off. Order, per the lab design:
 *   1. prompts the researcher has an OWN written answer for and no recording
 *      of yet (the answer rides along: they read it aloud), oldest answer
 *      first;
 *   2. then prompts they have no answer for, in prompt-code order (they
 *      write the answer first, then record it).
 * Frozen prompts (isHoldout or split "test") never appear, in either step:
 * the filter is in the query itself, not applied after the fact. Prompts the
 * researcher already recorded (non-demo) are done. `?exclude=a,b` skips
 * prompts the screen has dismissed this visit. Demo mode (`?demo=<id>`)
 * ignores recording history, as the text queue does, so a live walkthrough
 * always has something to show.
 */

/** Never serve a frozen prompt: the shared filter for both queue steps. */
const NOT_FROZEN = { isHoldout: false, split: { not: "test" as const } };

export async function GET(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const annotatorId = gate.userId;

  const params = new URL(req.url).searchParams;
  const isDemo = !!params.get("demo");
  const exclude = (params.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);

  // Prompts (by Prompt.id) this researcher has already recorded for real.
  const recordedRows = isDemo
    ? []
    : await prisma.speechRecording.findMany({
        where: { annotatorId, isDemo: false },
        select: { promptId: true },
      });
  const recordedIds = [...new Set(recordedRows.map((r) => r.promptId))];

  // Step 1: own answers with no recording, oldest answer first. One row per
  // prompt (the latest answer if there are several).
  const answers = await prisma.coldAuthorAnswer.findMany({
    where: {
      annotatorId,
      isDemo: false,
      prompt: {
        ...NOT_FROZEN,
        language: "igala",
        id: { notIn: recordedIds },
        promptId: { notIn: exclude },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      promptId: true,
      answerText: true,
      dialect: true,
      createdAt: true,
      prompt: {
        select: { id: true, promptId: true, text: true, bucket: true },
      },
    },
  });
  const latestPerPrompt = new Map<string, (typeof answers)[number]>();
  for (const a of answers) latestPerPrompt.set(a.promptId, a); // later wins
  const withAnswer = [...latestPerPrompt.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const progress = { recorded: recordedIds.length };

  if (withAnswer.length > 0) {
    const a = withAnswer[0];
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
          dialect: a.dialect,
        },
        source: "own_answer" as const,
      },
    });
  }

  // Step 2: prompts with no answer of mine and no recording.
  const prompt = await prisma.prompt.findFirst({
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
  if (!prompt) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }
  return NextResponse.json({
    complete: false,
    demo: isDemo,
    progress,
    task: { prompt, ownAnswer: null, source: "no_answer" as const },
  });
}
