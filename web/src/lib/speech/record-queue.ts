import { prisma } from "@/lib/prisma";

/**
 * The speaker's own answers that still wait for a clip: the first step of the
 * Record queue, and the number beside "Speech" in the sidebar. One loader for
 * both, so the number a speaker sees can never drift from what the queue
 * serves (GET /api/lab/speech/next and GET /api/lab/speech/waiting).
 *
 * An answer waits when its prompt has no Igala clip of this speaker's yet
 * (non-demo). Frozen prompts (isHoldout or split "test") never appear: the
 * filter is in the query itself. One row per prompt (the latest answer when
 * there are several), oldest answer first.
 */

/** Never serve a frozen prompt: the shared filter for both queue steps. */
export const NOT_FROZEN = { isHoldout: false, split: { not: "test" as const } };

export interface WaitingAnswer {
  id: string;
  /** Prompt.id (the row id, not the public code). */
  promptId: string;
  answerText: string;
  englishGloss: string | null;
  dialect: string | null;
  createdAt: Date;
  prompt: { id: string; promptId: string; text: string; bucket: string };
}

export interface RecordQueue {
  /** Prompt.id of every prompt this speaker already has an Igala clip of. */
  recordedIds: string[];
  /** Own answers with no clip yet, oldest first, one per prompt. */
  waiting: WaitingAnswer[];
}

export async function loadRecordQueue(
  annotatorId: string,
  options: { isDemo?: boolean; exclude?: string[] } = {},
): Promise<RecordQueue> {
  const exclude = options.exclude ?? [];

  // Prompts (by Prompt.id) this speaker has already recorded for real. Demo
  // mode ignores recording history, as the text queue does.
  const recordedRows = options.isDemo
    ? []
    : await prisma.speechRecording.findMany({
        where: { annotatorId, isDemo: false, language: "igala" },
        select: { promptId: true },
      });
  const recordedIds = [...new Set(recordedRows.map((r) => r.promptId))];

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
      englishGloss: true,
      dialect: true,
      createdAt: true,
      prompt: {
        select: { id: true, promptId: true, text: true, bucket: true },
      },
    },
  });
  const latestPerPrompt = new Map<string, (typeof answers)[number]>();
  for (const a of answers) latestPerPrompt.set(a.promptId, a); // later wins
  const waiting = [...latestPerPrompt.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return { recordedIds, waiting };
}

/** How many of the speaker's own answers wait for a clip (the sidebar number). */
export async function countRecordWaiting(annotatorId: string): Promise<number> {
  return (await loadRecordQueue(annotatorId)).waiting.length;
}
