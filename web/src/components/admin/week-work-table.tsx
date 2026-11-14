import Link from "next/link";
import { InfoTip } from "@/components/info-tip";
import {
  LOW_PROMPTS,
  runningLow,
  submissionsOf,
  type PersonWeek,
  type WeekTotals,
} from "@/lib/admin/today";

/**
 * One row per person who worked in the week. The same rows on Today and on
 * People, from the same loader, so the two pages cannot disagree. Hours are
 * not in this table: they live in the hours table on People, which shows the
 * measured hours beside both estimates.
 */

const minutes = (m: number) => `${Math.round(m * 10) / 10} min`;

export function WeekWorkTable({
  rows,
  totals,
  speech,
}: {
  rows: PersonWeek[];
  totals: WeekTotals;
  /** Show the speech columns (the lab is on). */
  speech: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-text-tertiary">
        No work recorded this week.
      </p>
    );
  }

  const th = "px-3 py-2 text-left font-medium";
  const td = "px-3 py-2.5 tabular-nums";

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border text-xs text-text-tertiary">
          <tr>
            <th className={th}>Name</th>
            <th className={th}>
              <span className="inline-flex items-center gap-1.5">
                Submissions
                <InfoTip label="About submissions">
                  Comparisons judged plus own answers written.
                </InfoTip>
              </span>
            </th>
            <th className={th}>
              <span className="inline-flex items-center gap-1.5">
                Edits
                <InfoTip label="About edits">
                  Corrections to model answers. Saved changes to a person&apos;s
                  own answers are not counted here yet.
                </InfoTip>
              </span>
            </th>
            {speech && <th className={th}>Recordings</th>}
            {speech && <th className={th}>Listen and Check</th>}
            <th className={th}>
              <span className="inline-flex items-center gap-1.5">
                Prompts left
                <InfoTip label="About prompts left">
                  Questions this person can still be given on the Annotate page.
                </InfoTip>
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/annotations?annotator=${p.id}`}
                  className="font-medium text-text-primary hover:text-accent-text"
                  title="Open this person's answers in Data"
                >
                  {p.name}
                </Link>
              </td>
              <td className={td}>{submissionsOf(p)}</td>
              <td className={td}>{p.edits}</td>
              {speech && (
                <td className={td}>
                  {p.clips}
                  {p.clips > 0 && (
                    <span className="ml-1.5 text-text-tertiary">
                      ({minutes(p.clipMinutes)})
                    </span>
                  )}
                </td>
              )}
              {speech && <td className={td}>{p.listenRounds + p.checks}</td>}
              <td className={td}>
                {p.promptsLeft}
                {runningLow(p) && (
                  <span
                    className="ml-2 rounded bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-text-primary"
                    title={`Fewer than ${LOW_PROMPTS} text prompts left`}
                  >
                    Running low
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border text-text-secondary">
          <tr>
            <td className="px-3 py-2.5 font-medium">
              Total, {totals.people} {totals.people === 1 ? "person" : "people"}
            </td>
            <td className={td}>{totals.submissions}</td>
            <td className={td}>{totals.edits}</td>
            {speech && (
              <td className={td}>
                {totals.clips}
                {totals.clips > 0 && (
                  <span className="ml-1.5 text-text-tertiary">
                    ({minutes(totals.clipMinutes)})
                  </span>
                )}
              </td>
            )}
            {speech && <td className={td}>{totals.listenAndCheck}</td>}
            <td className={td} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
