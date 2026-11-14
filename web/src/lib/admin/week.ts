/**
 * The working week, for every researcher view that counts work: Monday 00:00
 * to Sunday 23:59, Lagos time. Lagos is UTC+1 all year (no daylight saving),
 * so the offset is a constant. Pure.
 */

export const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export interface Week {
  /** First instant of the week (Monday 00:00 in Lagos), as a UTC instant. */
  start: Date;
  /** First instant of the next week. The week is [start, end). */
  end: Date;
  /** "Week of Mon 9 Nov" */
  label: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The week that holds `now`, shifted by whole weeks (-1 is last week). */
export function weekOf(now: Date, shiftWeeks = 0): Week {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const sinceMonday = (lagos.getUTCDay() + 6) % 7;
  const mondayLagos = Date.UTC(
    lagos.getUTCFullYear(),
    lagos.getUTCMonth(),
    lagos.getUTCDate() - sinceMonday,
  );
  const start = new Date(mondayLagos - LAGOS_OFFSET_MS + shiftWeeks * WEEK_MS);
  const monday = new Date(start.getTime() + LAGOS_OFFSET_MS);
  return {
    start,
    end: new Date(start.getTime() + WEEK_MS),
    label: `Week of Mon ${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}`,
  };
}

/** Whole days between two instants, rounded down, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}
