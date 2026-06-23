"use client";

import { useState, useEffect, useRef } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { ReviewItem } from "./review-item";

interface HandoffItemData {
  id: string;
  learnerRequest: string;
  modelAnswer: string;
  confidenceScore: number;
  reviewerReasoning: string | null;
  gapBucket: EvalBucket | null;
  status: string;
  correctedAnswer: string | null;
  reviewerId: string | null;
  verificationStatus: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewer: { name: string | null; email: string } | null;
}

interface Stats {
  pending: number;
  inReview: number;
  resolved: number;
  approved: number;
  corrected: number;
  rejected: number;
  gapBreakdown: Record<string, number>;
  averageTimeInQueueHours: number | null;
}

type StatusFilter = "all" | "pending" | "in_review" | "resolved";

function confidenceColor(score: number): string {
  if (score < 0.4) return "bg-danger";
  if (score < 0.6) return "bg-warning";
  if (score < 0.7) return "bg-warning";
  return "bg-success";
}

function confidenceTextColor(score: number): string {
  if (score < 0.4) return "text-danger";
  if (score < 0.6) return "text-warning";
  if (score < 0.7) return "text-warning";
  return "text-success";
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning-subtle text-warning",
    in_review: "bg-info-subtle text-info",
    approved: "bg-success-subtle text-success",
    corrected: "bg-accent-subtle text-accent-text",
    rejected: "bg-danger-subtle text-danger",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-surface-sunken text-text-secondary"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function ReviewQueue() {
  const [items, setItems] = useState<HandoffItemData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchKeyRef = useRef("");
  const [fetchedKey, setFetchedKey] = useState("");

  const currentKey = `${filter}-${page}-${refreshKey}`;
  const loading = fetchedKey !== currentKey;

  useEffect(() => {
    const controller = new AbortController();
    const key = currentKey;

    async function load() {
      const statusParam =
        filter === "all"
          ? ""
          : filter === "resolved"
            ? ""
            : `&status=${filter}`;

      try {
        const [itemsRes, statsRes] = await Promise.all([
          fetch(`/api/handoffs?page=${page}${statusParam}`, {
            signal: controller.signal,
          }),
          fetch("/api/handoffs/stats", { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        if (itemsRes.ok) {
          const data = await itemsRes.json();
          let filtered = data.items as HandoffItemData[];
          if (filter === "resolved") {
            filtered = filtered.filter((i: HandoffItemData) =>
              ["approved", "corrected", "rejected"].includes(i.status),
            );
          }
          setItems(filtered);
          setTotalPages(data.totalPages);
        }

        if (statsRes.ok) {
          setStats(await statsRes.json());
        }

        setFetchedKey(key);
      } catch {
        // aborted
      }
    }

    if (fetchKeyRef.current !== key) {
      fetchKeyRef.current = key;
      load();
    }

    return () => {
      controller.abort();
    };
  }, [filter, page, refreshKey, currentKey]);

  const handleAction = () => {
    setExpandedId(null);
    setRefreshKey((k) => k + 1);
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_review", label: "In Review" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <div>
      {stats && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">
                {stats.resolved}
              </span>{" "}
              gaps resolved,{" "}
              <span className="font-semibold text-text-primary">
                {stats.pending}
              </span>{" "}
              remaining
            </div>
            {stats.averageTimeInQueueHours !== null && (
              <div className="text-xs text-text-tertiary">
                Avg. time in queue:{" "}
                {stats.averageTimeInQueueHours < 1
                  ? `${Math.round(stats.averageTimeInQueueHours * 60)}m`
                  : `${Math.round(stats.averageTimeInQueueHours)}h`}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-accent text-accent-contrast"
                : "text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            {f.label}
            {f.key === "pending" && stats ? (
              <span className="ml-1.5 rounded-full bg-warning-subtle px-1.5 py-0.5 text-xs text-warning">
                {stats.pending}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-text-tertiary">
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">
            No items pending review. The AI is doing well!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) =>
            expandedId === item.id ? (
              <ReviewItem
                key={item.id}
                item={item}
                onClose={() => setExpandedId(null)}
                onAction={handleAction}
              />
            ) : (
              <button
                key={item.id}
                onClick={() => setExpandedId(item.id)}
                className="block w-full cursor-pointer rounded-lg border border-border bg-surface p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      {item.gapBucket && (
                        <span className="inline-flex rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {bucketLabel(item.gapBucket)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-text-primary">
                      {item.learnerRequest}
                    </p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-col items-end">
                    <span
                      className={`text-sm font-semibold ${confidenceTextColor(item.confidenceScore)}`}
                    >
                      {Math.round(item.confidenceScore * 100)}%
                    </span>
                    <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={`h-full rounded-full ${confidenceColor(item.confidenceScore)}`}
                        style={{
                          width: `${item.confidenceScore * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            ),
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-text-tertiary">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
