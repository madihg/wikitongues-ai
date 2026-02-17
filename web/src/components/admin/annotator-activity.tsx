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
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-400">Loading activity data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Annotator Activity
        </h2>
        <p className="mt-4 text-sm text-gray-500">
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
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Annotator Activity
      </h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="py-3 pr-4">Annotator</th>
              <th className="py-3 pr-4 text-right">Pairwise</th>
              <th className="py-3 pr-4 text-right">Rubric Scores</th>
              <th className="py-3 pr-4 text-right">Handoffs</th>
              <th className="py-3 text-right">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.name} className="border-b border-gray-50">
                <td className="py-3 pr-4 font-medium text-gray-900">
                  {a.name}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                  {a.pairwiseCount}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                  {a.rubricCount}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                  {a.handoffCount}
                </td>
                <td className="py-3 text-right text-gray-500">
                  {formatDate(a.lastActive)}
                </td>
              </tr>
            ))}

            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="py-3 pr-4 text-gray-900">Total</td>
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
