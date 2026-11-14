import { countSittings, sumActiveSeconds } from "@/lib/activity";
import {
  longestPossibleMinutes,
  sessionize,
  sessionizeEvents,
} from "@/lib/time-sessions";

/**
 * Hours per person per week (annotator experience spec section 10.4,
 * dashboard spec section 7). Pure: rows in, rows out. The loader is
 * lib/hours-data.ts.
 *
 * Three figures sit side by side and none replaces another:
 *   - active: measured by the activity beat. Null before the beat existed for
 *     that person and week. Never estimated, never back-filled.
 *   - old estimate: what the platform showed until November 2026 (text
 *     submissions less than 30 minutes apart, plus 5 minutes a sitting).
 *     Frozen.
 *   - recounted estimate: the same rule with the work the old one missed
 *     added back (clips with their length, Listen, Check, saved edits).
 *
 * A week runs Monday 00:00 to Sunday 23:59, Lagos time (UTC+1, no daylight
 * saving), because that is where the annotators work and are paid.
 */

export const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 Lagos time of the week `d` falls in, as a UTC instant. */
export function weekStartOf(d: Date): Date {
  const local = d.getTime() + LAGOS_OFFSET_MS;
  const day = Math.floor(local / DAY_MS);
  // 1970-01-01 was a Thursday: day 0 is 3 days after a Monday.
  const monday = day - ((((day + 3) % 7) + 7) % 7);
  return new Date(monday * DAY_MS - LAGOS_OFFSET_MS);
}

export function addWeeks(start: Date, n: number): Date {
  return new Date(start.getTime() + n * WEEK_MS);
}

/** The Lagos calendar date of an instant, "2026-11-09". */
export function lagosDate(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Lagos calendar date starts, or null for a string that is not a date. */
export function fromLagosDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // Reject dates the calendar does not have (2026-02-31).
  if (new Date(t).toISOString().slice(0, 10) !== s) return null;
  return new Date(t - LAGOS_OFFSET_MS);
}

/** The week a `?week=` value names (any day of it), or the week of `now`. */
export function parseWeek(s: string | null | undefined, now: Date): Date {
  return weekStartOf(fromLagosDate(s) ?? now);
}

/** The kinds of saved work the estimates are built from. */
export type EventKind =
  | "comparison"
  | "answer"
  | "correction"
  | "score"
  | "flag"
  | "clip"
  | "listen"
  | "check"
  | "revision";

/** The five kinds the old estimate saw. Frozen with it. */
export const OLD_ESTIMATE_KINDS: readonly EventKind[] = [
  "comparison",
  "answer",
  "correction",
  "score",
  "flag",
];

export interface HoursEvent {
  userId: string;
  kind: EventKind;
  at: Date;
  /** A clip's duration: the event runs for this long before `at`. */
  lengthMs?: number;
}

export interface HoursPing {
  userId: string;
  minute: Date;
  activeSeconds: number;
  isDemo: boolean;
}

export interface HoursNote {
  userId: string;
  weekStart: Date;
  day: string;
  note: string;
  createdAt: Date;
}

export interface HoursUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface WeekRow {
  weekStart: string; // Lagos date of the Monday
  weekEnd: string; // Lagos date of the Sunday
  userId: string;
  name: string;
  email: string;
  role: string;
  /** "measured": the beat ran for this person this week. "estimate": it did not. */
  basis: "measured" | "estimate";
  /** Measured active seconds. Null when not measured: never a made-up number. */
  activeSeconds: number | null;
  recountedMinutes: number;
  oldMinutes: number;
  longestMinutes: number;
  sittings: number;
  submissions: number;
  comparisons: number;
  answersWritten: number;
  edits: number;
  recordings: number;
  recordingSeconds: number;
  listenRounds: number;
  checkVerdicts: number;
  firstActive: string | null;
  lastActive: string | null;
  notes: { day: string; note: string; createdAt: string }[];
}

export interface HoursInput {
  /** Week starts (weekStartOf), any order. */
  weeks: Date[];
  users: HoursUser[];
  events: HoursEvent[];
  pings: HoursPing[];
  notes: HoursNote[];
}

/**
 * One row per person per week in which anything was recorded for them: a
 * saved piece of work, a measured minute or a note. Weeks newest first, then
 * people by measured time, then by the recounted estimate.
 */
export function buildWeekRows(input: HoursInput): WeekRow[] {
  const users = new Map(input.users.map((u) => [u.id, u]));
  const weekKeys = new Set(input.weeks.map((w) => w.getTime()));
  type Bucket = {
    events: HoursEvent[];
    pings: HoursPing[];
    notes: HoursNote[];
  };
  const buckets = new Map<string, Bucket>();
  const bucket = (userId: string, week: number) => {
    const key = `${week}|${userId}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { events: [], pings: [], notes: [] }));
    return b;
  };
  for (const e of input.events) {
    const w = weekStartOf(e.at).getTime();
    if (weekKeys.has(w)) bucket(e.userId, w).events.push(e);
  }
  for (const p of input.pings) {
    if (p.isDemo) continue; // demo sittings are left out of every figure
    const w = weekStartOf(p.minute).getTime();
    if (weekKeys.has(w)) bucket(p.userId, w).pings.push(p);
  }
  for (const n of input.notes) {
    const w = weekStartOf(n.weekStart).getTime();
    if (weekKeys.has(w)) bucket(n.userId, w).notes.push(n);
  }

  const rows: { week: number; row: WeekRow }[] = [];
  for (const [key, b] of buckets) {
    const cut = key.indexOf("|");
    const week = Number(key.slice(0, cut));
    const userId = key.slice(cut + 1);
    const user = users.get(userId);
    if (!user) continue;
    const count = (kind: EventKind) =>
      b.events.filter((e) => e.kind === kind).length;
    const oldEvents = b.events.filter((e) =>
      OLD_ESTIMATE_KINDS.includes(e.kind),
    );
    const old = sessionize(oldEvents.map((e) => e.at));
    const recount = sessionizeEvents(b.events);
    const measured = b.pings.length > 0;
    const stamps = [
      ...b.events.map((e) => e.at.getTime()),
      ...b.pings.map((p) => p.minute.getTime()),
    ];
    const clips = b.events.filter((e) => e.kind === "clip");
    rows.push({
      week,
      row: {
        weekStart: lagosDate(new Date(week)),
        weekEnd: lagosDate(new Date(week + WEEK_MS - DAY_MS)),
        userId,
        name: user.name?.trim() || user.email,
        email: user.email,
        role: user.role,
        basis: measured ? "measured" : "estimate",
        activeSeconds: measured ? sumActiveSeconds(b.pings) : null,
        recountedMinutes: recount.totalMinutes,
        oldMinutes: old.totalMinutes,
        longestMinutes: longestPossibleMinutes(b.events, LAGOS_OFFSET_MS),
        sittings: measured ? countSittings(b.pings) : recount.sessionCount,
        submissions: count("comparison") + count("answer"),
        comparisons: count("comparison"),
        answersWritten: count("answer"),
        edits: count("correction") + count("revision"),
        recordings: clips.length,
        recordingSeconds: Math.round(
          clips.reduce((n, c) => n + (c.lengthMs ?? 0), 0) / 1000,
        ),
        listenRounds: count("listen"),
        checkVerdicts: count("check"),
        firstActive: stamps.length
          ? new Date(Math.min(...stamps)).toISOString()
          : null,
        lastActive: stamps.length
          ? new Date(Math.max(...stamps)).toISOString()
          : null,
        notes: b.notes
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .map((n) => ({
            day: n.day,
            note: n.note,
            createdAt: n.createdAt.toISOString(),
          })),
      },
    });
  }
  rows.sort(
    (a, b) =>
      b.week - a.week ||
      (b.row.activeSeconds ?? -1) - (a.row.activeSeconds ?? -1) ||
      b.row.recountedMinutes - a.row.recountedMinutes ||
      a.row.name.localeCompare(b.row.name),
  );
  return rows.map((r) => r.row);
}

/** Demo seconds in the pings given, so a view can say what it left out. */
export function demoSeconds(pings: HoursPing[]): number {
  return sumActiveSeconds(pings.filter((p) => p.isDemo));
}

/**
 * The one figure an annotator sees for a week: measured time when the beat
 * ran, otherwise the recounted estimate, marked as an estimate.
 */
export function weekFigure(row: WeekRow | undefined): {
  seconds: number;
  basis: "measured" | "estimate";
} {
  if (!row) return { seconds: 0, basis: "estimate" };
  return row.activeSeconds !== null
    ? { seconds: row.activeSeconds, basis: "measured" }
    : { seconds: row.recountedMinutes * 60, basis: "estimate" };
}

/** Hours with one decimal, for tables and the CSV. */
export function hours1(minutes: number): string {
  return (minutes / 60).toFixed(1);
}
