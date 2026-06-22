"use client";

import { useState } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";

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

function detectRtl(text: string): boolean {
  const rtlChars =
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlChars.test(text);
}

export function ReviewItem({
  item,
  onClose,
  onAction,
}: {
  item: HandoffItemData;
  onClose: () => void;
  onAction: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [editedAnswer, setEditedAnswer] = useState(item.modelAnswer);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = ["approved", "corrected", "rejected"].includes(
    item.status,
  );

  const modelAnswerIsRtl = detectRtl(item.modelAnswer);
  const learnerRequestIsRtl = detectRtl(item.learnerRequest);

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/handoffs/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      onAction();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to approve");
    }
    setSubmitting(false);
  }

  async function handleCorrect() {
    if (!editedAnswer.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/handoffs/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "correct",
        correctedAnswer: editedAnswer,
      }),
    });
    if (res.ok) {
      onAction();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save correction");
    }
    setSubmitting(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/handoffs/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: rejectReason }),
    });
    if (res.ok) {
      onAction();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to reject");
    }
    setSubmitting(false);
  }

  return (
    <div className="rounded-lg border border-border-strong bg-surface shadow-md">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={item.status} />
          {item.gapBucket && (
            <span className="inline-flex rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
              {bucketLabel(item.gapBucket)}
            </span>
          )}
          <span className="text-xs text-text-tertiary">
            Created {relativeTime(item.createdAt)}
          </span>
          {item.reviewedAt && (
            <span className="text-xs text-text-tertiary">
              Reviewed {relativeTime(item.reviewedAt)}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer text-text-muted hover:text-text-secondary"
          aria-label="Close"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <span
            className={`text-lg font-semibold ${confidenceTextColor(item.confidenceScore)}`}
          >
            {Math.round(item.confidenceScore * 100)}% confidence
          </span>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full ${confidenceColor(item.confidenceScore)}`}
              style={{ width: `${item.confidenceScore * 100}%` }}
            />
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Learner Request
          </h4>
          <p
            className="rounded-md bg-surface-sunken p-3 text-sm text-text-primary"
            dir={learnerRequestIsRtl ? "rtl" : "ltr"}
          >
            {item.learnerRequest}
          </p>
        </div>

        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Model Answer
          </h4>
          <div
            className="whitespace-pre-wrap rounded-md bg-surface-sunken p-3 text-sm text-text-primary"
            dir={modelAnswerIsRtl ? "rtl" : "ltr"}
          >
            {item.modelAnswer}
          </div>
        </div>

        {item.reviewerReasoning && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Reviewer Reasoning
            </h4>
            <p className="rounded-md bg-surface-sunken p-3 text-sm text-text-secondary">
              {item.reviewerReasoning}
            </p>
          </div>
        )}

        {item.correctedAnswer && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Corrected Answer
            </h4>
            <div
              className="whitespace-pre-wrap rounded-md bg-accent-subtle p-3 text-sm text-text-primary"
              dir={detectRtl(item.correctedAnswer) ? "rtl" : "ltr"}
            >
              {item.correctedAnswer}
            </div>
          </div>
        )}

        {item.reviewer && (
          <div className="text-xs text-text-tertiary">
            Reviewed by {item.reviewer.name || item.reviewer.email}
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-3 rounded-md border border-accent bg-accent-subtle/50 p-4">
            <h4 className="text-sm font-medium text-text-primary">
              Edit & Approve
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-tertiary">
                  Original Answer
                </label>
                <div
                  className="h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm text-text-secondary"
                  dir={modelAnswerIsRtl ? "rtl" : "ltr"}
                >
                  {item.modelAnswer}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-tertiary">
                  Corrected Answer
                </label>
                <textarea
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                  className="h-40 w-full resize-none rounded-md border border-border-strong p-3 text-sm focus:border-accent focus:outline-none"
                  dir={modelAnswerIsRtl ? "rtl" : "ltr"}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCorrect}
                disabled={submitting || !editedAnswer.trim()}
                className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Correction"}
              </button>
              <button
                onClick={() => setMode("view")}
                className="cursor-pointer rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "reject" && (
          <div className="space-y-3 rounded-md border border-danger bg-danger-subtle/50 p-4">
            <h4 className="text-sm font-medium text-text-primary">
              Reject as Hallucination
            </h4>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this output is incorrect..."
              className="h-24 w-full resize-none rounded-md border border-border-strong p-3 text-sm focus:border-danger focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={submitting || !rejectReason.trim()}
                className="cursor-pointer rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Rejecting..." : "Reject"}
              </button>
              <button
                onClick={() => setMode("view")}
                className="cursor-pointer rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-danger-subtle p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {!isResolved && mode === "view" && (
          <div className="flex gap-2 border-t border-border pt-4">
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="cursor-pointer rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => setMode("edit")}
              className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
            >
              Edit & Approve
            </button>
            <button
              onClick={() => setMode("reject")}
              className="cursor-pointer rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
