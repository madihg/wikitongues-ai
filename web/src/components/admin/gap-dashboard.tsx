"use client";

import { useEffect, useState } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";

interface GapData {
  totalGaps: number;
  resolved: number;
  remaining: number;
  statusCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

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
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">Loading gap data...</div>
      </div>
    );
  }

  if (!data || data.totalGaps === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">
          Gap Closure Overview
        </h2>
        <p className="mt-4 text-sm text-text-tertiary">
          No gaps identified yet. Gaps are tracked from handoff items flagged
          with gap categories.
        </p>
      </div>
    );
  }

  const maxCategoryCount = Math.max(...Object.values(data.categoryCounts), 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        Gap Closure Overview
        <InfoTip width="w-80">
          Knowledge gaps surfaced when the AI pipeline escalated a
          low-confidence answer, categorized by the linguistic bucket it failed.
          Resolving gaps feeds verified knowledge back into RAG.
        </InfoTip>
      </h2>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4 text-center">
          <div className="text-3xl font-bold text-text-primary">
            {data.totalGaps}
          </div>
          <div className="mt-1 text-xs font-medium text-text-tertiary">
            Total Gaps
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <div className="text-3xl font-bold text-success">{data.resolved}</div>
          <div className="mt-1 text-xs font-medium text-text-tertiary">
            Resolved
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <div className="text-3xl font-bold text-warning">
            {data.remaining}
          </div>
          <div className="mt-1 text-xs font-medium text-text-tertiary">
            Remaining
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-text-secondary">By Bucket</h3>
        <div className="mt-3 space-y-3">
          {Object.entries(data.categoryCounts).map(([bucket, count]) => {
            const pct = (count / maxCategoryCount) * 100;
            return (
              <div key={bucket}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-secondary">
                    {bucketLabel(bucket as EvalBucket)}
                  </span>
                  <span className="tabular-nums text-text-tertiary">
                    {count}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-surface-sunken">
                  <div
                    className="h-2 rounded-full bg-accent"
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
          <h3 className="text-sm font-semibold text-text-secondary">
            Resolution Progress
          </h3>
          <div className="mt-2 h-3 w-full rounded-full bg-surface-sunken">
            <div
              className="h-3 rounded-full bg-success transition-all"
              style={{
                width: `${(data.resolved / data.totalGaps) * 100}%`,
              }}
            />
          </div>
          <div className="mt-1 text-xs text-text-tertiary">
            {Math.round((data.resolved / data.totalGaps) * 100)}% resolved
          </div>
        </div>
      )}
    </div>
  );
}
