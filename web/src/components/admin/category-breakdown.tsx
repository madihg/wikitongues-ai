"use client";

import { useEffect, useState } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";

interface CategoryModel {
  model: string;
  axes: Record<string, number>;
  count: number;
}

interface AxisDef {
  key: string;
  label: string;
}

type BreakdownData = Record<string, Record<string, CategoryModel[]>>;

const LANGUAGE_LABELS: Record<string, string> = {
  igala: "Igala",
};

/** Compact column header from an axis label, e.g. "Diacritics & tone marks" -> "Diacr." */
function shortAxis(label: string): string {
  const first = label.split(/[\s&]/)[0];
  return first.length > 6 ? `${first.slice(0, 5)}.` : first;
}

export function CategoryBreakdown() {
  const [data, setData] = useState<BreakdownData>({});
  const [axes, setAxes] = useState<AxisDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/category-breakdown")
      .then((res) => res.json())
      .then((json) => {
        setData(json.breakdown ?? {});
        setAxes(json.axes ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">
          Loading category breakdown...
        </div>
      </div>
    );
  }

  const languages = Object.keys(data);

  if (languages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">
          Rubric Scores by Category
        </h2>
        <p className="mt-4 text-sm text-text-tertiary">
          No rubric data available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        Rubric Scores by Category
        <InfoTip width="w-80">
          Mean rubric v2 axis scores (0-5) broken down by the 8 evaluation
          buckets. N/A judgments are excluded from means; a dash means the axis
          hasn&apos;t been scored in that bucket yet.
        </InfoTip>
      </h2>

      {languages.map((lang) => (
        <div key={lang} className="mt-6">
          <h3 className="text-sm font-semibold text-text-secondary">
            {LANGUAGE_LABELS[lang] ?? lang}
          </h3>

          <div className="mt-3 grid gap-4">
            {Object.entries(data[lang]).map(([bucket, models]) => {
              return (
                <div
                  key={bucket}
                  className="rounded-lg border border-border p-4"
                >
                  <span className="inline-block rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                    {bucketLabel(bucket as EvalBucket)}
                  </span>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-text-tertiary">
                          <th className="pb-1 pr-2 font-medium">Model</th>
                          {axes.map((a) => (
                            <th
                              key={a.key}
                              title={a.label}
                              className="pb-1 pr-2 text-right font-medium"
                            >
                              {shortAxis(a.label)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {models.map((m) => (
                          <tr key={m.model} className="border-t border-border">
                            <td className="py-1.5 pr-2 font-medium text-text-secondary">
                              {m.model}
                            </td>
                            {axes.map((a) => (
                              <td
                                key={a.key}
                                className="py-1.5 pr-2 text-right tabular-nums text-text-secondary"
                              >
                                {m.axes[a.key] ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
