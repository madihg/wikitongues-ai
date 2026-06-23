"use client";

import { useEffect, useState } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";

interface CategoryModel {
  model: string;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
  count: number;
}

type BreakdownData = Record<string, Record<string, CategoryModel[]>>;

const LANGUAGE_LABELS: Record<string, string> = {
  igala: "Igala",
};

export function CategoryBreakdown() {
  const [data, setData] = useState<BreakdownData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/category-breakdown")
      .then((res) => res.json())
      .then((json) => setData(json.breakdown ?? {}))
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
          Performance broken down by the 8 evaluation buckets (orthography,
          grammar/tone, lexicon, dialect, register/honorifics, idioms, cultural
          values, authenticity). Each bucket is a distinct way models fail at
          Igala.
        </InfoTip>
      </h2>

      {languages.map((lang) => (
        <div key={lang} className="mt-6">
          <h3 className="text-sm font-semibold text-text-secondary">
            {LANGUAGE_LABELS[lang] ?? lang}
          </h3>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {Object.entries(data[lang]).map(([bucket, models]) => {
              return (
                <div
                  key={bucket}
                  className="rounded-lg border border-border p-4"
                >
                  <span className="inline-block rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                    {bucketLabel(bucket as EvalBucket)}
                  </span>

                  <table className="mt-3 w-full text-left text-xs">
                    <thead>
                      <tr className="text-text-tertiary">
                        <th className="pb-1 pr-2 font-medium">Model</th>
                        <th className="pb-1 pr-2 text-right font-medium">CA</th>
                        <th className="pb-1 pr-2 text-right font-medium">LA</th>
                        <th className="pb-1 pr-2 text-right font-medium">CN</th>
                        <th className="pb-1 text-right font-medium">FC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m) => (
                        <tr key={m.model} className="border-t border-border">
                          <td className="py-1.5 pr-2 font-medium text-text-secondary">
                            {m.model}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-text-secondary">
                            {m.culturalAccuracy}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-text-secondary">
                            {m.linguisticAuthenticity}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-text-secondary">
                            {m.culturalNormAdherence}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-text-secondary">
                            {m.factualCorrectness}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
