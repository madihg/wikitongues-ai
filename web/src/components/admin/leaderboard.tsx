"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";

interface LeaderboardEntry {
  model: string;
  winRate: number;
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  culturalNormAdherence: number;
  factualCorrectness: number;
  overallScore: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
  igala: "Igala",
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
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">Loading leaderboard...</div>
      </div>
    );
  }

  if (languages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">
          Model Leaderboard
        </h2>
        <p className="mt-4 text-sm text-text-tertiary">
          No benchmark data available. Run annotations to see results.
        </p>
      </div>
    );
  }

  const entries = data[activeTab] ?? [];
  const bestScore =
    entries.length > 0 ? Math.max(...entries.map((e) => e.overallScore)) : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        Model Leaderboard
        <InfoTip width="w-80">
          Models ranked by aggregate human scores per language. Win rate is how
          often a model&apos;s output was picked over another&apos;s in blind
          pairwise comparisons; the rubric columns are mean 1-5 scores on each
          axis. This is the legacy per-model view; the Model Arena gives the
          per-bucket, statistically-honest ranking.
        </InfoTip>
      </h2>

      <div className="mt-4 flex gap-1 border-b border-border">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={`cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === lang
                ? "border-b-2 border-accent text-accent-text"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {LANGUAGE_LABELS[lang] ?? lang}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-text-tertiary">
          No data for this language yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <th className="py-3 pr-4">Rank</th>
                <th className="py-3 pr-4">Model</th>
                <th className="py-3 pr-4 text-right">Win Rate (%)</th>
                <th className="py-3 pr-4 text-right">Cultural Acc.</th>
                <th className="py-3 pr-4 text-right">Ling. Auth.</th>
                <th className="py-3 pr-4 text-right">
                  Cultural-norm adherence
                </th>
                <th className="py-3 pr-4 text-right">Factual Corr.</th>
                <th className="py-3 text-right">Overall</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.model}
                  className={`border-b border-border ${
                    entry.overallScore === bestScore
                      ? "bg-accent-subtle font-medium"
                      : ""
                  }`}
                >
                  <td className="py-3 pr-4 text-text-secondary">{i + 1}</td>
                  <td className="py-3 pr-4 font-medium text-text-primary">
                    {entry.model}
                    {entry.overallScore === bestScore && (
                      <span className="ml-2 inline-block rounded-md bg-accent-subtle px-1.5 py-0.5 text-xs text-accent-text">
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
                    {entry.culturalNormAdherence}
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
