import Link from "next/link";
import { LOW_PROMPTS, runningLow, type PersonWeek } from "@/lib/admin/today";

/**
 * Who is running out of prompts. One number per person: the text prompts the
 * Annotate page would still serve them, fewest first. Everything else about
 * the week (hours, submissions, edits, recordings) is in the hours table
 * below this one, so it is not repeated here.
 */
export function PromptsLeftTable({ people }: { people: PersonWeek[] }) {
  if (people.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-text-tertiary">
        Nobody has recorded any work in the last 30 days.
      </p>
    );
  }
  const rows = [...people].sort(
    (a, b) => a.promptsLeft - b.promptsLeft || a.name.localeCompare(b.name),
  );
  return (
    <div className="max-w-xl overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs text-text-tertiary">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Prompts left</th>
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
              <td className="px-3 py-2.5 tabular-nums">
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
      </table>
    </div>
  );
}
