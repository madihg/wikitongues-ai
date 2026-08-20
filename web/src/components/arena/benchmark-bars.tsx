import type { CandidateScore } from "@/lib/method-metrics";

/**
 * LLM-benchmark-style horizontal bar chart for the Community Agreement Score:
 * model name on the left, bar + score on the right, the best model
 * highlighted in the house amber, a dashed reference line at 100 labeled
 * "native speaker agreement", and 95% CI whiskers where n allows them.
 *
 * Server-rendered SVG, no chart library. Every number rendered here arrives
 * through computeMethodMetrics - this file draws, it never computes a score,
 * and it never clamps: a model that beats one speaker's agreement with
 * another draws PAST the 100 line, because hiding that would be a lie in the
 * flattering direction.
 *
 * Top `topN` models render by default; the full field lives inside a
 * <details> so the page stays scannable without hiding anything.
 */

const LABEL_W = 220;
const CHART_W = 460;
const RIGHT_PAD = 64;
const ROW_H = 44;
const TOP_PAD = 34;
const BOTTOM_PAD = 24;
const BAR_H = 16;

function truncate(name: string, max = 28): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function BarChart({
  rows,
  scaleMax,
  bestName,
}: {
  rows: CandidateScore[];
  scaleMax: number;
  bestName: string | null;
}) {
  const width = LABEL_W + CHART_W + RIGHT_PAD;
  const height = TOP_PAD + rows.length * ROW_H + BOTTOM_PAD;
  const x = (v: number) => LABEL_W + (v / scaleMax) * CHART_W;
  const gridTicks = [0, 25, 50, 75].filter((t) => t < scaleMax);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      style={{ minWidth: width }}
      role="img"
      aria-label={`Community Agreement Score by model: ${rows
        .map((r) => `${r.name} ${r.agreementScore?.toFixed(1)}`)
        .join(", ")}. 100 marks native speaker agreement.`}
    >
      {/* grid */}
      {gridTicks.map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            y1={TOP_PAD - 6}
            x2={x(t)}
            y2={height - BOTTOM_PAD}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={x(t)}
            y={height - 8}
            fontSize="10"
            textAnchor="middle"
            fill="var(--text-muted)"
          >
            {t}
          </text>
        </g>
      ))}

      {/* the 100 reference line: native speaker agreement */}
      {scaleMax >= 100 && (
        <g>
          <line
            x1={x(100)}
            y1={TOP_PAD - 6}
            x2={x(100)}
            y2={height - BOTTOM_PAD}
            stroke="var(--accent-text)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={x(100)}
            y={TOP_PAD - 14}
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            fill="var(--accent-text)"
          >
            native speaker agreement
          </text>
          <text
            x={x(100)}
            y={height - 8}
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            fill="var(--accent-text)"
          >
            100
          </text>
        </g>
      )}

      {rows.map((c, i) => {
        const y = TOP_PAD + i * ROW_H;
        const midY = y + ROW_H / 2;
        const barY = midY - BAR_H / 2;
        const score = c.agreementScore ?? 0;
        const isBest = c.name === bestName;
        const hasWhisker =
          !c.agreementUnderpowered &&
          c.agreementCiLow !== null &&
          c.agreementCiHigh !== null;
        const scoreX =
          x(hasWhisker ? Math.max(score, c.agreementCiHigh as number) : score) +
          8;
        const chip = c.approach;
        const chipW = chip.length * 5.4 + 14;
        return (
          <g key={c.name}>
            {/* label column: name + approach chip */}
            <text
              x={0}
              y={midY - 3}
              fontSize="12"
              fontWeight={isBest ? 700 : 400}
              fill="var(--text-primary)"
            >
              {truncate(c.name)}
            </text>
            <rect
              x={0}
              y={midY + 2}
              width={chipW}
              height={14}
              rx={7}
              fill={isBest ? "var(--accent-subtle)" : "var(--surface-sunken)"}
              stroke={isBest ? "var(--accent)" : "var(--border)"}
            />
            <text
              x={chipW / 2}
              y={midY + 12}
              fontSize="9"
              textAnchor="middle"
              fill={isBest ? "var(--accent-text)" : "var(--text-tertiary)"}
            >
              {chip}
            </text>
            <text
              x={chipW + 8}
              y={midY + 12}
              fontSize="9"
              fill="var(--text-muted)"
            >
              n={c.nClean}
            </text>

            {/* bar */}
            <rect
              x={x(0)}
              y={barY}
              width={Math.max(x(score) - x(0), 1.5)}
              height={BAR_H}
              rx={3}
              fill={isBest ? "var(--accent)" : "var(--border-strong)"}
            />

            {/* 95% CI whisker */}
            {hasWhisker && (
              <g stroke="var(--text-primary)" strokeWidth="1.25">
                <line
                  x1={x(c.agreementCiLow as number)}
                  y1={midY}
                  x2={x(c.agreementCiHigh as number)}
                  y2={midY}
                />
                <line
                  x1={x(c.agreementCiLow as number)}
                  y1={midY - 4}
                  x2={x(c.agreementCiLow as number)}
                  y2={midY + 4}
                />
                <line
                  x1={x(c.agreementCiHigh as number)}
                  y1={midY - 4}
                  x2={x(c.agreementCiHigh as number)}
                  y2={midY + 4}
                />
              </g>
            )}

            {/* score */}
            <text
              x={scoreX}
              y={midY + 4}
              fontSize="11"
              fontFamily="var(--font-mono, monospace)"
              fontWeight={isBest ? 700 : 400}
              fill="var(--text-primary)"
            >
              {score.toFixed(1)}
              {c.agreementUnderpowered ? "*" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BenchmarkBars({
  candidates,
  ceilingChrf,
  leakFreePrompts,
  topN = 8,
}: {
  candidates: CandidateScore[];
  /** MethodMetrics.agreementCeilingChrf - the raw chrF anchored to 100. */
  ceilingChrf: number | null;
  leakFreePrompts: number;
  topN?: number;
}) {
  // Already sorted best-first by the metrics module; agreement score is a
  // monotone rescaling of the same column, so the order is identical.
  const scoreable = candidates.filter((c) => c.agreementScore !== null);

  if (ceilingChrf === null || scoreable.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
        The Community Agreement Score cannot be drawn yet: it needs at least one
        leak-free test question answered by two different native speakers to
        anchor its 100 line. Until then, no scale - not a made-up one.
      </div>
    );
  }

  const maxVal = Math.max(
    100,
    ...scoreable.map((c) =>
      Math.max(c.agreementScore ?? 0, c.agreementCiHigh ?? 0),
    ),
  );
  // One shared scale for the top-N and show-all charts, padded so the top
  // score's label never collides with the edge.
  const scaleMax = Math.ceil((maxVal + 8) / 10) * 10;
  const bestName = scoreable[0].name;
  const top = scoreable.slice(0, topN);
  const rest = scoreable.slice(topN);
  const anyUnderpowered = scoreable.some((c) => c.agreementUnderpowered);

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="overflow-x-auto">
        <BarChart rows={top} scaleMax={scaleMax} bestName={bestName} />
      </div>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-accent-text">
            Show all {scoreable.length} models
          </summary>
          <div className="mt-2 overflow-x-auto">
            <BarChart rows={rest} scaleMax={scaleMax} bestName={bestName} />
          </div>
        </details>
      )}
      <p className="mt-3 text-xs leading-relaxed text-text-muted">
        100 = one native speaker&apos;s agreement with another (chrF{" "}
        {ceilingChrf.toFixed(1)} on the same questions, one answer per speaker).
        Scored on the {leakFreePrompts} leak-free frozen questions; whiskers are
        95% bootstrap intervals over per-question scores.
        {anyUnderpowered &&
          " * too few leak-free answers for an interval - point estimate only."}{" "}
        A bar past the 100 line means the model matched the community&apos;s
        writing more closely than one speaker matches another - shown as
        measured, never capped.
      </p>
    </div>
  );
}
