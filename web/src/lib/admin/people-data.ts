import { allLimited } from "./limited";
import type { PrismaClient } from "@prisma/client";
import { computeQueueState, type QueuePrompt } from "@/lib/pairing";
import type { PersonWeek } from "./today";
import type { Week } from "./week";

/**
 * Who did what in one week, read from the database in a fixed number of
 * queries (one per table, grouped by person), never one per person. Counts
 * and dates only: no answer text, no audio. Demo rows are left out of every
 * count, and so are the @test.com seed accounts, as everywhere else.
 *
 * "Prompts left" is not a second opinion about the queue: it runs the same
 * loader and the same pure function the Annotate page and the annotator's
 * own Dashboard use (loadQueueInputs, computeQueueState), once per person.
 */

const SEED_ACCOUNT_EMAIL_SUFFIX = "@test.com";

type Grouped = { id: string | null; n: number; ms?: number; last: Date | null };

/** What the queries return, before it is shaped. Kept plain so the shaping is testable. */
export interface PeopleRaw {
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    role: string;
  }>;
  inWeek: {
    comparisons: Grouped[];
    answers: Grouped[];
    edits: Grouped[];
    clips: Grouped[];
    listenRounds: Grouped[];
    checks: Grouped[];
  };
  /** Per table, each person's last saved row, all time. */
  lastEver: Grouped[];
  queuePrompts: QueuePrompt[];
  /** Every counted comparison, as (person, public prompt id). */
  done: Array<{ annotatorId: string; promptId: string }>;
  /** Every prompt a person flagged or skipped, as (person, public prompt id). */
  skipped: Array<{ annotatorId: string; promptId: string }>;
}

const byId = (rows: Grouped[]) => {
  const m = new Map<string, Grouped>();
  for (const r of rows) if (r.id) m.set(r.id, r);
  return m;
};

/** Pure: the raw rows in, one PersonWeek per person with anything on record. */
export function assemblePeople(raw: PeopleRaw): PersonWeek[] {
  const w = {
    comparisons: byId(raw.inWeek.comparisons),
    answers: byId(raw.inWeek.answers),
    edits: byId(raw.inWeek.edits),
    clips: byId(raw.inWeek.clips),
    listenRounds: byId(raw.inWeek.listenRounds),
    checks: byId(raw.inWeek.checks),
  };
  const last = new Map<string, Date>();
  for (const r of raw.lastEver) {
    if (!r.id || !r.last) continue;
    const cur = last.get(r.id);
    if (!cur || r.last > cur) last.set(r.id, r.last);
  }
  const doneBy = new Map<string, Set<string>>();
  for (const d of raw.done) {
    let s = doneBy.get(d.annotatorId);
    if (!s) doneBy.set(d.annotatorId, (s = new Set()));
    s.add(d.promptId);
  }
  const skippedBy = new Map<string, Set<string>>();
  for (const d of raw.skipped) {
    let s = skippedBy.get(d.annotatorId);
    if (!s) skippedBy.set(d.annotatorId, (s = new Set()));
    s.add(d.promptId);
  }
  const none = new Set<string>();

  const out: PersonWeek[] = [];
  for (const u of raw.users) {
    if (u.email.toLowerCase().endsWith(SEED_ACCOUNT_EMAIL_SUFFIX)) continue;
    const lastActive = last.get(u.id) ?? null;
    if (!lastActive) continue; // nothing on record, ever: not a row
    const n = (m: Map<string, Grouped>) => m.get(u.id)?.n ?? 0;
    out.push({
      id: u.id,
      name: u.name?.trim() || u.email,
      role: u.role,
      comparisons: n(w.comparisons),
      answers: n(w.answers),
      edits: n(w.edits),
      clips: n(w.clips),
      clipMinutes: (w.clips.get(u.id)?.ms ?? 0) / 60_000,
      listenRounds: n(w.listenRounds),
      checks: n(w.checks),
      promptsLeft: computeQueueState(
        raw.queuePrompts,
        doneBy.get(u.id) ?? none,
        skippedBy.get(u.id) ?? none,
      ).remaining.length,
      lastActiveAt: lastActive.toISOString(),
    });
  }
  return out;
}

type Db = Pick<
  PrismaClient,
  | "user"
  | "pairwiseComparison"
  | "coldAuthorAnswer"
  | "outputEdit"
  | "speechRecording"
  | "speechComparison"
  | "speechCheck"
  | "promptFlag"
>;

/**
 * The people of one week. `queuePrompts` comes from loadQueueInputs(); it is
 * passed in so the caller decides when to pay for it and tests can supply it.
 * `speech` false skips the speech tables (the lab is off on this server).
 */
export async function loadPeople(
  db: Db,
  week: Week,
  options: {
    speech: boolean;
    /** May still be loading: it is awaited beside the queries, not before them. */
    queuePrompts: QueuePrompt[] | Promise<QueuePrompt[]>;
  },
): Promise<PersonWeek[]> {
  const inWeek = { createdAt: { gte: week.start, lt: week.end } };
  const real = { isDemo: false };
  const clip = {
    ...real,
    uploadedAt: { not: null },
    annotatorId: { not: null },
  };
  const empty = Promise.resolve([] as Grouped[]);

  const grouped = <
    T extends { _count: { _all: number }; _max: { createdAt: Date | null } },
  >(
    rows: Array<
      T & { annotatorId?: string | null; reviewerId?: string | null }
    >,
  ): Grouped[] =>
    rows.map((r) => ({
      id: r.annotatorId ?? r.reviewerId ?? null,
      n: r._count._all,
      last: r._max.createdAt,
    }));
  const agg = { _count: { _all: true }, _max: { createdAt: true } } as const;

  const [
    users,
    comparisons,
    answers,
    edits,
    clips,
    listenRounds,
    checks,
    lastComparisons,
    lastAnswers,
    lastEdits,
    lastClips,
    lastListen,
    lastChecks,
    done,
    flags,
    queuePrompts,
  ] = await allLimited([
    () =>
      db.user.findMany({
        where: { role: { in: ["ANNOTATOR", "RESEARCHER"] } },
        select: { id: true, name: true, email: true, role: true },
      }),
    () =>
      db.pairwiseComparison
        .groupBy({ by: ["annotatorId"], where: { ...real, ...inWeek }, ...agg })
        .then(grouped),
    () =>
      db.coldAuthorAnswer
        .groupBy({ by: ["annotatorId"], where: { ...real, ...inWeek }, ...agg })
        .then(grouped),
    () =>
      db.outputEdit
        .groupBy({ by: ["annotatorId"], where: { ...real, ...inWeek }, ...agg })
        .then(grouped),
    () =>
      options.speech
        ? db.speechRecording
            .groupBy({
              by: ["annotatorId"],
              where: { ...clip, ...inWeek },
              ...agg,
              _sum: { durationMs: true },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.annotatorId,
                n: r._count._all,
                ms: r._sum.durationMs ?? 0,
                last: r._max.createdAt,
              })),
            )
        : empty,
    () =>
      options.speech
        ? db.speechComparison
            .groupBy({
              by: ["annotatorId"],
              where: { ...real, ...inWeek },
              ...agg,
            })
            .then(grouped)
        : empty,
    () =>
      options.speech
        ? db.speechCheck
            .groupBy({
              by: ["reviewerId"],
              where: { ...real, ...inWeek },
              ...agg,
            })
            .then(grouped)
        : empty,
    () =>
      db.pairwiseComparison
        .groupBy({ by: ["annotatorId"], where: real, ...agg })
        .then(grouped),
    () =>
      db.coldAuthorAnswer
        .groupBy({ by: ["annotatorId"], where: real, ...agg })
        .then(grouped),
    () =>
      db.outputEdit
        .groupBy({ by: ["annotatorId"], where: real, ...agg })
        .then(grouped),
    () =>
      options.speech
        ? db.speechRecording
            .groupBy({ by: ["annotatorId"], where: clip, ...agg })
            .then(grouped)
        : empty,
    () =>
      options.speech
        ? db.speechComparison
            .groupBy({ by: ["annotatorId"], where: real, ...agg })
            .then(grouped)
        : empty,
    () =>
      options.speech
        ? db.speechCheck
            .groupBy({ by: ["reviewerId"], where: real, ...agg })
            .then(grouped)
        : empty,
    // The same two reads /api/annotator/summary makes for one person, for all.
    () =>
      db.pairwiseComparison.findMany({
        where: real,
        select: { annotatorId: true, promptId: true },
      }),
    () =>
      db.promptFlag.findMany({
        select: { annotatorId: true, prompt: { select: { promptId: true } } },
      }),
    () => options.queuePrompts,
  ]);

  return assemblePeople({
    users,
    inWeek: { comparisons, answers, edits, clips, listenRounds, checks },
    lastEver: [
      ...lastComparisons,
      ...lastAnswers,
      ...lastEdits,
      ...lastClips,
      ...lastListen,
      ...lastChecks,
    ],
    queuePrompts,
    done,
    skipped: flags.map((f) => ({
      annotatorId: f.annotatorId,
      promptId: f.prompt.promptId,
    })),
  });
}
