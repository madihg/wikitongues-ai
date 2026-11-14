import { allLimited } from "./limited";
import type { PrismaClient } from "@prisma/client";
import type { QueuePrompt } from "@/lib/pairing";
import { loadPeople } from "./people-data";
import {
  holdings,
  needsYou,
  weekRows,
  weekTotals,
  type Holding,
  type NeedsYouLine,
  type PersonWeek,
  type WeekTotals,
} from "./today";
import type { Week } from "./week";

/**
 * Everything Today shows about the team's work, in one pass: the people of
 * the week, the "Needs you" lines, and what we hold. Counts and dates only.
 * The models tile row loads separately (it is the slow part), so this block
 * never waits for it.
 */

export interface TodayWork {
  /** Everyone with anything on record. The People view shows the same rows. */
  people: PersonWeek[];
  rows: PersonWeek[];
  totals: WeekTotals;
  needs: NeedsYouLine[];
  holdings: Holding[];
}

type Db = Parameters<typeof loadPeople>[0] &
  Pick<PrismaClient, "speechAlert" | "speechLoopState" | "costEntry">;

const DAY = 86_400_000;

/** A clip of a person that is still ours to count, checked or not. */
export const KEPT_CLIP = {
  isDemo: false,
  uploadedAt: { not: null },
  sourceType: { not: "derived" as const },
  OR: [{ reviewStatus: null }, { reviewStatus: "keep" }],
};

/** A person's clip nobody has checked. The Speech clips tab lists the same set. */
export const UNCHECKED_CLIP = {
  isDemo: false,
  uploadedAt: { not: null },
  sourceType: { not: "derived" as const },
  reviewStatus: null,
};

export async function loadTodayWork(
  db: Db,
  options: {
    now: Date;
    week: Week;
    speech: boolean;
    /**
     * A research lead sees people: the week's rows, who is running low, who
     * has gone quiet. For anyone else no person is loaded at all, so no name
     * can reach the page.
     */
    lead: boolean;
    queuePrompts: QueuePrompt[] | Promise<QueuePrompt[]>;
  },
): Promise<TodayWork> {
  const { now, week, speech } = options;
  const inWeek = { createdAt: { gte: week.start, lt: week.end } };
  const real = { isDemo: false };
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [
    people,
    openFlags,
    oldestFlag,
    answers,
    answersWeek,
    comparisons,
    comparisonsWeek,
    corrections,
    correctionsWeek,
    speechAll,
    speechWeek,
    unchecked,
    alerts,
    loop,
    spend,
  ] = await allLimited([
    () =>
      options.lead
        ? loadPeople(db, week, { speech, queuePrompts: options.queuePrompts })
        : ([] as PersonWeek[]),
    () => db.promptFlag.count({ where: { resolved: false } }),
    () =>
      db.promptFlag.findFirst({
        where: { resolved: false },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    () => db.coldAuthorAnswer.count({ where: real }),
    () => db.coldAuthorAnswer.count({ where: { ...real, ...inWeek } }),
    () => db.pairwiseComparison.count({ where: real }),
    () => db.pairwiseComparison.count({ where: { ...real, ...inWeek } }),
    () => db.outputEdit.count({ where: real }),
    () => db.outputEdit.count({ where: { ...real, ...inWeek } }),
    () =>
      speech
        ? db.speechRecording.aggregate({
            where: KEPT_CLIP,
            _sum: { durationMs: true },
          })
        : null,
    () =>
      speech
        ? db.speechRecording.aggregate({
            where: { ...KEPT_CLIP, ...inWeek },
            _sum: { durationMs: true },
          })
        : null,
    () => (speech ? db.speechRecording.count({ where: UNCHECKED_CLIP }) : null),
    () =>
      speech
        ? db.speechAlert.findMany({
            where: {
              readAt: null,
              createdAt: { gte: new Date(now.getTime() - 3 * DAY) },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, message: true },
          })
        : [],
    () =>
      speech
        ? db.speechLoopState.findUnique({
            where: { id: 1 },
            select: { monthlyCapUsd: true },
          })
        : null,
    () =>
      speech
        ? db.costEntry.aggregate({
            _sum: { amountUsd: true },
            where: {
              category: "finetune",
              refType: "speech_train_job",
              createdAt: { gte: monthStart },
            },
          })
        : null,
  ]);

  const rows = weekRows(people);
  return {
    people,
    rows,
    totals: weekTotals(rows),
    needs: needsYou({
      now,
      people,
      flags: {
        open: openFlags,
        oldestAt: oldestFlag?.createdAt.toISOString() ?? null,
      },
      uncheckedClips: unchecked,
      alerts,
      spend:
        speech && spend
          ? {
              monthUsd: spend._sum.amountUsd ?? 0,
              // The loop's own default when its row was never written.
              capUsd: loop?.monthlyCapUsd ?? 200,
            }
          : null,
    }),
    holdings: holdings({
      answers: { total: answers, inWeek: answersWeek },
      comparisons: { total: comparisons, inWeek: comparisonsWeek },
      corrections: { total: corrections, inWeek: correctionsWeek },
      speechMs:
        speechAll && speechWeek
          ? {
              total: speechAll._sum.durationMs ?? 0,
              inWeek: speechWeek._sum.durationMs ?? 0,
            }
          : null,
    }),
  };
}
