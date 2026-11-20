import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeekRow } from "@/lib/hours";
import { HOURS_COPY, HoursTable, TotalsTable, weekLabel } from "./time-spent";

const row = (over: Partial<WeekRow> = {}): WeekRow => ({
  weekStart: "2026-11-09",
  weekEnd: "2026-11-15",
  userId: "agnes",
  name: "Agnes Test",
  email: "agnes@example.org",
  role: "RESEARCHER",
  basis: "measured",
  activeSeconds: 21.5 * 3600,
  recountedMinutes: 9.8 * 60,
  oldMinutes: 3.4 * 60,
  longestMinutes: 22 * 60,
  sittings: 9,
  submissions: 0,
  comparisons: 0,
  answersWritten: 0,
  edits: 31,
  recordings: 93,
  recordingSeconds: 11 * 60,
  listenRounds: 2,
  checkVerdicts: 3,
  firstActive: null,
  lastActive: null,
  notes: [],
  ...over,
});
const data = (rows: WeekRow[], over = {}) => ({
  week: { start: "2026-11-09", end: "2026-11-15", isCurrent: true },
  rows,
  measuredSince: "2026-11-16T08:00:00.000Z",
  demoMinutesLeftOut: 0,
  revisionsCounted: true,
  ...over,
});
const render = (d: ReturnType<typeof data>) =>
  renderToStaticMarkup(<HoursTable data={d} />);

describe("HoursTable (the weekly researcher table)", () => {
  it("shows the measure, the recount and the old estimate side by side", () => {
    const html = render(data([row()]));
    for (const h of ["Active hours", "Recounted", "Old estimate", "Sittings", "Submissions", "Edits", "Recordings", "Listen and Check"]) {
      expect(html).toContain(h);
    }
    expect(html).toContain("21.5");
    expect(html).toContain("9.8");
    expect(html).toContain("3.4");
    expect(html).toContain("93");
    expect(html).toContain("(11 min)");
  });

  it("a week that was not measured says so: a made-up number never stands in", () => {
    const html = render(
      data([row({ basis: "estimate", activeSeconds: null })], { measuredSince: null }),
    );
    expect(html).toContain("Not measured");
    expect(html).not.toContain("21.5");
    expect(html).toContain("Active hours are not measured yet.");
  });

  it("says since when active hours are measured, and what the old estimate missed", () => {
    const html = render(data([row()]));
    expect(html).toContain(
      "Active hours are measured since 16 Nov. Earlier weeks show the two estimates only.",
    );
    expect(html).toContain(
      "The old estimate missed edits, recordings, and anything longer than 30 minutes between two submissions.",
    );
  });

  it("shows the annotator's note on the week, and how many demo minutes were left out", () => {
    const html = render(
      data(
        [row({ notes: [{ day: "2026-11-12", note: "I recorded all morning.", createdAt: "" }] })],
        { demoMinutesLeftOut: 12 },
      ),
    );
    expect(html).toContain("Note from Agnes, Thu 12 Nov:");
    expect(html).toContain("I recorded all morning.");
    expect(html).toContain("12 demo minutes were left out.");
  });

  it("an empty week has its own line", () => {
    expect(render(data([]))).toContain(HOURS_COPY.empty);
  });

  it("labels a week by its Monday", () => {
    expect(weekLabel("2026-11-09")).toBe("Mon 9 Nov");
  });
});

describe("TotalsTable (running total per person)", () => {
  it("adds up measured weeks, keeps estimated weeks apart, edits included", () => {
    const html = renderToStaticMarkup(
      <TotalsTable
        data={data([
          row({ weekStart: "2026-11-16", activeSeconds: 3 * 3600, edits: 4 }),
          row({ weekStart: "2026-11-09", activeSeconds: 2 * 3600, edits: 6 }),
          row({
            weekStart: "2026-11-02",
            basis: "estimate",
            activeSeconds: null,
            recountedMinutes: 90,
            edits: 1,
          }),
          row({
            userId: "ajuma",
            name: "Ajuma Test",
            role: "ANNOTATOR",
            activeSeconds: 3600,
            edits: 0,
          }),
        ])}
      />,
    );
    expect(html).toContain("over the last 26 weeks, edits and revisions included");
    expect(html).toContain(">5.0<"); // 3 h + 2 h measured
    expect(html).toContain("1.5 (1 wk)"); // the unmeasured week, apart
    expect(html).toContain(">11<"); // edits over the three weeks
    // Agnes (more hours) is listed before Ajuma.
    expect(html.indexOf("Agnes Test")).toBeLessThan(html.indexOf("Ajuma Test"));
  });

  it("says so when nobody worked", () => {
    const html = renderToStaticMarkup(<TotalsTable data={data([])} />);
    expect(html).toContain(HOURS_COPY.totalEmpty);
  });
});
