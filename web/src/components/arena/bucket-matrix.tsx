"use client";

import { useEffect, useState } from "react";
import { ScoreExplainer } from "./score-explainer";
import type { ArenaSignal } from "./signal-copy";

interface Cell {
  bucket: string;
  strength: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  rank: number | null;
  games: number;
  distinguishable: boolean;
  rubricMean: number | null;
}

interface Row {
  candidate: {
    id: string;
    name: string;
    slug: string;
    family: string;
    kind: string;
    versionLabel: string | null;
    color: string | null;
    isChampion: boolean;
    ragEnabled: boolean;
  };
  overall: {
    strength: number | null;
    rank: number | null;
    games: number;
    distinguishable: boolean;
    rubricMean: number | null;
  };
  cells: Cell[];
}

interface BucketCol {
  key: string;
  num: number;
  short: string;
  label: string;
}

interface LeaderboardData {
  buckets: BucketCol[];
  rows: Row[];
  totals: {
    candidates: number;
    pairwise: number;
    rubric: number;
    overallDistinguishable: boolean;
    signal?: ArenaSignal;
  };
}

// Interpolate the score ramp (lo -> mid -> hi) for a 0-100 strength.
function tint(strength: number | null): string {
  if (strength === null) return "transparent";
  const t = Math.max(0, Math.min(1, strength / 100));
  // lo #b23b32, mid #b5790f, hi #2f7d54
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [178, 59, 50]],
    [0.5, [181, 121, 15]],
    [1.0, [47, 125, 84]],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const f = (t - lo[0]) / span;
  const c = [0, 1, 2].map((k) =>
    Math.round(lo[1][k] + (hi[1][k] - lo[1][k]) * f),
  );
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.16)`;
}

function rankGlyph(rank: number | null): string {
  if (rank === 1) return "▲";
  if (rank === 2) return "△";
  return "";
}

export function BucketMatrix() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/arena/leaderboard")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const explainer = (
    <ScoreExplainer
      signal={data?.totals.signal ?? null}
      distinguishable={data?.totals.overallDistinguishable ?? false}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {explainer}
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-surface-sunken"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {explainer}
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="space-y-6">
        {explainer}
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">
            No arena data yet. Register candidate models and run an evaluation
            to populate the leaderboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {explainer}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
          <span>{data.totals.candidates} candidates</span>
          <span>{data.totals.pairwise} blind comparisons</span>
          <span>{data.totals.rubric} rubric scores</span>
          <span className="font-mono">
            human pairwise · Bradley-Terry per category
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-medium text-text-secondary">
                  Candidate
                </th>
                {data.buckets.map((b) => (
                  <th
                    key={b.key}
                    title={b.label}
                    className="px-2 py-3 text-center text-xs font-medium text-text-secondary"
                  >
                    <span className="mr-1 text-text-muted">{b.num}</span>
                    {b.short}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-text-primary">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.candidate.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 py-3">
                    <div className="flex items-center gap-2">
                      {row.candidate.isChampion && (
                        <span
                          title="Designated champion. This is a hand-set reference model, not a result the arena computed. The votes do not currently support ranking any candidate first."
                          className="text-accent-text"
                        >
                          ★
                        </span>
                      )}
                      <div>
                        <div className="font-medium text-text-primary">
                          {row.candidate.name}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {row.candidate.family}
                          {row.candidate.versionLabel
                            ? ` · ${row.candidate.versionLabel}`
                            : ""}
                          {row.candidate.ragEnabled ? " · RAG" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.bucket}
                      className="px-2 py-3 text-center"
                      style={{ background: tint(cell.strength) }}
                      title={
                        cell.strength !== null
                          ? `Arena strength ${cell.strength.toFixed(0)} of 100 (plausible range ${cell.ciLow?.toFixed(0)} to ${cell.ciHigh?.toFixed(0)}) from ${cell.games} blind comparisons${cell.distinguishable ? "" : ". Not distinguishable from the other candidates at this sample size."}`
                          : "No votes in this category yet"
                      }
                    >
                      {cell.strength === null ? (
                        <span className="text-text-muted">-</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <span className="text-text-muted">
                            {rankGlyph(cell.rank)}
                          </span>
                          <span
                            className={
                              cell.distinguishable
                                ? "font-medium text-text-primary"
                                : "text-text-tertiary"
                            }
                          >
                            {cell.strength.toFixed(0)}
                          </span>
                          {!cell.distinguishable && (
                            <span
                              title="Not statistically distinguishable at this sample size. Expected while decided winners are rare."
                              className="font-mono text-[10px] text-text-muted"
                            >
                              ns
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    {row.overall.strength === null ? (
                      <span className="text-text-muted">-</span>
                    ) : (
                      <span className="font-mono font-medium tabular-nums text-text-primary">
                        {row.overall.strength.toFixed(0)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-text-tertiary">
          Reminder, per the reading guide above:{" "}
          <span className="font-mono">50</span> means no evidence either way,{" "}
          <span className="font-mono">ns</span> means not statistically
          distinguishable at this sample size, and{" "}
          <span className="font-mono">-</span> means no votes in that category
          yet.
        </p>
      </div>
    </div>
  );
}
