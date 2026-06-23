"use client";

import { useEffect, useState } from "react";

interface Annotator {
  name: string;
  pairwiseCount: number;
  rubricCount: number;
  handoffCount: number;
  lastActive: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AnnotatorActivity() {
  const [data, setData] = useState<Annotator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/activity")
      .then((res) => res.json())
      .then((json) => setData(json.annotators ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">Loading activity data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">
          Annotator Activity
        </h2>
        <p className="mt-4 text-sm text-text-tertiary">
          No annotator activity recorded yet.
        </p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, a) => ({
      pairwise: acc.pairwise + a.pairwiseCount,
      rubric: acc.rubric + a.rubricCount,
      handoff: acc.handoff + a.handoffCount,
    }),
    { pairwise: 0, rubric: 0, handoff: 0 },
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-text-primary">
        Annotator Activity
      </h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
              <th className="py-3 pr-4">Annotator</th>
              <th className="py-3 pr-4 text-right">Pairwise</th>
              <th className="py-3 pr-4 text-right">Rubric Scores</th>
              <th className="py-3 pr-4 text-right">Handoffs</th>
              <th className="py-3 text-right">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.name} className="border-b border-border">
                <td className="py-3 pr-4 font-medium text-text-primary">
                  {a.name}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                  {a.pairwiseCount}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                  {a.rubricCount}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                  {a.handoffCount}
                </td>
                <td className="py-3 text-right text-text-tertiary">
                  {formatDate(a.lastActive)}
                </td>
              </tr>
            ))}

            <tr className="border-t-2 border-border-strong font-semibold">
              <td className="py-3 pr-4 text-text-primary">Total</td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {totals.pairwise}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {totals.rubric}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {totals.handoff}
              </td>
              <td className="py-3" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
