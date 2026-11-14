import { buildCsv, type CsvColumn } from "@/lib/export-csv";
import { hours1, type WeekRow } from "@/lib/hours";

/**
 * The hours CSV (dashboard spec 7.4): one row per person per week, for
 * invoices. `active_hours` is empty when the week was not measured for that
 * person, and `basis` says which figure the row rests on, so nobody can read
 * an estimate as a measurement.
 *
 * This file carries the email because it is a pay record, read by the people
 * who pay the annotators. It is not a research export and must not be mixed
 * into one (lib/export-csv.ts keeps emails out of those).
 */
export const HOURS_COLUMNS: CsvColumn<WeekRow>[] = [
  { key: "week_start", get: (r) => r.weekStart },
  { key: "week_end", get: (r) => r.weekEnd },
  { key: "name", get: (r) => r.name },
  { key: "email", get: (r) => r.email },
  { key: "role", get: (r) => r.role },
  {
    key: "active_hours",
    get: (r) => (r.activeSeconds === null ? "" : hours1(r.activeSeconds / 60)),
  },
  { key: "recounted_estimate_hours", get: (r) => hours1(r.recountedMinutes) },
  { key: "old_estimate_hours", get: (r) => hours1(r.oldMinutes) },
  { key: "longest_possible_hours", get: (r) => hours1(r.longestMinutes) },
  { key: "basis", get: (r) => r.basis },
  { key: "sittings", get: (r) => r.sittings },
  { key: "submissions", get: (r) => r.submissions },
  { key: "comparisons", get: (r) => r.comparisons },
  { key: "answers_written", get: (r) => r.answersWritten },
  { key: "edits", get: (r) => r.edits },
  { key: "recordings", get: (r) => r.recordings },
  {
    key: "recording_minutes",
    get: (r) => (r.recordingSeconds / 60).toFixed(1),
  },
  { key: "listen_rounds", get: (r) => r.listenRounds },
  { key: "check_verdicts", get: (r) => r.checkVerdicts },
  { key: "first_active", get: (r) => r.firstActive ?? "" },
  { key: "last_active", get: (r) => r.lastActive ?? "" },
  {
    key: "annotator_note",
    get: (r) => r.notes.map((n) => `${n.day}: ${n.note}`).join(" | "),
  },
];

export function hoursCsv(rows: WeekRow[]): string {
  // Oldest week first: the order an invoice is read in.
  const ordered = [...rows].sort(
    (a, b) =>
      a.weekStart.localeCompare(b.weekStart) || a.name.localeCompare(b.name),
  );
  return buildCsv(HOURS_COLUMNS, ordered);
}

export function hoursCsvFilename(rows: WeekRow[], fallback: string): string {
  const starts = rows.map((r) => r.weekStart).sort();
  const ends = rows.map((r) => r.weekEnd).sort();
  const from = starts[0] ?? fallback;
  const to = ends[ends.length - 1] ?? fallback;
  return `hours_${from}_${to}.csv`;
}
