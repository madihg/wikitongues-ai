import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildWeekRows,
  demoSeconds,
  type HoursEvent,
  type HoursNote,
  type HoursPing,
  type WeekRow,
} from "@/lib/hours";
import { isMissingTable, orIfMissing } from "@/lib/missing-table";

/**
 * Loads what the hours rows are built from, for a span of whole weeks, for
 * everyone or for one person. The researcher table (/api/admin/time-spent)
 * and the annotator's own Dashboard (/api/annotator/summary) both come
 * through here and through buildWeekRows, so a person's figure on their
 * Dashboard is their row in the researcher table by construction.
 *
 * Only ids, times and a clip's duration are read. Demo rows are left out
 * wherever the table marks them. Tables whose migration is not applied yet
 * (ActivityPing, TimeNote, AnswerRevision) read as empty.
 */
export interface HoursData {
  rows: WeekRow[];
  /** The first minute the beat ever measured, for anyone. Null: not yet. */
  measuredSince: Date | null;
  /** Demo seconds in the span, left out of every row. */
  demoSecondsLeftOut: number;
  /** False until the AnswerRevision table exists: "Edits" is corrections only. */
  revisionsCounted: boolean;
}

export async function loadHours(args: {
  weeks: Date[];
  from: Date;
  to: Date;
  userId?: string;
}): Promise<HoursData> {
  const { weeks, from, to, userId } = args;
  const createdAt = { gte: from, lt: to };
  const mine = userId ? { annotatorId: userId } : {};
  const pick = { annotatorId: true, createdAt: true } as const;

  let revisionsCounted = true;
  const revisions = async () => {
    try {
      // One event per press of "Save changes", for the person who saved
      // (the EDIT lane's contract). Raw, because the model belongs to that
      // lane's migration and may not be in the database yet.
      return await prisma.$queryRaw<{ editorId: string; at: Date }[]>(
        Prisma.sql`select "editorId", min("createdAt") as at
          from "AnswerRevision"
          where "isDemo" = false
            and "createdAt" >= ${from} and "createdAt" < ${to}
            ${userId ? Prisma.sql`and "editorId" = ${userId}` : Prisma.empty}
          group by "editorId", "saveId"`,
      );
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      revisionsCounted = false;
      return [];
    }
  };

  const [
    comparisons,
    answers,
    corrections,
    scores,
    flags,
    clips,
    listens,
    checks,
    revisionRows,
    pings,
    firstPing,
    notes,
  ] = await Promise.all([
    prisma.pairwiseComparison.findMany({
      where: { isDemo: false, createdAt, ...mine },
      select: pick,
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { isDemo: false, createdAt, ...mine },
      select: pick,
    }),
    prisma.outputEdit.findMany({
      where: { isDemo: false, createdAt, ...mine },
      select: pick,
    }),
    prisma.rubricAxisScore.findMany({
      where: { isDemo: false, createdAt, ...mine },
      select: pick,
    }),
    // Flags and skips are work too; PromptFlag has no isDemo column.
    prisma.promptFlag.findMany({ where: { createdAt, ...mine }, select: pick }),
    prisma.speechRecording.findMany({
      where: {
        isDemo: false,
        createdAt,
        annotatorId: userId ?? { not: null },
      },
      select: { annotatorId: true, createdAt: true, durationMs: true },
    }),
    prisma.speechComparison.findMany({
      where: { isDemo: false, createdAt, ...mine },
      select: pick,
    }),
    prisma.speechCheck.findMany({
      where: {
        isDemo: false,
        createdAt,
        ...(userId ? { reviewerId: userId } : {}),
      },
      select: { reviewerId: true, createdAt: true },
    }),
    revisions(),
    orIfMissing(
      () =>
        prisma.activityPing.findMany({
          where: {
            minute: { gte: from, lt: to },
            ...(userId ? { userId } : {}),
          },
          select: {
            userId: true,
            minute: true,
            activeSeconds: true,
            isDemo: true,
            surface: true,
          },
        }),
      [],
    ),
    orIfMissing(
      () =>
        prisma.activityPing.findFirst({
          where: { isDemo: false },
          orderBy: { minute: "asc" },
          select: { minute: true },
        }),
      null,
    ),
    orIfMissing(
      () =>
        prisma.timeNote.findMany({
          where: {
            weekStart: { gte: from, lt: to },
            ...(userId ? { userId } : {}),
          },
          select: {
            userId: true,
            weekStart: true,
            day: true,
            note: true,
            createdAt: true,
          },
        }),
      [],
    ),
  ]);

  const events: HoursEvent[] = [];
  const push = (
    kind: HoursEvent["kind"],
    list: { annotatorId: string; createdAt: Date }[],
  ) => {
    for (const r of list)
      events.push({ userId: r.annotatorId, kind, at: r.createdAt });
  };
  push("comparison", comparisons);
  push("answer", answers);
  push("correction", corrections);
  push("score", scores);
  push("flag", flags);
  push("listen", listens);
  for (const c of clips) {
    if (!c.annotatorId) continue;
    events.push({
      userId: c.annotatorId,
      kind: "clip",
      at: c.createdAt,
      lengthMs: c.durationMs,
    });
  }
  for (const c of checks) {
    events.push({ userId: c.reviewerId, kind: "check", at: c.createdAt });
  }
  for (const r of revisionRows) {
    events.push({ userId: r.editorId, kind: "revision", at: new Date(r.at) });
  }

  const ids = new Set<string>([
    ...events.map((e) => e.userId),
    ...(pings as HoursPing[]).map((p) => p.userId),
    ...(notes as HoursNote[]).map((n) => n.userId),
  ]);
  const users = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];

  return {
    rows: buildWeekRows({ weeks, users, events, pings, notes }),
    measuredSince: firstPing?.minute ?? null,
    demoSecondsLeftOut: demoSeconds(pings),
    revisionsCounted,
  };
}
