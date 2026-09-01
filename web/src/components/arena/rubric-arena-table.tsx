"use client";

import { useEffect, useState } from "react";
import { ScoreExplainer } from "./score-explainer";
import { share, type ArenaSignal } from "./signal-copy";
import {
  ARENA_ERA_LABELS,
  DEFAULT_ARENA_ERA,
  type ArenaEra,
  type EraCell,
  type EraRow,
  type EraShortfall,
  type EraSlice,
  type EraSplit,
} from "@/lib/arena/era";

/**
 * The rubric arena table: candidates x prompt categories, Bradley-Terry
 * strengths from blind human votes.
 *
 * Two things make it honest rather than decorative, both computed in
 * src/lib/arena/era.ts and only drawn here:
 *
 *  - The ERA control, defaulting to the window that starts at the annotation
 *    pivot. The pivot is derived from the data (the first comparison involving
 *    a candidate in today's pairing pool), never a date typed into the UI. All
 *    time stays one click away, with the split spelled out either way.
 *  - The SPARSITY GATE. A candidate needs `minDecided` decided votes in the
 *    window before it gets a row; everything under the line is listed with its
 *    own count. When nothing clears the gate the component says so in a
 *    sentence instead of drawing a grid of neutral 50s and dashes, because a
 *    grid of 50s reads like a wall of ties when it is an absence of evidence.
 *
 * This file draws; it never computes a strength, a rate, or a threshold. Every
 * number and the gate itself arrive in the payload, so the copy and the
 * computation cannot drift. The honesty markers are unchanged: `ns` for not
 * distinguishable, ▲ △ for provisional best and second, `-` for no votes, and
 * neutral 50 explained wherever a 50 can appear. No model judges the Igala.
 */

interface CandidateMeta {
  id: string;
  name: string;
  slug: string;
  family: string;
  kind: string;
  versionLabel: string | null;
  color: string | null;
  isChampion: boolean;
  ragEnabled: boolean;
  inPairingPool: boolean;
}

type ViewRow = EraRow & { candidate: CandidateMeta | null };
type ViewShortfall = EraShortfall & { candidate: CandidateMeta | null };
export type EraView = Omit<EraSlice, "rows" | "belowGate"> & {
  rows: ViewRow[];
  belowGate: ViewShortfall[];
};

interface BucketCol {
  key: string;
  num: number;
  short: string;
  label: string;
}

export interface RubricArenaData {
  buckets: BucketCol[];
  pivotAt: string | null;
  eras: Record<ArenaEra, EraView>;
  split: EraSplit;
  totals: {
    candidates: number;
    pairwise: number;
    rubric: number;
    overallDistinguishable: boolean;
    signal?: ArenaSignal;
  };
}

const ERA_ORDER: ArenaEra[] = ["since_pivot", "all_time"];

/** How many below-gate candidates to list before the rest go behind a
 * disclosure. Nothing is dropped either way. */
const SHORTFALL_PREVIEW = 6;

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

function candidateName(
  candidate: CandidateMeta | null,
  candidateId: string,
): string {
  return candidate?.name ?? candidateId;
}

/** yyyy-mm-dd from an ISO timestamp, the same date form the verdict cards use. */
function isoDate(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function cellTitle(cell: EraCell, bucketLabel: string): string {
  if (cell.strength === null) return `${bucketLabel}: no votes in this window`;
  const range =
    cell.ciLow !== null && cell.ciHigh !== null
      ? ` (plausible range ${cell.ciLow.toFixed(0)} to ${cell.ciHigh.toFixed(0)})`
      : "";
  return `${bucketLabel}: arena strength ${cell.strength.toFixed(0)} of 100${range} from ${cell.games} blind comparisons, ${cell.decided} of them decided${
    cell.distinguishable
      ? ""
      : ". Not distinguishable from the other candidates at this sample size."
  }`;
}

// ─── the window control and its sentence ────────────────────────────────────

function EraControl({
  data,
  era,
  onChange,
}: {
  data: RubricArenaData;
  era: ArenaEra;
  onChange: (next: ArenaEra) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-border bg-surface-sunken p-0.5"
      role="group"
      aria-label="Comparison window"
    >
      {ERA_ORDER.map((key) => {
        const active = key === era;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {ARENA_ERA_LABELS[key]}
            <span className="ml-1.5 tabular-nums text-text-muted">
              {data.eras[key].comparisons.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Why the post-pivot window is the default, in the numbers themselves. */
function WindowNote({ data }: { data: RubricArenaData }) {
  const pivot = isoDate(data.pivotAt);
  const s = data.split;
  const cells = data.totals.candidates * data.buckets.length;

  if (pivot === null) {
    return (
      <p className="max-w-3xl text-xs leading-relaxed text-text-tertiary">
        No candidate is in the pairing pool yet, so there is no annotation pivot
        to date a window from and the post-pivot window is empty. All time holds{" "}
        {s.allComparisons.toLocaleString()} blind comparisons,{" "}
        {s.allDecided.toLocaleString()} of them decided (
        {share(s.allDecided, s.allComparisons)}).
      </p>
    );
  }

  return (
    <p className="max-w-3xl text-xs leading-relaxed text-text-tertiary">
      Since the annotation pivot on {pivot}, {s.sinceDecided.toLocaleString()}{" "}
      of {s.sinceComparisons.toLocaleString()} blind comparisons produced a
      decided winner ({share(s.sinceDecided, s.sinceComparisons)}). Before it,{" "}
      {s.beforeDecided.toLocaleString()} of{" "}
      {s.beforeComparisons.toLocaleString()} (
      {share(s.beforeDecided, s.beforeComparisons)}) - the era when the arms
      were weak enough that speakers rejected both answers almost every time.
      That era is {share(s.beforeComparisons, s.allComparisons)} of the input
      and {share(s.beforeDecided, s.allDecided)} of the decided votes, so
      pooling the two spreads {s.allDecided.toLocaleString()} decided winners
      across {cells.toLocaleString()} candidate-by-category cells and the table
      fills with neutral 50s. The window defaults to the post-pivot era for that
      reason, and the pivot date is derived from the first comparison involving
      a system in today&apos;s pairing pool, not typed in here.
    </p>
  );
}

// ─── the two states: a table, or an honest paragraph ────────────────────────

function BelowGate({ slice }: { slice: EraView }) {
  if (slice.belowGate.length === 0) return null;
  const preview = slice.belowGate.slice(0, SHORTFALL_PREVIEW);
  const rest = slice.belowGate.slice(SHORTFALL_PREVIEW);

  const item = (s: ViewShortfall) => (
    <li
      key={s.candidateId}
      className="flex items-baseline justify-between gap-3 py-1"
    >
      <span className="text-text-secondary">
        {candidateName(s.candidate, s.candidateId)}
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
        {s.decided} decided / {s.games} compared
      </span>
    </li>
  );

  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-4">
      <h3 className="text-sm font-medium text-text-primary">
        Not enough decided votes yet
      </h3>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-tertiary">
        These {slice.belowGate.length} candidates have fewer than{" "}
        {slice.minDecided} decided votes in this window, so they get a count
        rather than a row: a strength fitted from that little evidence would be
        a neutral 50 dressed up as a result. Their votes still count in the fit
        above - the gate decides who gets a row, never whose votes count.
      </p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {preview.map(item)}
      </ul>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-accent-text">
            Show the remaining {rest.length}
          </summary>
          <ul className="mt-1 divide-y divide-border text-sm">
            {rest.map(item)}
          </ul>
        </details>
      )}
    </div>
  );
}

function EmptyWindow({
  data,
  slice,
  onChange,
}: {
  data: RubricArenaData;
  slice: EraView;
  onChange: (next: ArenaEra) => void;
}) {
  const other: ArenaEra =
    slice.era === "since_pivot" ? "all_time" : "since_pivot";
  const otherSlice = data.eras[other];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          No candidate has reached {slice.minDecided} decided votes in this
          window, so there is no table to draw. This window holds{" "}
          {slice.comparisons.toLocaleString()} blind comparisons, of which{" "}
          {slice.decided.toLocaleString()} produced a decided winner (
          {share(slice.decided, slice.comparisons)});{" "}
          {slice.bothInadequate.toLocaleString()} were rejected as inadequate on
          both sides and {slice.ties.toLocaleString()} came back an explicit
          tie. Drawing the grid anyway would fill it with neutral 50s and
          dashes, and a grid of 50s reads like a wall of ties when it is really
          an absence of evidence.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary">
          What would change it: decided winners accumulating on the frozen
          benchmark prompts, whose community gold never enters any training set.
          One candidate reaching {slice.minDecided} decided votes here is enough
          for the first row to appear.{" "}
          {otherSlice.rows.length > 0 && (
            <>
              The{" "}
              <button
                type="button"
                onClick={() => onChange(other)}
                className="font-medium text-accent-text underline underline-offset-2"
              >
                {ARENA_ERA_LABELS[other].toLowerCase()}
              </button>{" "}
              window does have {otherSlice.rows.length} candidate
              {otherSlice.rows.length === 1 ? "" : "s"} above the line, on{" "}
              {otherSlice.decided.toLocaleString()} decided votes out of{" "}
              {otherSlice.comparisons.toLocaleString()} comparisons.
            </>
          )}
        </p>
      </div>
      <BelowGate slice={slice} />
    </div>
  );
}

function Matrix({ data, slice }: { data: RubricArenaData; slice: EraView }) {
  const shown = data.buckets.filter((b) =>
    slice.bucketsWithVotes.includes(b.key),
  );
  const hidden = data.buckets.filter((b) =>
    slice.bucketsWithoutVotes.includes(b.key),
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-medium text-text-secondary">
                Candidate
              </th>
              <th className="px-2 py-3 text-center text-xs font-medium text-text-secondary">
                Decided votes
              </th>
              {shown.map((b) => (
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
            {slice.rows.map((row) => {
              const byBucket = new Map(row.cells.map((c) => [c.bucket, c]));
              return (
                <tr
                  key={row.candidateId}
                  className="border-b border-border last:border-0"
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 py-3">
                    <div className="flex items-center gap-2">
                      {row.candidate?.isChampion && (
                        <span
                          title="Designated champion. This is a hand-set reference model, not a result the arena computed."
                          className="text-accent-text"
                        >
                          ★
                        </span>
                      )}
                      <div>
                        <div className="font-medium text-text-primary">
                          {candidateName(row.candidate, row.candidateId)}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {row.candidate?.family}
                          {row.candidate?.versionLabel
                            ? ` · ${row.candidate.versionLabel}`
                            : ""}
                          {row.candidate?.ragEnabled ? " · RAG" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-2 py-3 text-center font-mono text-xs tabular-nums text-text-tertiary"
                    title={`${row.decided} of ${row.games} comparisons in this window produced a decided winner`}
                  >
                    {row.decided}
                  </td>
                  {shown.map((b) => {
                    const cell = byBucket.get(b.key);
                    if (!cell) return <td key={b.key} className="px-2 py-3" />;
                    return (
                      <td
                        key={b.key}
                        className="px-2 py-3 text-center"
                        style={{ background: tint(cell.strength) }}
                        title={cellTitle(cell, b.label)}
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
                                title="Not statistically distinguishable at this sample size. It is an absence of evidence, not a tie."
                                className="font-mono text-[10px] text-text-muted"
                              >
                                ns
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    {row.overall.strength === null ? (
                      <span className="text-text-muted">-</span>
                    ) : (
                      <span
                        className="font-mono font-medium tabular-nums text-text-primary"
                        title={`Pooled across every category in this window, from ${row.decided} decided votes${
                          row.overall.distinguishable
                            ? ""
                            : ". Not distinguishable from the other candidates at this sample size."
                        }`}
                      >
                        {row.overall.strength.toFixed(0)}
                        {!row.overall.distinguishable && (
                          <span className="ml-1 text-[10px] text-text-muted">
                            ns
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-text-tertiary">
        <span className="font-mono">50</span> means no evidence either way, not
        a score of 50 percent. <span className="font-mono">ns</span> means not
        statistically distinguishable at this sample size.{" "}
        <span className="font-mono">▲ △</span> mark the best and second best in
        that category on the votes cast so far, provisional while{" "}
        <span className="font-mono">ns</span> is showing.{" "}
        <span className="font-mono">-</span> means no votes in that category in
        this window. Rows are the candidates with at least {slice.minDecided}{" "}
        decided votes here.
        {hidden.length > 0 && (
          <>
            {" "}
            {hidden.length} categor{hidden.length === 1 ? "y is" : "ies are"}{" "}
            not drawn because no comparison in this window used{" "}
            {hidden.length === 1 ? "it" : "them"}:{" "}
            {hidden.map((b) => b.short).join(", ")}.
          </>
        )}
      </p>

      <BelowGate slice={slice} />
    </div>
  );
}

// ─── the view ───────────────────────────────────────────────────────────────

/**
 * The table itself, given data. Exported separately from the fetching wrapper
 * so it renders in a test with no network.
 */
export function RubricArenaView({
  data,
  initialEra = DEFAULT_ARENA_ERA,
  showExplainer = false,
}: {
  data: RubricArenaData;
  initialEra?: ArenaEra;
  showExplainer?: boolean;
}) {
  const [era, setEra] = useState<ArenaEra>(initialEra);
  const slice = data.eras[era];

  return (
    <div className="space-y-6">
      {showExplainer && (
        <ScoreExplainer
          signal={data.totals.signal ?? null}
          distinguishable={data.totals.overallDistinguishable}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
            <span>
              {slice.comparisons.toLocaleString()} blind comparisons in this
              window
            </span>
            <span>
              {slice.decided.toLocaleString()} decided (
              {share(slice.decided, slice.comparisons)})
            </span>
            <span>{data.totals.candidates} candidates registered</span>
            <span className="font-mono">
              human pairwise · Bradley-Terry per category
            </span>
          </div>
          <EraControl data={data} era={era} onChange={setEra} />
        </div>

        <WindowNote data={data} />

        {slice.rows.length === 0 ? (
          <EmptyWindow data={data} slice={slice} onChange={setEra} />
        ) : (
          <Matrix data={data} slice={slice} />
        )}
      </div>
    </div>
  );
}

// ─── the fetching wrapper the page places ───────────────────────────────────

export function RubricArenaTable({
  showExplainer = false,
}: { showExplainer?: boolean } = {}) {
  const [data, setData] = useState<RubricArenaData | null>(null);
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

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-surface-sunken"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!data || data.totals.candidates === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">
          No arena data yet. Register candidate models and run an evaluation to
          populate the leaderboard.
        </p>
      </div>
    );
  }

  return <RubricArenaView data={data} showExplainer={showExplainer} />;
}
