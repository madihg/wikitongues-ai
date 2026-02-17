"use client";

import { useEffect, useState } from "react";

interface CategoryModel {
  model: string;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  creativeDepth: number;
  factualCorrectness: number;
  count: number;
}

type BreakdownData = Record<string, Record<string, CategoryModel[]>>;

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  real_world_use: { bg: "bg-emerald-100", text: "text-emerald-800" },
  words_concepts: { bg: "bg-blue-100", text: "text-blue-800" },
  frontier_aspirations: { bg: "bg-purple-100", text: "text-purple-800" },
  abstract_vs_everyday: { bg: "bg-amber-100", text: "text-amber-800" },
};

const CATEGORY_LABELS: Record<string, string> = {
  real_world_use: "Real World Use",
  words_concepts: "Words & Concepts",
  frontier_aspirations: "Frontier Aspirations",
  abstract_vs_everyday: "Abstract vs. Everyday",
};

const LANGUAGE_LABELS: Record<string, string> = {
  igala: "Igala",
  lebanese_arabic: "Lebanese Arabic",
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
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-400">
          Loading category breakdown...
        </div>
      </div>
    );
  }

  const languages = Object.keys(data);

  if (languages.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Rubric Scores by Category
        </h2>
        <p className="mt-4 text-sm text-gray-500">
          No rubric data available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Rubric Scores by Category
      </h2>

      {languages.map((lang) => (
        <div key={lang} className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700">
            {LANGUAGE_LABELS[lang] ?? lang}
          </h3>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {Object.entries(data[lang]).map(([category, models]) => {
              const colors = CATEGORY_COLORS[category] ?? {
                bg: "bg-gray-100",
                text: "text-gray-800",
              };

              return (
                <div
                  key={category}
                  className="rounded-lg border border-gray-100 p-4"
                >
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                  >
                    {CATEGORY_LABELS[category] ?? category}
                  </span>

                  <table className="mt-3 w-full text-left text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="pb-1 pr-2 font-medium">Model</th>
                        <th className="pb-1 pr-2 text-right font-medium">CA</th>
                        <th className="pb-1 pr-2 text-right font-medium">LA</th>
                        <th className="pb-1 pr-2 text-right font-medium">CD</th>
                        <th className="pb-1 text-right font-medium">FC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m) => (
                        <tr key={m.model} className="border-t border-gray-50">
                          <td className="py-1.5 pr-2 font-medium text-gray-800">
                            {m.model}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">
                            {m.culturalAccuracy}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">
                            {m.linguisticAuthenticity}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">
                            {m.creativeDepth}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-gray-600">
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
