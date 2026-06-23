"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvalBucket } from "@prisma/client";

interface BucketMeta {
  key: EvalBucket;
  num: number;
  short: string;
  label: string;
}

interface BucketPoint {
  strength: number;
  championId: string;
  championName: string;
  distinguishable: boolean;
  games: number;
}

interface EpochResult {
  epochNumber: number;
  notes: string | null;
  completedAt: string | null;
  buckets: Record<string, BucketPoint | null>;
}

interface TrajectoryResponse {
  epochs: EpochResult[];
  buckets: BucketMeta[];
}

// Colorblind-safe 8-hue cycle (Okabe-Ito derived) paired with distinct dash
// patterns so lines stay distinguishable without relying on color alone.
const SERIES = [
  { color: "#0072b2", dash: "" },
  { color: "#e69f00", dash: "6 3" },
  { color: "#009e73", dash: "2 3" },
  { color: "#cc79a7", dash: "8 3 2 3" },
  { color: "#d55e00", dash: "1 3" },
  { color: "#56b4e9", dash: "10 4" },
  { color: "#7d5fb2", dash: "4 2 1 2" },
  { color: "#525252", dash: "3 3" },
];

const W = 720;
const H = 360;
const PAD = { top: 20, right: 20, bottom: 36, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export function EpochTrajectory() {
  const [data, setData] = useState<TrajectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/arena/trajectory");
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        const json = await r.json();
        if (active) setData(json);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const epochNumbers = useMemo(
    () => (data ? data.epochs.map((e) => e.epochNumber) : []),
    [data],
  );

  const xFor = useMemo(() => {
    const min = epochNumbers.length ? Math.min(...epochNumbers) : 0;
    const max = epochNumbers.length ? Math.max(...epochNumbers) : 1;
    const span = max - min || 1;
    return (epochNumber: number) =>
      PAD.left + ((epochNumber - min) / span) * PLOT_W;
  }, [epochNumbers]);

  // y: 0-100 strength, top of plot = 100.
  const yFor = (strength: number) =>
    PAD.top + (1 - Math.max(0, Math.min(100, strength)) / 100) * PLOT_H;

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading trajectory…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!data || data.epochs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-tertiary shadow-sm">
        No epochs recorded yet. Once epochs roll over and accumulate pairwise
        judgments, this chart traces each bucket champion&apos;s Bradley-Terry
        strength over time.
      </div>
    );
  }

  const seriesByBucket = data.buckets.map((bucket, i) => {
    const style = SERIES[i % SERIES.length];
    const points = data.epochs
      .map((ep) => {
        const point = ep.buckets[bucket.key];
        if (!point) return null;
        return {
          epochNumber: ep.epochNumber,
          strength: point.strength,
          championName: point.championName,
          distinguishable: point.distinguishable,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return { bucket, style, points };
  });

  const hasAnyData = seriesByBucket.some((s) => s.points.length > 0);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // y gridlines at 0, 25, 50, 75, 100.
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4 shadow-sm">
        {!hasAnyData ? (
          <p className="py-8 text-center text-sm text-text-tertiary">
            Epochs exist but no per-bucket pairwise judgments have been recorded
            yet.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Per-bucket champion strength over epochs"
          >
            {/* y gridlines + labels */}
            {yTicks.map((t) => {
              const y = yFor(t);
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={W - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--text-tertiary)"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            {/* x axis epoch labels */}
            {data.epochs.map((ep) => {
              const x = xFor(ep.epochNumber);
              return (
                <text
                  key={ep.epochNumber}
                  x={x}
                  y={H - PAD.bottom + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-tertiary)"
                >
                  E{ep.epochNumber}
                </text>
              );
            })}
            <text
              x={PAD.left + PLOT_W / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-muted)"
            >
              epoch
            </text>

            {/* lines */}
            {seriesByBucket.map(({ bucket, style, points }) => {
              if (hidden.has(bucket.key) || points.length === 0) return null;
              const d = points
                .map(
                  (p, idx) =>
                    `${idx === 0 ? "M" : "L"} ${xFor(p.epochNumber).toFixed(
                      1,
                    )} ${yFor(p.strength).toFixed(1)}`,
                )
                .join(" ");
              const last = points[points.length - 1];
              return (
                <g key={bucket.key}>
                  {points.length > 1 && (
                    <path
                      d={d}
                      fill="none"
                      stroke={style.color}
                      strokeWidth={2}
                      strokeDasharray={style.dash || undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {points.map((p) => (
                    <circle
                      key={p.epochNumber}
                      cx={xFor(p.epochNumber)}
                      cy={yFor(p.strength)}
                      r={3}
                      fill={style.color}
                    >
                      <title>
                        {bucket.label} · E{p.epochNumber} · {p.strength} ·{" "}
                        {p.championName}
                        {p.distinguishable ? "" : " (not distinguishable)"}
                      </title>
                    </circle>
                  ))}
                  {/* direct line label at the end (redundant with legend) */}
                  <text
                    x={xFor(last.epochNumber) + 5}
                    y={yFor(last.strength) + 3}
                    fontSize={9}
                    fill={style.color}
                  >
                    {bucket.short}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* legend (clickable to toggle) */}
      <div className="flex flex-wrap gap-2">
        {seriesByBucket.map(({ bucket, style, points }) => {
          const off = hidden.has(bucket.key);
          const empty = points.length === 0;
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => !empty && toggle(bucket.key)}
              disabled={empty}
              className={`flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 ${
                off ? "opacity-40" : ""
              }`}
              title={empty ? `${bucket.label} (no data)` : bucket.label}
            >
              <svg width={20} height={8} aria-hidden="true">
                <line
                  x1={0}
                  y1={4}
                  x2={20}
                  y2={4}
                  stroke={style.color}
                  strokeWidth={2}
                  strokeDasharray={style.dash || undefined}
                />
              </svg>
              <span className="text-text-secondary">{bucket.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
