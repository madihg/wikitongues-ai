import { prisma } from "@/lib/prisma";

/**
 * The speaker's own answers that still wait for a clip: the first steps of
 * the Record queue, and the number beside "Speech" in the sidebar. One loader
 * for both, so the number a speaker sees can never drift from what the queue
 * serves (GET /api/lab/speech/next and GET /api/lab/speech/waiting).
 *
 * An answer waits for one of two reasons:
 *   1. its prompt has no Igala clip of this speaker's yet (`waiting`);
 *   2. its prompt has an Igala clip but no English clip (`englishMissing`).
 *      The English clip is part of finishing a prompt on the Record page
 *      (decision 2, 2026-11-13), so these come back, after the first kind,
 *      with the Igala part shown as done.
 * Frozen prompts (isHoldout or split "test") never appear: the filter is in
 * the query itself. One row per prompt (the latest answer when there are
 * several), oldest answer first. Demo rows never count.
 */

/** Never serve a frozen prompt: the shared filter for both queue steps. */
export const NOT_FROZEN = { isHoldout: false, split: { not: "test" as const } };

export interface WaitingAnswer {
  id: string;
  /** Prompt.id (the row id, not the public code). */
  promptId: string;
  answerText: string;
  englishGloss: string | null;
  /** The short English translation, once typed. */
  englishTranslation: string | null;
  dialect: string | null;
  createdAt: Date;
  prompt: { id: string; promptId: string; text: string; bucket: string };
}

export interface RecordQueue {
  /** Prompt.id of every prompt this speaker already has an Igala clip of. */
  recordedIds: string[];
  /** Own answers with no clip yet, oldest first, one per prompt. */
  waiting: WaitingAnswer[];
  /** Own answers with an Igala clip and no English clip, oldest first. */
  englishMissing: WaitingAnswer[];
}

const ANSWER_SELECT = {
  id: true,
  promptId: true,
  answerText: true,
  englishGloss: true,
  englishTranslation: true,
  dialect: true,
  createdAt: true,
  prompt: {
    select: { id: true, promptId: true, text: true, bucket: true },
  },
} as const;

/** One row per prompt (a later answer wins), oldest answer first. */
function latestPerPrompt(answers: WaitingAnswer[]): WaitingAnswer[] {
  const latest = new Map<string, WaitingAnswer>();
  for (const a of answers) latest.set(a.promptId, a); // later wins
  return [...latest.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function loadRecordQueue(
  annotatorId: string,
  options: { isDemo?: boolean; exclude?: string[] } = {},
): Promise<RecordQueue> {
  const exclude = options.exclude ?? [];

  // Prompts (by Prompt.id) this speaker has already recorded for real, per
  // language. Demo mode ignores recording history, as the text queue does.
  const recordedRows = options.isDemo
    ? []
    : await prisma.speechRecording.findMany({
        where: { annotatorId, isDemo: false },
        select: { promptId: true, language: true },
      });
  const idsOf = (language: string) => [
    ...new Set(
      recordedRows
        .filter((r) => r.language === language)
        .map((r) => r.promptId),
    ),
  ];
  const recordedIds = idsOf("igala");
  const englishIds = new Set(idsOf("english"));
  const englishMissingIds = recordedIds.filter((id) => !englishIds.has(id));

  const answersWhere = (promptIds: { in: string[] } | { notIn: string[] }) => ({
    annotatorId,
    isDemo: false,
    prompt: {
      ...NOT_FROZEN,
      language: "igala",
      id: promptIds,
      promptId: { notIn: exclude },
    },
  });

  const [answers, englishAnswers] = await Promise.all([
    prisma.coldAuthorAnswer.findMany({
      where: answersWhere({ notIn: recordedIds }),
      orderBy: { createdAt: "asc" },
      select: ANSWER_SELECT,
    }),
    // Nothing to ask for when no prompt is missing its English clip.
    englishMissingIds.length === 0
      ? Promise.resolve([])
      : prisma.coldAuthorAnswer.findMany({
          where: answersWhere({ in: englishMissingIds }),
          orderBy: { createdAt: "asc" },
          select: ANSWER_SELECT,
        }),
  ]);

  return {
    recordedIds,
    waiting: latestPerPrompt(answers),
    englishMissing: latestPerPrompt(englishAnswers),
  };
}

/**
 * How many of the speaker's own answers wait for a clip (the sidebar number):
 * those with no clip at all, plus those still missing the English clip.
 */
export async function countRecordWaiting(annotatorId: string): Promise<number> {
  const q = await loadRecordQueue(annotatorId);
  return q.waiting.length + q.englishMissing.length;
}
