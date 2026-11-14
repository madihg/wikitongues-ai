"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { hours1, type WeekRow } from "@/lib/hours";

/**
 * Hours per person per week (annotator experience spec 10.4, dashboard spec
 * section 7). Three figures side by side: active hours measured by the
 * activity beat, the recounted estimate, and the old estimate exactly as it
 * was shown before. Past weeks are never rewritten: a week the beat did not
 * measure says "Not measured", never a number.
 */
interface HoursResponse {
  week: { start: string; end: string; isCurrent: boolean };
  rows: WeekRow[];
  measuredSince: string | null;
  demoMinutesLeftOut: number;
  revisionsCounted: boolean;
}

export const HOURS_COPY = {
  title: "Time on Platform",
  lead: "Who worked, and for how many hours. One row per person for the week shown.",
  active:
    "Time with the platform open and in use. It stops after 5 minutes without typing, clicking, recording or listening.",
  recounted:
    "The same rule as the old estimate, with clips, listening, checking and saved edits added back.",
  old: "The figure shown before the clock was added. It only counted text submissions made less than 30 minutes apart. It is kept as it was.",
  edits: "Corrections to model answers and saved changes to your own answers.",
  editsCorrectionsOnly:
    "Corrections to model answers. Saved changes to own answers are added once the edit log is switched on.",
  notMeasured: "Not measured",
  empty: "No work recorded this week.",
  footerOld:
    "The old estimate missed edits, recordings, and anything longer than 30 minutes between two submissions.",
  download: "Download CSV",
} as const;

/** "Mon 9 Nov" from a Lagos date string "2026-11-09". */
export function weekLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "17 Nov" from an ISO instant, in Lagos time. */
function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lagos",
  });
}

function shiftWeek(isoDate: string, weeks: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + weeks * 7 * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Title-cased role label for the muted pill, e.g. "RESEARCHER" -> "Researcher". */
function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function Th({
  children,
  help,
  right = true,
}: {
  children: React.ReactNode;
  help?: string;
  right?: boolean;
}) {
  return (
    <th className={`py-3 pr-4 ${right ? "text-right" : ""}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {help && <InfoTip width="w-72">{help}</InfoTip>}
      </span>
    </th>
  );
}

/** The table itself, without the fetch, so it renders in a test. */
export function HoursTable({ data }: { data: HoursResponse }) {
  const { rows } = data;
  const num = "py-3 pr-4 text-right tabular-nums text-text-secondary";
  const sum = (pick: (r: WeekRow) => number) =>
    rows.reduce((n, r) => n + pick(r), 0);
  const anyMeasured = rows.some((r) => r.activeSeconds !== null);

  return (
    <>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-tertiary">{HOURS_COPY.empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <Th right={false}>Person</Th>
                <Th help={HOURS_COPY.active}>Active hours</Th>
                <Th help={HOURS_COPY.recounted}>Recounted</Th>
                <Th help={HOURS_COPY.old}>Old estimate</Th>
                <Th>Sittings</Th>
                <Th>Submissions</Th>
                <Th
                  help={
                    data.revisionsCounted
                      ? HOURS_COPY.edits
                      : HOURS_COPY.editsCorrectionsOnly
                  }
                >
                  Edits
                </Th>
                <Th>Recordings</Th>
                <Th>Listen and Check</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium text-text-primary">
                    <div className="flex items-center gap-2">
                      <span>{r.name}</span>
                      {r.role !== "ANNOTATOR" && (
                        <span className="inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-tertiary">
                          {roleLabel(r.role)}
                        </span>
                      )}
                    </div>
                    {r.notes.map((n, i) => (
                      <p
                        key={i}
                        className="mt-1 max-w-md text-xs font-normal text-text-tertiary"
                      >
                        <span className="font-medium text-text-secondary">
                          Note from {r.name.split(" ")[0]}, {weekLabel(n.day)}:
                        </span>{" "}
                        {n.note}
                      </p>
                    ))}
                  </td>
                  <td className={num}>
                    {r.activeSeconds === null ? (
                      <span className="text-text-tertiary">
                        {HOURS_COPY.notMeasured}
                      </span>
                    ) : (
                      <span className="font-medium text-text-primary">
                        {hours1(r.activeSeconds / 60)}
                      </span>
                    )}
                  </td>
                  <td className={num}>{hours1(r.recountedMinutes)}</td>
                  <td className={num}>{hours1(r.oldMinutes)}</td>
                  <td className={num}>{r.sittings}</td>
                  <td className={num}>{r.submissions}</td>
                  <td className={num}>{r.edits}</td>
                  <td className={num}>
                    {r.recordings}
                    {r.recordings > 0 && (
                      <span className="text-text-tertiary">
                        {" "}
                        ({Math.round(r.recordingSeconds / 60)} min)
                      </span>
                    )}
                  </td>
                  <td className={num}>{r.listenRounds + r.checkVerdicts}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-3 pr-4 text-text-primary">Total</td>
                <td className={num}>
                  {anyMeasured
                    ? hours1(sum((r) => r.activeSeconds ?? 0) / 60)
                    : HOURS_COPY.notMeasured}
                </td>
                <td className={num}>
                  {hours1(sum((r) => r.recountedMinutes))}
                </td>
                <td className={num}>{hours1(sum((r) => r.oldMinutes))}</td>
                <td className={num}>{sum((r) => r.sittings)}</td>
                <td className={num}>{sum((r) => r.submissions)}</td>
                <td className={num}>{sum((r) => r.edits)}</td>
                <td className={num}>{sum((r) => r.recordings)}</td>
                <td className={num}>
                  {sum((r) => r.listenRounds + r.checkVerdicts)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-1 text-xs text-text-tertiary">
        <p>
          {data.measuredSince
            ? `Active hours are measured since ${sinceLabel(data.measuredSince)}. Earlier weeks show the two estimates only.`
            : "Active hours are not measured yet. Every week shows the two estimates only."}
        </p>
        <p>{HOURS_COPY.footerOld}</p>
        {data.demoMinutesLeftOut > 0 && (
          <p>
            {data.demoMinutesLeftOut} demo{" "}
            {data.demoMinutesLeftOut === 1 ? "minute was" : "minutes were"} left
            out.
          </p>
        )}
      </div>
    </>
  );
}

export function TimeSpent() {
  // null: this week. Otherwise the Lagos date of the Monday shown.
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<HoursResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/time-spent${week ? `?week=${week}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: HoursResponse) => {
        if (!live) return;
        setData(json);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [week]);

  const shown = data?.week.start ?? week;
  const btn =
    "rounded border border-border px-2 py-1 text-sm text-text-secondary hover:bg-surface-sunken disabled:opacity-40";

  return (
    <div
      id="hours"
      className="rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {HOURS_COPY.title}
          </h2>
          <p className="mt-1 text-sm text-text-tertiary">{HOURS_COPY.lead}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">
            {shown ? `Week of ${weekLabel(shown)}` : "This week"}
          </span>
          <button
            type="button"
            className={btn}
            aria-label="Earlier week"
            disabled={!shown}
            onClick={() => shown && setWeek(shiftWeek(shown, -1))}
          >
            &lt;
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Later week"
            disabled={!shown || (data?.week.isCurrent ?? true)}
            onClick={() => shown && setWeek(shiftWeek(shown, 1))}
          >
            &gt;
          </button>
          <a
            className={btn}
            href={`/api/admin/time-spent?format=csv${shown ? `&week=${shown}` : ""}`}
          >
            {HOURS_COPY.download}
          </a>
          <a
            className={btn}
            href={`/api/admin/time-spent?format=csv&weeks=26${shown ? `&week=${shown}` : ""}`}
          >
            CSV, last 26 weeks
          </a>
        </div>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-danger">
          Could not load the hours. Refresh the page to try again.
        </p>
      ) : !data ? (
        <p className="mt-4 text-sm text-text-muted">Loading hours...</p>
      ) : (
        <HoursTable data={data} />
      )}
    </div>
  );
}
