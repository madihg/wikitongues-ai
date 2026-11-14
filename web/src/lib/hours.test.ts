import { describe, it, expect } from "vitest";
import {
  addWeeks,
  buildWeekRows,
  demoSeconds,
  fromLagosDate,
  lagosDate,
  parseWeek,
  weekFigure,
  weekStartOf,
  type HoursEvent,
  type HoursPing,
} from "./hours";
import { hoursCsv, hoursCsvFilename } from "./hours-csv";
import { sessionize } from "./time-sessions";

const d = (iso: string) => new Date(iso);
const USERS = [
  { id: "agnes", name: "Agnes Test", email: "agnes@example.org", role: "RESEARCHER" },
  { id: "austine", name: null, email: "austine@example.org", role: "ANNOTATOR" },
];
// Monday 9 Nov 2026, 00:00 in Lagos, is Sunday 8 Nov 23:00 UTC.
const WEEK = d("2026-11-08T23:00:00Z");
const PAST = addWeeks(WEEK, -1);

describe("weeks run Monday to Sunday in Lagos time", () => {
  it("finds the Monday for any moment of the week", () => {
    expect(weekStartOf(d("2026-11-13T12:00:00Z"))).toEqual(WEEK);
    expect(weekStartOf(d("2026-11-08T23:00:00Z"))).toEqual(WEEK); // Mon 00:00 Lagos
    expect(weekStartOf(d("2026-11-15T22:59:59Z"))).toEqual(WEEK); // Sun 23:59 Lagos
  });

  it("Sunday 23:30 UTC is already Monday in Lagos: the next week", () => {
    expect(weekStartOf(d("2026-11-08T22:59:00Z"))).toEqual(PAST);
    expect(weekStartOf(d("2026-11-15T23:30:00Z"))).toEqual(addWeeks(WEEK, 1));
  });

  it("reads and writes Lagos dates, and refuses what is not a date", () => {
    expect(lagosDate(WEEK)).toBe("2026-11-09");
    expect(fromLagosDate("2026-11-09")).toEqual(WEEK);
    expect(fromLagosDate("2026-02-31")).toBeNull();
    expect(fromLagosDate("9 Nov")).toBeNull();
    expect(parseWeek("2026-11-12", d("2030-01-01T00:00:00Z"))).toEqual(WEEK);
    expect(parseWeek("junk", d("2026-11-13T12:00:00Z"))).toEqual(WEEK);
  });
});

/** A working day: text events, clips, a Listen round, a Check, a saved edit. */
function agnesWeek(): HoursEvent[] {
  const at = (hhmm: string) => d(`2026-11-12T${hhmm}:00Z`);
  const e = (kind: HoursEvent["kind"], hhmm: string, lengthMs?: number) => ({
    userId: "agnes",
    kind,
    at: at(hhmm),
    lengthMs,
  });
  return [
    e("answer", "09:00"),
    e("comparison", "09:10"),
    e("score", "09:10"),
    e("correction", "09:20"),
    // An hour of recording the old estimate never saw.
    ...["09:40", "10:00", "10:20", "10:40"].map((t) => e("clip", t, 12_000)),
    e("listen", "10:50"),
    e("check", "11:00"),
    e("revision", "11:20"),
    e("answer", "11:40"),
  ];
}

describe("buildWeekRows", () => {
  const pings: HoursPing[] = [
    // 3 measured minutes in the current week, one of them split over two kinds of work.
    { userId: "agnes", minute: d("2026-11-12T09:00:00Z"), activeSeconds: 60, isDemo: false },
    { userId: "agnes", minute: d("2026-11-12T09:01:00Z"), activeSeconds: 40, isDemo: false },
    { userId: "agnes", minute: d("2026-11-12T09:01:00Z"), activeSeconds: 40, isDemo: false },
    { userId: "agnes", minute: d("2026-11-12T11:00:00Z"), activeSeconds: 30, isDemo: false },
    { userId: "agnes", minute: d("2026-11-12T11:01:00Z"), activeSeconds: 60, isDemo: true },
  ];
  const pastEvents: HoursEvent[] = [
    { userId: "agnes", kind: "answer", at: d("2026-11-04T09:00:00Z") },
    { userId: "agnes", kind: "answer", at: d("2026-11-04T09:20:00Z") },
    { userId: "austine", kind: "comparison", at: d("2026-11-12T08:00:00Z") },
  ];
  const rows = buildWeekRows({
    weeks: [WEEK, PAST],
    users: USERS,
    events: [...agnesWeek(), ...pastEvents],
    pings,
    notes: [
      {
        userId: "agnes",
        weekStart: PAST,
        day: "2026-11-04",
        note: "I corrected old answers all day.",
        createdAt: d("2026-11-13T10:00:00Z"),
      },
    ],
  });
  const row = (userId: string, weekStart: string) =>
    rows.find((r) => r.userId === userId && r.weekStart === weekStart)!;
  const now = row("agnes", "2026-11-09");
  const past = row("agnes", "2026-11-02");

  it("a measured week shows the measured time, capped at 60 seconds a minute, demo left out", () => {
    expect(now.basis).toBe("measured");
    expect(now.activeSeconds).toBe(60 + 60 + 30);
    expect(demoSeconds(pings)).toBe(60);
  });

  it("a past week shows the old estimate and no measured figure, never a made-up number", () => {
    expect(past.basis).toBe("estimate");
    expect(past.activeSeconds).toBeNull();
    expect(past.oldMinutes).toBe(25);
    expect(past.recountedMinutes).toBe(25);
  });

  it("the old estimate is frozen: exactly sessionize over the five kinds it always saw", () => {
    const five = agnesWeek()
      .filter((e) => ["answer", "comparison", "score", "correction", "flag"].includes(e.kind))
      .map((e) => e.at);
    expect(now.oldMinutes).toBe(sessionize(five).totalMinutes);
    expect(now.oldMinutes).toBe(30); // 09:00 to 09:20 + 5, then 11:40 alone + 5
  });

  it("the recount adds back clips, Listen, Check and saved edits", () => {
    expect(now.recountedMinutes).toBe(165); // one sitting 09:00 to 11:40, + 5
    expect(now.recountedMinutes).toBeGreaterThan(now.oldMinutes);
    expect(now.longestMinutes).toBe(160);
  });

  it("counts each kind of work", () => {
    expect(now).toMatchObject({
      submissions: 3,
      comparisons: 1,
      answersWritten: 2,
      edits: 2, // one correction, one saved edit
      recordings: 4,
      recordingSeconds: 48,
      listenRounds: 1,
      checkVerdicts: 1,
    });
    expect(now.sittings).toBe(2); // measured: 09:00 to 09:01, then 11:00
    expect(past.sittings).toBe(1); // estimated: one sitting
  });

  it("carries the annotator's note on its own week", () => {
    expect(past.notes).toEqual([
      {
        day: "2026-11-04",
        note: "I corrected old answers all day.",
        createdAt: "2026-11-13T10:00:00.000Z",
      },
    ]);
    expect(now.notes).toEqual([]);
  });

  it("orders weeks newest first, measured people first; a missing name falls back to the email", () => {
    expect(rows.map((r) => [r.weekStart, r.userId])).toEqual([
      ["2026-11-09", "agnes"],
      ["2026-11-09", "austine"],
      ["2026-11-02", "agnes"],
    ]);
    expect(row("austine", "2026-11-09").name).toBe("austine@example.org");
    expect(now.weekEnd).toBe("2026-11-15");
  });

  it("the figure an annotator sees: measured when there is one, otherwise the recount, marked", () => {
    expect(weekFigure(now)).toEqual({ seconds: 150, basis: "measured" });
    expect(weekFigure(past)).toEqual({ seconds: 25 * 60, basis: "estimate" });
    expect(weekFigure(undefined)).toEqual({ seconds: 0, basis: "estimate" });
  });

  describe("the CSV", () => {
    const csv = hoursCsv(rows);
    const lines = csv.trimEnd().split("\n");

    it("has the header of the dashboard spec, ending with annotator_note", () => {
      expect(lines[0]).toBe(
        "week_start,week_end,name,email,role,active_hours,recounted_estimate_hours,old_estimate_hours,longest_possible_hours,basis,sittings,submissions,comparisons,answers_written,edits,recordings,recording_minutes,listen_rounds,check_verdicts,first_active,last_active,annotator_note",
      );
    });

    it("one row per person per week, oldest week first", () => {
      expect(lines).toHaveLength(4);
      expect(lines[1].startsWith("2026-11-02,2026-11-08,Agnes Test,")).toBe(true);
    });

    it("a past week has an empty active_hours cell and basis estimate; a measured week has one decimal", () => {
      const cells = (line: string) => line.split(",");
      const pastCells = cells(lines[1]);
      expect(pastCells[5]).toBe("");
      expect(pastCells[9]).toBe("estimate");
      expect(pastCells[7]).toBe("0.4"); // 25 minutes
      expect(pastCells[21]).toBe("2026-11-04: I corrected old answers all day.");
      const nowCells = cells(lines[2]);
      expect(nowCells[5]).toBe("0.0"); // 150 seconds
      expect(nowCells[9]).toBe("measured");
      expect(nowCells[6]).toBe("2.8"); // 165 minutes
    });

    it("names the file by its span", () => {
      expect(hoursCsvFilename(rows, "x")).toBe("hours_2026-11-02_2026-11-15.csv");
      expect(hoursCsvFilename([], "2026-11-09")).toBe("hours_2026-11-09_2026-11-09.csv");
    });
  });
});
