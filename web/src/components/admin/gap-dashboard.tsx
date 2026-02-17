"use client";

import { useEffect, useState } from "react";

interface GapData {
  totalGaps: number;
  resolved: number;
  remaining: number;
  statusCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

const GAP_CATEGORY_LABELS: Record<string, string> = {
  missing_vocabulary: "Missing Vocabulary",
  missing_cultural_context: "Missing Cultural Context",
  missing_dialect_knowledge: "Missing Dialect Knowledge",
  missing_translation_pair: "Missing Translation Pair",
};

const GAP_CATEGORY_COLORS: Record<string, string> = {
  missing_vocabulary: "bg-blue-500",
  missing_cultural_context: "bg-purple-500",
  missing_dialect_knowledge: "bg-amber-500",
  missing_translation_pair: "bg-rose-500",
};

export function GapDashboard() {
  const [data, setData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/gaps")
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-400">Loading gap data...</div>
      </div>
    );
  }

  if (!data || data.totalGaps === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Gap Closure Overview
        </h2>
        <p className="mt-4 text-sm text-gray-500">
          No gaps identified yet. Gaps are tracked from handoff items flagged
          with gap categories.
        </p>
      </div>
    );
  }

  const maxCategoryCount = Math.max(...Object.values(data.categoryCounts), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Gap Closure Overview
      </h2>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-100 p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">
            {data.totalGaps}
          </div>
          <div className="mt-1 text-xs font-medium text-gray-500">
            Total Gaps
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 p-4 text-center">
          <div className="text-3xl font-bold text-green-600">
            {data.resolved}
          </div>
          <div className="mt-1 text-xs font-medium text-gray-500">Resolved</div>
        </div>
        <div className="rounded-lg border border-gray-100 p-4 text-center">
          <div className="text-3xl font-bold text-orange-600">
            {data.remaining}
          </div>
          <div className="mt-1 text-xs font-medium text-gray-500">
            Remaining
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700">By Category</h3>
        <div className="mt-3 space-y-3">
          {Object.entries(data.categoryCounts).map(([category, count]) => {
            const pct = (count / maxCategoryCount) * 100;
            return (
              <div key={category}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">
                    {GAP_CATEGORY_LABELS[category] ?? category}
                  </span>
                  <span className="tabular-nums text-gray-500">{count}</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${GAP_CATEGORY_COLORS[category] ?? "bg-gray-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.resolved > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700">
            Resolution Progress
          </h3>
          <div className="mt-2 h-3 w-full rounded-full bg-gray-100">
            <div
              className="h-3 rounded-full bg-green-500 transition-all"
              style={{
                width: `${(data.resolved / data.totalGaps) * 100}%`,
              }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {Math.round((data.resolved / data.totalGaps) * 100)}% resolved
          </div>
        </div>
      )}
    </div>
  );
}
