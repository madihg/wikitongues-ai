"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  model: string;
  winRate: number;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  creativeDepth: number;
  factualCorrectness: number;
  overallScore: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
  igala: "Igala",
  lebanese_arabic: "Lebanese Arabic",
};

export function Leaderboard() {
  const [data, setData] = useState<Record<string, LeaderboardEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/leaderboard")
      .then((res) => res.json())
      .then((json) => {
        setData(json.leaderboard ?? {});
        const langs = Object.keys(json.leaderboard ?? {});
        if (langs.length > 0 && !activeTab) {
          setActiveTab(langs[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const languages = Object.keys(data);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-400">Loading leaderboard...</div>
      </div>
    );
  }

  if (languages.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Model Leaderboard
        </h2>
        <p className="mt-4 text-sm text-gray-500">
          No benchmark data available. Run annotations to see results.
        </p>
      </div>
    );
  }

  const entries = data[activeTab] ?? [];
  const bestScore =
    entries.length > 0 ? Math.max(...entries.map((e) => e.overallScore)) : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Model Leaderboard</h2>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === lang
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {LANGUAGE_LABELS[lang] ?? lang}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No data for this language yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="py-3 pr-4">Rank</th>
                <th className="py-3 pr-4">Model</th>
                <th className="py-3 pr-4 text-right">Win Rate (%)</th>
                <th className="py-3 pr-4 text-right">Cultural Acc.</th>
                <th className="py-3 pr-4 text-right">Ling. Auth.</th>
                <th className="py-3 pr-4 text-right">Creative Depth</th>
                <th className="py-3 pr-4 text-right">Factual Corr.</th>
                <th className="py-3 text-right">Overall</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.model}
                  className={`border-b border-gray-50 ${
                    entry.overallScore === bestScore
                      ? "bg-indigo-50 font-medium"
                      : ""
                  }`}
                >
                  <td className="py-3 pr-4 text-gray-600">{i + 1}</td>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {entry.model}
                    {entry.overallScore === bestScore && (
                      <span className="ml-2 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                        Best
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {entry.winRate}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {entry.culturalAccuracy}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {entry.linguisticAuthenticity}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {entry.creativeDepth}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {entry.factualCorrectness}
                  </td>
                  <td className="py-3 text-right font-semibold tabular-nums">
                    {entry.overallScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
