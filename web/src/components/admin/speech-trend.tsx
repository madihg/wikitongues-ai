import { InfoTip } from "@/components/info-tip";
import type { TrendPoint } from "@/lib/speech/dashboard-data";

/**
 * CER and TER of every scored model, oldest to newest, with the hours of
 * training audio behind each as a second series on a right axis. Hand-rolled
 * SVG, like the arena's epoch trajectory: no chart dependency. Line style
 * differs per series so colour is never the only cue.
 */

const W = 720;
const H = 300;
const PAD = { top: 20, right: 52, bottom: 32, left: 48 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

const SERIES = [
  { key: "cer", label: "CER", color: "#0072b2", dash: "" },
  { key: "ter", label: "TER", color: "#d55e00", dash: "6 3" },
] as const;

export function SpeechTrend({ points }: { points: TrendPoint[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        Error trend
        <InfoTip>
          One point per scored model on the frozen exam set. CER is character
          error, TER is tone error; lower is better. The grey line is the hours
          of training audio the model saw (right axis).
        </InfoTip>
      </h2>
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-text-tertiary">
          No scored models yet. The first point appears after the first
          evaluation.
        </p>
      ) : (
        <Chart points={points} />
      )}
    </section>
  );
}

function Chart({ points }: { points: TrendPoint[] }) {
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? PW / 2 : (i / (points.length - 1)) * PW);
  const maxErr = Math.max(0.05, ...points.flatMap((p) => [p.cer, p.ter]));
  const yErr = (v: number) => PAD.top + PH - (v / maxErr) * PH;
  const hours = points.map((p) => p.trainingHours);
  const maxH = Math.max(1, ...hours.filter((h): h is number => h !== null));
  const yH = (v: number) => PAD.top + PH - (v / maxH) * PH;

  const path = (get: (p: TrendPoint) => number | null, y: (v: number) => number) => {
    let d = "";
    let pen = false; // a missing value lifts the pen, so the line has a gap
    points.forEach((p, i) => {
      const v = get(p);
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="CER and TER by scored model, with training hours"
      className="mt-3 h-auto w-full"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PH - t * PH}
            y2={PAD.top + PH - t * PH}
            stroke="currentColor"
            className="text-border"
          />
          <text
            x={PAD.left - 6}
            y={PAD.top + PH - t * PH + 4}
            textAnchor="end"
            fontSize="11"
            className="fill-text-tertiary"
          >
            {(t * maxErr * 100).toFixed(0)}%
          </text>
          <text
            x={W - PAD.right + 6}
            y={PAD.top + PH - t * PH + 4}
            fontSize="11"
            className="fill-text-tertiary"
          >
            {(t * maxH).toFixed(1)}h
          </text>
        </g>
      ))}
      <path
        d={path((p) => p.trainingHours, yH)}
        fill="none"
        stroke="#8a8178"
        strokeWidth="1.5"
        strokeDasharray="2 3"
      />
      {SERIES.map((s) => (
        <g key={s.key}>
          <path
            d={path((p) => p[s.key], yErr)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={s.dash}
          />
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={yErr(p[s.key])} r="3" fill={s.color} />
          ))}
        </g>
      ))}
      {points.map((p, i) => (
        <text
          key={p.at}
          x={x(i)}
          y={H - 10}
          textAnchor="middle"
          fontSize="11"
          className="fill-text-tertiary"
        >
          {p.at.slice(5, 10)}
        </text>
      ))}
      <g fontSize="12">
        {[...SERIES, { key: "hours", label: "Training hours", color: "#8a8178", dash: "2 3" }].map(
          (s, i) => (
            <g key={s.key} transform={`translate(${PAD.left + i * 110}, 10)`}>
              <line x1="0" x2="22" y1="0" y2="0" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
              <text x="28" y="4" className="fill-text-secondary">
                {s.label}
              </text>
            </g>
          ),
        )}
      </g>
    </svg>
  );
}
