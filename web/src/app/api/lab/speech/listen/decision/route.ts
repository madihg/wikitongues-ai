import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import {
  MIN_JUDGMENTS,
  MIN_LISTENERS,
  STRONG_JUDGMENTS,
  decisionCards,
  systemOf,
} from "@/lib/speech/decision";
import { toneAccuracy } from "@/lib/speech/minimal-pairs";

/**
 * GET /api/lab/speech/listen/decision: the Bradley-Terry decision cards and
 * tone accuracy per system (PRD US-027, US-011). Researcher-only; 404 when
 * the flag is off. Reads counted (non-demo) judgments and minimal-pair
 * answers; every speechRecording read names a select, never the audio. A card
 * carries no ranking until its pair has 300 judgments from 5 listeners.
 */
const SYSTEM_FIELDS = { sourceType: true, sourceRef: true, modelOutputId: true } as const;

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const comparisons = await prisma.speechComparison.findMany({
    where: { isDemo: false },
    select: {
      winner: true,
      annotatorId: true,
      isDemo: true,
      recordingA: { select: SYSTEM_FIELDS },
      recordingB: { select: SYSTEM_FIELDS },
    },
  });
  const cards = decisionCards(
    comparisons.map((c) => ({
      a: systemOf(c.recordingA),
      b: systemOf(c.recordingB),
      winner: c.winner,
      annotatorId: c.annotatorId,
      isDemo: c.isDemo,
    })),
  );

  const answers = await prisma.speechMinimalPairAnswer.findMany({
    where: { isDemo: false },
    select: { recordingId: true, heard: true, isDemo: true },
  });
  const recs = answers.length
    ? await prisma.speechRecording.findMany({
        where: { id: { in: [...new Set(answers.map((a) => a.recordingId))] } },
        select: { id: true, ...SYSTEM_FIELDS },
      })
    : [];
  const systemById = new Map(recs.map((r) => [r.id, systemOf(r)]));

  return NextResponse.json({
    thresholds: {
      minJudgments: MIN_JUDGMENTS,
      minListeners: MIN_LISTENERS,
      strongJudgments: STRONG_JUDGMENTS,
    },
    cards,
    toneAccuracy: toneAccuracy(
      answers
        .filter((a) => systemById.has(a.recordingId))
        .map((a) => ({
          system: systemById.get(a.recordingId)!,
          heard: a.heard,
          isDemo: a.isDemo,
        })),
    ),
  });
}
