import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { answerWords } from "@/lib/speech/check";
import { audioUrl } from "@/lib/speech/storage";

/**
 * The Check queue (GET /api/lab/speech/check/next): one clip by ANOTHER
 * speaker, with the answer they wrote, for the caller to listen to and say
 * whether the two match. For the speaker side of the lab; 404 when the lab
 * flag is off.
 *
 * A clip is served only when it is confirmed, Igala, attached to a written
 * answer, unflagged or already kept (reviewStatus null or "keep"), and on an
 * unfrozen prompt. Never the caller's own clip, never one the caller has
 * already checked, never a demo clip unless the caller is in that demo
 * session (`?demo=<id>`). Prompts with the fewest checks so far come first
 * (ties by prompt code), then the clip with the fewest checks, then the
 * oldest. The response is blind: an id, the audio endpoint URL, the prompt
 * and the written answer. No speaker, tier, or machine transcript: the
 * transcript is only available after a verdict, from the transcript route.
 */

const MAX_CANDIDATES = 500;

export async function GET(req: Request) {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  const reviewerId = gate.userId;

  const demoSessionId = new URL(req.url).searchParams.get("demo");
  const isDemo = !!demoSessionId;

  const mine = isDemo
    ? []
    : await prisma.speechCheck.findMany({
        where: { reviewerId, isDemo: false },
        select: { recordingId: true },
      });
  const checkedByMe = mine.map((c) => c.recordingId);

  const clips = await prisma.speechRecording.findMany({
    take: MAX_CANDIDATES,
    where: {
      uploadedAt: { not: null },
      language: "igala",
      coldAuthorAnswerId: { not: null },
      annotatorId: { not: null, notIn: [reviewerId] },
      id: { notIn: checkedByMe },
      OR: [{ isDemo: false }, ...(isDemo ? [{ demoSessionId }] : [])],
      AND: [{ OR: [{ reviewStatus: null }, { reviewStatus: "keep" }] }],
      prompt: { isHoldout: false, split: { not: "test" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      promptId: true,
      dialect: true,
      prompt: { select: { promptId: true, text: true } },
      coldAuthorAnswer: { select: { answerText: true } },
    },
  });
  const usable = clips.filter((c) => c.coldAuthorAnswer?.answerText.trim());

  const counts = usable.length
    ? await prisma.speechCheck.groupBy({
        by: ["recordingId"],
        where: { recordingId: { in: usable.map((c) => c.id) }, isDemo: false },
        _count: { _all: true },
      })
    : [];
  const perClip = new Map(counts.map((c) => [c.recordingId, c._count._all]));
  const perPrompt = new Map<string, number>();
  for (const c of usable) {
    perPrompt.set(
      c.promptId,
      (perPrompt.get(c.promptId) ?? 0) + (perClip.get(c.id) ?? 0),
    );
  }

  const progress = { checked: checkedByMe.length, remaining: usable.length };
  if (usable.length === 0) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }

  // `usable` is already oldest first, so a stable sort keeps age as the last tie.
  const next = [...usable].sort(
    (a, b) =>
      (perPrompt.get(a.promptId) ?? 0) - (perPrompt.get(b.promptId) ?? 0) ||
      a.prompt.promptId.localeCompare(b.prompt.promptId) ||
      (perClip.get(a.id) ?? 0) - (perClip.get(b.id) ?? 0),
  )[0];
  const answer = next.coldAuthorAnswer!.answerText;

  return NextResponse.json({
    complete: false,
    demo: isDemo,
    progress,
    task: {
      recording: { id: next.id, url: audioUrl(next.id) },
      prompt: { promptId: next.prompt.promptId, text: next.prompt.text },
      answer: { text: answer, words: answerWords(answer) },
      dialect: next.dialect,
    },
  });
}
