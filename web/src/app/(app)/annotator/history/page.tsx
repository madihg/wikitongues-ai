"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HelpButton } from "@/components/help-button";
import {
  AnswerEditorDrawer,
  type EditTarget,
} from "@/components/answer-editor";
import {
  MyWorkFilter,
  MyWorkRows,
  type HistoryRow,
  type MyWorkFilterValue,
} from "@/components/my-work-rows";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // All, or only the rows that need a meaning or a reason.
  const [filter, setFilter] = useState<MyWorkFilterValue>("all");
  // The row open in the edit drawer, if any.
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(false);
      try {
        const res = await fetch(
          `/api/annotator/history?limit=${PAGE_SIZE}&offset=${nextOffset}${
            filter === "fix" ? "&filter=fix" : ""
          }`,
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
    },
    [filter],
  );

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

      <MyWorkFilter value={filter} onChange={setFilter} />

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
        ) : !error && rows.length === 0 && filter === "fix" ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-text-secondary">
              Nothing to fix. Every answer has a meaning and every correction
              has a reason.
            </p>
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
          <MyWorkRows
            rows={rows}
            expanded={expanded}
            onToggle={(id) => setExpanded(expanded === id ? null : id)}
            onEdit={(row) => setEditing({ type: row.kind, id: row.id })}
          />
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

      {editing && (
        <AnswerEditorDrawer
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={() => load(0, false)}
        />
      )}

      <HelpButton
        title="My Work"
        description="This page lists everything you've personally submitted: blind comparisons, gold answers you authored before seeing any model, and corrections you made to a winning output. Click a row to see the full detail. Press Edit on a row to change what you wrote: the answer, its meaning, a correction or a reason. The choice you made cannot be changed. This is your own work only - demo sessions and other annotators' work are never shown here."
      />
    </div>
  );
}
