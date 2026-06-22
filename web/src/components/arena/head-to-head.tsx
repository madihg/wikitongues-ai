"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bucketLabel, bucketShort, BUCKETS } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

interface PickerCandidate {
  id: string;
  name: string;
  kind: string;
  color: string | null;
}

/**
 * Two-select candidate picker shown when ?a / ?b are not both present.
 * Navigating sets the query string, which re-renders the page with the diff.
 */
export function ComparePicker({ a, b }: { a: string; b: string }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<PickerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selA, setSelA] = useState(a);
  const [selB, setSelB] = useState(b);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/arena/candidates");
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        const json = await r.json();
        if (active) setCandidates(json.candidates ?? []);
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

  function go() {
    if (!selA || !selB || selA === selB) return;
    router.push(
      `/admin/arena/compare?a=${encodeURIComponent(selA)}&b=${encodeURIComponent(selB)}`,
    );
  }

  const selectCls =
    "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent";

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading candidates…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
        {error}
      </div>
    );
  }

  const sameError = selA && selB && selA === selB;

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm text-text-secondary">
        Pick two candidates to compare on the held-out bank.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-pick-a">Candidate A</span>
          <select
            value={selA}
            onChange={(e) => setSelA(e.target.value)}
            className={selectCls}
          >
            <option value="">Select…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-pick-b">Candidate B</span>
          <select
            value={selB}
            onChange={(e) => setSelB(e.target.value)}
            className={selectCls}
          >
            <option value="">Select…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind})
              </option>
            ))}
          </select>
        </label>
      </div>
      {sameError && (
        <p className="text-xs text-danger">Pick two different candidates.</p>
      )}
      <button
        type="button"
        onClick={go}
        disabled={!selA || !selB || selA === selB}
        className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Compare
      </button>
    </div>
  );
}

interface CandidateShell {
  id: string;
  name: string;
  color: string | null;
  kind: string;
}

interface Comparison {
  winner: "a" | "b" | "tie";
  explanation: string;
}

interface Row {
  promptId: string;
  promptCode: string;
  bucket: EvalBucket;
  promptText: string;
  outputA: string;
  outputB: string;
  comparison: Comparison | null;
}

interface CompareResponse {
  candidateA: CandidateShell;
  candidateB: CandidateShell;
  rows: Row[];
}

export function HeadToHead({ a, b }: { a: string; b: string }) {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<EvalBucket | "all">("all");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/arena/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
        );
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
  }, [a, b]);

  const presentBuckets = useMemo(() => {
    if (!data) return [];
    const seen = new Set(data.rows.map((row) => row.bucket));
    return BUCKETS.filter((bd) => seen.has(bd.key));
  }, [data]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    if (bucketFilter === "all") return data.rows;
    return data.rows.filter((row) => row.bucket === bucketFilter);
  }, [data, bucketFilter]);

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading comparison…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const { candidateA, candidateB } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: candidateA.color ?? "var(--pick-a)" }}
            />
            <span className="font-medium text-pick-a">{candidateA.name}</span>
            <span className="font-mono text-xs text-text-tertiary">A</span>
          </span>
          <span className="text-text-muted">vs</span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: candidateB.color ?? "var(--pick-b)" }}
            />
            <span className="font-medium text-pick-b">{candidateB.name}</span>
            <span className="font-mono text-xs text-text-tertiary">B</span>
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Bucket
          <select
            value={bucketFilter}
            onChange={(e) =>
              setBucketFilter(e.target.value as EvalBucket | "all")
            }
            className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary focus-visible:border-accent"
          >
            <option value="all">All buckets</option>
            {presentBuckets.map((bd) => (
              <option key={bd.key} value={bd.key}>
                {bd.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-tertiary shadow-sm">
          No overlapping held-out outputs for these two candidates yet. Generate
          both candidates&apos; answers on the test bank to compare them.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-tertiary shadow-sm">
          No prompts in this bucket.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleRows.map((row) => {
            const winner = row.comparison?.winner ?? null;
            return (
              <article
                key={row.promptId}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-sunken px-4 py-2.5">
                  <span className="rounded-md bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-text">
                    {bucketShort(row.bucket)}
                  </span>
                  <span className="font-mono text-xs text-text-tertiary">
                    {row.promptCode}
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-text-primary">
                    {row.promptText}
                  </p>
                </div>

                <div className="grid gap-px bg-border md:grid-cols-2">
                  <div
                    className={`bg-surface p-4 ${
                      winner === "a" ? "ring-2 ring-inset ring-pick-a" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-pick-a">
                        A · {candidateA.name}
                      </span>
                      {winner === "a" && (
                        <span className="rounded-md bg-pick-a/10 px-2 py-0.5 text-xs font-medium text-pick-a">
                          human pick
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-sm whitespace-pre-wrap text-text-primary">
                      {row.outputA}
                    </p>
                  </div>

                  <div
                    className={`bg-surface p-4 ${
                      winner === "b" ? "ring-2 ring-inset ring-pick-b" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-pick-b">
                        B · {candidateB.name}
                      </span>
                      {winner === "b" && (
                        <span className="rounded-md bg-pick-b/10 px-2 py-0.5 text-xs font-medium text-pick-b">
                          human pick
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-sm whitespace-pre-wrap text-text-primary">
                      {row.outputB}
                    </p>
                  </div>
                </div>

                {row.comparison ? (
                  <div className="border-t border-border px-4 py-2.5 text-sm text-text-secondary">
                    <span className="font-medium text-text-tertiary">
                      {winner === "tie"
                        ? "Tie"
                        : `Picked ${winner === "a" ? "A" : "B"}`}
                      :{" "}
                    </span>
                    {row.comparison.explanation}
                  </div>
                ) : (
                  <div className="border-t border-border px-4 py-2.5 text-sm text-text-tertiary">
                    No human comparison recorded for this pair yet.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {bucketFilter !== "all" && (
        <p className="text-xs text-text-tertiary">
          Showing {visibleRows.length} of {data.rows.length} prompts ·{" "}
          {bucketLabel(bucketFilter)}
        </p>
      )}
    </div>
  );
}
