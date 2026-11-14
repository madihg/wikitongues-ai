import type { CandidateScore } from "@/lib/method-metrics";
import { daysBetween } from "./week";

/**
 * Today, the pure half: which lines "Needs you" shows, the rows of "This
 * week's work", the leader the agreement tile names, and what we hold. No
 * database and no React here, so every threshold is tested on plain values
 * (today.test.ts), and the People view builds its table from the same rows.
 */

// ─── thresholds, in one place ───────────────────────────────────────────────

/** Fewer text prompts left than this and a person is "Running low". */
export const LOW_PROMPTS = 20;
/** Unchecked clips are worth a line from this many on. */
export const UNCHECKED_CLIPS_MIN = 20;
/** Spend is worth a line from this share of the monthly cap on. */
export const SPEND_SHARE_MIN = 0.8;
/** A person who worked in the last 30 days but not in the last 7 is quiet. */
export const QUIET_DAYS = 7;
export const RECENT_DAYS = 30;

// ─── people ─────────────────────────────────────────────────────────────────

/** One person's work in one week, plus where they stand now. Numbers only. */
export interface PersonWeek {
  id: string;
  name: string;
  role: string;
  /** Blind comparisons judged in the week. */
  comparisons: number;
  /** Own answers written in the week. */
  answers: number;
  /** Corrections to model answers saved in the week. */
  edits: number;
  /** Clips recorded in the week, and their length. */
  clips: number;
  clipMinutes: number;
  /** Listen rounds judged and clips checked in the week. */
  listenRounds: number;
  checks: number;
  /** Text prompts the Annotate page would still serve this person. */
  promptsLeft: number;
  /** The last thing this person saved, ever. Null when nothing is on record. */
  lastActiveAt: string | null;
}

export const submissionsOf = (p: PersonWeek) => p.comparisons + p.answers;

/** Whether the week holds any work at all for this person. */
export const workedInWeek = (p: PersonWeek) =>
  submissionsOf(p) + p.edits + p.clips + p.listenRounds + p.checks > 0;

export const runningLow = (p: PersonWeek) => p.promptsLeft < LOW_PROMPTS;

/**
 * The rows of "This week's work" and of the People table: everyone who worked
 * in the week, most submissions first, then by name so the order is stable.
 */
export function weekRows(people: PersonWeek[]): PersonWeek[] {
  return people
    .filter(workedInWeek)
    .sort(
      (a, b) =>
        submissionsOf(b) +
          b.edits +
          b.clips -
          (submissionsOf(a) + a.edits + a.clips) ||
        a.name.localeCompare(b.name),
    );
}

export interface WeekTotals {
  people: number;
  submissions: number;
  edits: number;
  clips: number;
  clipMinutes: number;
  listenAndCheck: number;
}

export function weekTotals(rows: PersonWeek[]): WeekTotals {
  return rows.reduce<WeekTotals>(
    (t, p) => ({
      people: t.people + 1,
      submissions: t.submissions + submissionsOf(p),
      edits: t.edits + p.edits,
      clips: t.clips + p.clips,
      clipMinutes: t.clipMinutes + p.clipMinutes,
      listenAndCheck: t.listenAndCheck + p.listenRounds + p.checks,
    }),
    {
      people: 0,
      submissions: 0,
      edits: 0,
      clips: 0,
      clipMinutes: 0,
      listenAndCheck: 0,
    },
  );
}

/** People with anything on record in the last 30 days: the working team. */
export function recentlyActive(people: PersonWeek[], now: Date): PersonWeek[] {
  return people.filter(
    (p) =>
      p.lastActiveAt !== null &&
      daysBetween(new Date(p.lastActiveAt), now) < RECENT_DAYS,
  );
}

// ─── needs you ──────────────────────────────────────────────────────────────

export interface NeedsYouInput {
  now: Date;
  people: PersonWeek[];
  flags: { open: number; oldestAt: string | null };
  /** Null when speech is off: no line, and no query was made. */
  uncheckedClips: number | null;
  /** Unread alerts of the last three days, newest first. */
  alerts: Array<{ id: string; message: string }>;
  /** Speech training spend this month against its cap. Null when speech is off. */
  spend: { monthUsd: number; capUsd: number } | null;
}

export interface NeedsYouLine {
  key: string;
  /** One sentence, the number first. */
  text: string;
  href: string;
  /** Two or three words. */
  linkLabel: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The "Needs you" list. A line exists only above its threshold; an empty
 * array means the block is not drawn at all. The corrections waiting for
 * a second reader are deliberately absent: nobody has been named to read
 * them, and a line nobody can act on teaches people to ignore the list.
 */
export function needsYou(input: NeedsYouInput): NeedsYouLine[] {
  const lines: NeedsYouLine[] = [];
  const team = recentlyActive(input.people, input.now);

  const low = team.filter(runningLow).length;
  if (low >= 1) {
    lines.push({
      key: "low-prompts",
      text: `${low} ${plural(low, "annotator has", "annotators have")} fewer than ${LOW_PROMPTS} prompts left.`,
      href: "/admin/people",
      linkLabel: "See people",
    });
  }

  if (input.flags.open >= 1) {
    const age = input.flags.oldestAt
      ? daysBetween(new Date(input.flags.oldestAt), input.now)
      : 0;
    lines.push({
      key: "flags",
      text: `${input.flags.open} prompt ${plural(input.flags.open, "flag is", "flags are")} open. The oldest is ${age} ${plural(age, "day", "days")} old.`,
      href: "/admin/data/prompts",
      linkLabel: "See prompts",
    });
  }

  if (
    input.uncheckedClips !== null &&
    input.uncheckedClips >= UNCHECKED_CLIPS_MIN
  ) {
    lines.push({
      key: "unchecked-clips",
      text: `${input.uncheckedClips} clips have not been checked.`,
      href: "/admin/data/clips",
      linkLabel: "See clips",
    });
  }

  for (const a of input.alerts) {
    lines.push({
      key: `alert-${a.id}`,
      text: a.message,
      href: "/admin/speech/loop",
      linkLabel: "See the run",
    });
  }

  if (input.spend && input.spend.capUsd > 0) {
    const share = input.spend.monthUsd / input.spend.capUsd;
    if (share >= SPEND_SHARE_MIN) {
      lines.push({
        key: "spend",
        text: `Speech training spend this month is at ${Math.round(share * 100)}% of the cap.`,
        href: "/admin/speech/loop",
        linkLabel: "See the cap",
      });
    }
  }

  for (const p of team) {
    const quiet = daysBetween(new Date(p.lastActiveAt!), input.now);
    if (quiet >= QUIET_DAYS) {
      lines.push({
        key: `quiet-${p.id}`,
        text: `${p.name} has recorded no work for ${quiet} days.`,
        href: `/admin/people`,
        linkLabel: "See people",
      });
    }
  }

  return lines;
}

// ─── the models ─────────────────────────────────────────────────────────────

/**
 * The model the agreement tile names: the first scoreable row of the
 * Benchmark bars, in the order the metrics module sorted them. The same rule
 * BenchmarkBars uses for its highlighted bar, so Today and the Benchmark tab
 * can never name two different leaders.
 */
export function benchmarkLeader(
  candidates: CandidateScore[],
): { name: string; approach: string; score: number } | null {
  const first = candidates.find((c) => c.agreementScore !== null);
  if (!first || first.agreementScore === null) return null;
  return {
    name: first.name,
    approach: first.approach,
    score: first.agreementScore,
  };
}

// ─── what we hold ───────────────────────────────────────────────────────────

export interface Holding {
  key: string;
  label: string;
  total: number;
  /** Added inside the week on screen. */
  inWeek: number;
  /** "minutes" renders one decimal; "count" renders a whole number. */
  unit: "count" | "minutes";
}

export interface HoldingsInput {
  answers: { total: number; inWeek: number };
  comparisons: { total: number; inWeek: number };
  corrections: { total: number; inWeek: number };
  /** Null when speech is off. */
  speechMs: { total: number; inWeek: number } | null;
}

export function holdings(input: HoldingsInput): Holding[] {
  const out: Holding[] = [
    {
      key: "answers",
      label: "answers written",
      unit: "count",
      ...input.answers,
    },
    {
      key: "comparisons",
      label: "comparisons",
      unit: "count",
      ...input.comparisons,
    },
    {
      key: "corrections",
      label: "corrections",
      unit: "count",
      ...input.corrections,
    },
  ];
  if (input.speechMs) {
    out.push({
      key: "speech",
      label: "minutes of speech recorded",
      unit: "minutes",
      total: input.speechMs.total / 60_000,
      inWeek: input.speechMs.inWeek / 60_000,
    });
  }
  return out;
}

export function formatHolding(h: Holding): { total: string; inWeek: string } {
  const f = (n: number) =>
    h.unit === "minutes"
      ? (Math.round(n * 10) / 10).toLocaleString("en-US")
      : Math.round(n).toLocaleString("en-US");
  return { total: f(h.total), inWeek: `+${f(h.inWeek)}` };
}
