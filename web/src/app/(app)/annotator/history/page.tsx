"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HelpButton } from "@/components/help-button";

type HistoryRow =
  | {
      kind: "pairwise";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      winner: string;
      confidence: number | null;
      explanation: string;
      outputA: string;
      outputB: string;
    }
  | {
      kind: "cold";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      answerText: string;
      provenance: string;
    }
  | {
      kind: "edit";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      originalText: string;
      correctedText: string;
    };

const PAGE_SIZE = 20;

const WINNER_LABEL: Record<string, string> = {
  a: "Picked A",
  b: "Picked B",
  tie: "Tie - both adequate",
  both_inadequate: "Both inadequate",
};

const TYPE_LABEL: Record<HistoryRow["kind"], string> = {
  pairwise: "Comparison",
  cold: "Gold answer",
  edit: "Correction",
};

const TYPE_CLASS: Record<HistoryRow["kind"], string> = {
  pairwise: "bg-surface-sunken text-text-secondary",
  cold: "bg-accent-subtle text-accent-text",
  edit: "bg-info-subtle text-info",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rowSummary(row: HistoryRow): string {
  if (row.kind === "pairwise") return WINNER_LABEL[row.winner] ?? row.winner;
  if (row.kind === "cold") return "Your own answer";
  return "Winner corrected";
}

function HistoryRowDetail({ row }: { row: HistoryRow }) {
  if (row.kind === "pairwise") {
    return (
      <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-4">
        {row.explanation && (
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Why: </span>
            {row.explanation}
          </p>
        )}
        {row.confidence !== null && (
          <p className="text-xs text-text-tertiary">
            Confidence {row.confidence}/4
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-md border p-3 text-sm font-mono leading-relaxed ${
              row.winner === "a"
                ? "border-accent bg-surface"
                : "border-border bg-surface"
            }`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Output A{row.winner === "a" && " - picked"}
            </div>
            <div className="whitespace-pre-wrap text-text-primary">
              {row.outputA}
            </div>
          </div>
          <div
            className={`rounded-md border p-3 text-sm font-mono leading-relaxed ${
              row.winner === "b"
                ? "border-accent bg-surface"
                : "border-border bg-surface"
            }`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Output B{row.winner === "b" && " - picked"}
            </div>
            <div className="whitespace-pre-wrap text-text-primary">
              {row.outputB}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (row.kind === "cold") {
    return (
      <div className="border-t border-border bg-surface-sunken px-4 py-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Your answer
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
          {row.answerText}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Original
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-secondary">
          {row.originalText}
        </p>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Your correction
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
          {row.correctedText}
        </p>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/annotator/history?limit=${PAGE_SIZE}&offset=${nextOffset}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
      setHasMore(!!data.hasMore);
      setOffset(nextOffset);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(0, false);
  }, [load]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">My Work</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Everything you&apos;ve submitted - comparisons, gold answers, and
          corrections.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
          Couldn&apos;t load your history. Refresh the page to try again.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-text-tertiary">
            Loading your work…
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-text-secondary">
              You haven&apos;t submitted anything yet.
            </p>
            <Link
              href="/annotator/annotate"
              className="mt-3 inline-block rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
            >
              Start annotating
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const isOpen = expanded === row.id;
              return (
                <li key={row.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left hover:bg-surface-sunken"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[row.kind]}`}
                    >
                      {TYPE_LABEL[row.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {row.promptText}
                    </span>
                    <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">
                      {row.bucketLabel}
                    </span>
                    <span className="shrink-0 text-xs text-text-tertiary">
                      {rowSummary(row)}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {formatDate(row.createdAt)}
                    </span>
                    <span className="shrink-0 text-text-muted">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && <HistoryRowDetail row={row} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasMore && !loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => load(offset + PAGE_SIZE, true)}
            disabled={loadingMore}
            className="cursor-pointer rounded-md border border-border-strong bg-surface px-6 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-40"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <HelpButton
        title="My Work"
        description="This page lists everything you've personally submitted: blind comparisons, gold answers you authored before seeing any model, and corrections you made to a winning output. Click a row to see the full detail. This is your own work only - demo sessions and other annotators' work are never shown here."
      />
    </div>
  );
}
