import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abSwap, assignedPair } from "@/lib/pairing";
import { labGate } from "@/lib/speech/lab-route";
import { REJECTED_REVIEW_STATUSES } from "@/lib/speech/limits";
import { StorageConfigError, signedReadUrl } from "@/lib/speech/storage";

/**
 * The Listen queue (GET /api/lab/speech/listen/next). Researcher-only; 404
 * when the flag is off.
 *
 * A prompt is served only when it has two or more clips that can be told
 * apart as different voices: one clip per human speaker (their latest), plus
 * each synthesised clip on its own. Frozen prompts never appear (filtered in
 * the query), nor do clips that are unconfirmed, flagged bad_audio or
 * wrong_text, or demo clips outside the requested demo session.
 *
 * The pair and the A/B orientation come from the text arena's own functions,
 * assignedPair and abSwap, keyed on (researcher, prompt): the same blind
 * pairing, the same stable A and B across a reload. The response is blind: it
 * carries no tier, speaker, source or clip metadata, only an id and a short
 * lived signed URL per side.
 *
 * A prompt is done for a researcher once they have a counted (non-demo)
 * SpeechComparison on it. Demo mode (`?demo=<id>`) ignores that history and
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
      storagePath: true,
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
        select: { promptId: true },
      });
  const done = new Set(doneRows.map((r) => r.promptId));

  // Group by prompt, one clip per distinct voice.
  type Clip = (typeof clips)[number];
  const byPrompt = new Map<string, Map<string, Clip>>();
  for (const c of clips) {
    if (done.has(c.promptId)) continue;
    const voice =
      c.sourceType === "derived" || c.modelOutputId
        ? `synth:${c.modelOutputId ?? c.id}`
        : `human:${c.annotatorId ?? c.id}`;
    let voices = byPrompt.get(c.promptId);
    if (!voices) byPrompt.set(c.promptId, (voices = new Map()));
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
      return { promptCode: list[0].prompt.promptId, list };
    })
    .sort((a, b) => a.promptCode.localeCompare(b.promptCode));

  const progress = { completed: done.size, remaining: candidates.length };
  if (candidates.length === 0) {
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }

  const { promptCode, list } = candidates[0];
  const pair = assignedPair(annotatorId, promptCode, list.length);
  if (!pair) {
    // Cannot happen with two or more clips; fail closed rather than guess.
    return NextResponse.json({ complete: true, demo: isDemo, progress });
  }
  const [i, j] = pair;
  const swap = abSwap(annotatorId, promptCode);
  const clipA = swap ? list[j] : list[i];
  const clipB = swap ? list[i] : list[j];

  let urlA: string;
  let urlB: string;
  try {
    [urlA, urlB] = await Promise.all([
      signedReadUrl(clipA.storagePath),
      signedReadUrl(clipB.storagePath),
    ]);
  } catch (e) {
    if (e instanceof StorageConfigError) {
      return NextResponse.json(
        { error: "Speech storage is not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Could not prepare the audio. Try again." },
      { status: 502 },
    );
  }

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
      clipA: { id: clipA.id, url: urlA },
      clipB: { id: clipB.id, url: urlB },
    },
  });
}
