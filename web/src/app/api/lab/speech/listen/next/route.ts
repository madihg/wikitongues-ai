import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abSwap, assignedPair } from "@/lib/pairing";
import { labGate } from "@/lib/speech/lab-route";
import { REJECTED_REVIEW_STATUSES } from "@/lib/speech/limits";
import { audioUrl } from "@/lib/speech/storage";

/**
 * The Listen queue (GET /api/lab/speech/listen/next). Researcher-only; 404
 * when the flag is off.
 *
 * A prompt is served only when it has two or more clips IN THE SAME LANGUAGE
 * that can be told apart as different voices: one clip per human speaker
 * (their latest in that language), plus each synthesised clip on its own. An
 * Igala clip is never paired with an English one. Frozen prompts never appear (filtered in
 * the query), nor do clips that are unconfirmed, flagged bad_audio or
 * wrong_text, or demo clips outside the requested demo session.
 *
 * The pair and the A/B orientation come from the text arena's own functions,
 * assignedPair and abSwap, keyed on (researcher, prompt): the same blind
 * pairing, the same stable A and B across a reload. The response is blind: it
 * carries no tier, speaker, source or take metrics, only an id and the audio
 * endpoint URL per side, plus the language (both clips share it).
 *
 * A (prompt, language) is done for a researcher once they have a counted
 * (non-demo) SpeechComparison on a pair in that language. Demo mode (`?demo=<id>`) ignores that history and
 * admits the demo session's own clips, as the text queue does.
 */

const NOT_REJECTED = [
  { reviewStatus: null },
  { reviewStatus: { notIn: [...REJECTED_REVIEW_STATUSES] } },
];

export async function GET(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const annotatorId = gate.userId;

  const demoSessionId = new URL(req.url).searchParams.get("demo");
  const isDemo = !!demoSessionId;

  const clips = await prisma.speechRecording.findMany({
    where: {
      uploadedAt: { not: null },
      prompt: { isHoldout: false, split: { not: "test" } },
      OR: [{ isDemo: false }, ...(isDemo ? [{ demoSessionId }] : [])],
      AND: [{ OR: NOT_REJECTED }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      promptId: true,
      language: true,
      annotatorId: true,
      modelOutputId: true,
      sourceType: true,
      createdAt: true,
      prompt: { select: { promptId: true, text: true } },
    },
  });

  // Judged prompts (by Prompt.id) for this researcher; ignored in demo.
  const doneRows = isDemo
    ? []
    : await prisma.speechComparison.findMany({
        where: { annotatorId, isDemo: false },
        select: { promptId: true, recordingA: { select: { language: true } } },
      });
  const slot = (promptId: string, language: string) =>
    `${promptId}:${language}`;
  const done = new Set(
    doneRows.map((r) => slot(r.promptId, r.recordingA.language)),
  );

  // Group by prompt and language, one clip per distinct voice.
  type Clip = (typeof clips)[number];
  const byPrompt = new Map<string, Map<string, Clip>>();
  for (const c of clips) {
    if (done.has(slot(c.promptId, c.language))) continue;
    const voice =
      c.sourceType === "derived" || c.modelOutputId
        ? `synth:${c.modelOutputId ?? c.id}`
        : `human:${c.annotatorId ?? c.id}`;
    const key = slot(c.promptId, c.language);
    let voices = byPrompt.get(key);
    if (!voices) byPrompt.set(key, (voices = new Map()));
    voices.set(voice, c); // later clip from the same voice replaces the earlier
  }

  const candidates = [...byPrompt.entries()]
    .filter(([, voices]) => voices.size >= 2)
    .map(([, voices]) => {
      const list = [...voices.values()].sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
      return {
        promptCode: list[0].prompt.promptId,
        language: list[0].language,
        list,
      };
    })
    .sort(
      (a, b) =>
        a.promptCode.localeCompare(b.promptCode) ||
        a.language.localeCompare(b.language),
    );

  const progress = { completed: done.size, remaining: candidates.length };
  if (candidates.length === 0) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }

  const { promptCode, language, list } = candidates[0];
  const pair = assignedPair(annotatorId, `${promptCode}:${language}`, list.length);
  if (!pair) {
    // Cannot happen with two or more clips; fail closed rather than guess.
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }
  const [i, j] = pair;
  const swap = abSwap(annotatorId, `${promptCode}:${language}`);
  const clipA = swap ? list[j] : list[i];
  const clipB = swap ? list[i] : list[j];

  return NextResponse.json({
    complete: false,
    demo: isDemo,
    progress,
    task: {
      prompt: {
        id: clipA.promptId,
        promptId: promptCode,
        text: clipA.prompt.text,
      },
      language,
      clipA: { id: clipA.id, url: audioUrl(clipA.id) },
      clipB: { id: clipB.id, url: audioUrl(clipB.id) },
    },
  });
}
