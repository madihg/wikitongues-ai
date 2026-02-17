"use client";

import { useState } from "react";

interface HandoffItemData {
  id: string;
  learnerRequest: string;
  modelAnswer: string;
  confidenceScore: number;
  reviewerReasoning: string | null;
  gapCategory: string | null;
  status: string;
  correctedAnswer: string | null;
  reviewerId: string | null;
  verificationStatus: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewer: { name: string | null; email: string } | null;
}

const GAP_COLORS: Record<string, string> = {
  missing_vocabulary: "bg-red-100 text-red-800",
  missing_cultural_context: "bg-purple-100 text-purple-800",
  missing_dialect_knowledge: "bg-orange-100 text-orange-800",
  missing_translation_pair: "bg-blue-100 text-blue-800",
};

const GAP_LABELS: Record<string, string> = {
  missing_vocabulary: "Missing Vocabulary",
  missing_cultural_context: "Missing Cultural Context",
  missing_dialect_knowledge: "Missing Dialect Knowledge",
  missing_translation_pair: "Missing Translation Pair",
};

function confidenceColor(score: number): string {
  if (score < 0.4) return "bg-red-500";
  if (score < 0.6) return "bg-orange-500";
  if (score < 0.7) return "bg-yellow-500";
  return "bg-green-500";
}

function confidenceTextColor(score: number): string {
  if (score < 0.4) return "text-red-700";
  if (score < 0.6) return "text-orange-700";
  if (score < 0.7) return "text-yellow-700";
  return "text-green-700";
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    in_review: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    corrected: "bg-indigo-100 text-indigo-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-800"}`}
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
    <div className="rounded-lg border border-gray-300 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={item.status} />
          {item.gapCategory && (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${GAP_COLORS[item.gapCategory] ?? "bg-gray-100 text-gray-800"}`}
            >
              {GAP_LABELS[item.gapCategory] ?? item.gapCategory}
            </span>
          )}
          <span className="text-xs text-gray-500">
            Created {relativeTime(item.createdAt)}
          </span>
          {item.reviewedAt && (
            <span className="text-xs text-gray-500">
              Reviewed {relativeTime(item.reviewedAt)}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
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
          <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${confidenceColor(item.confidenceScore)}`}
              style={{ width: `${item.confidenceScore * 100}%` }}
            />
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Learner Request
          </h4>
          <p
            className="rounded-md bg-gray-50 p-3 text-sm text-gray-900"
            dir={learnerRequestIsRtl ? "rtl" : "ltr"}
          >
            {item.learnerRequest}
          </p>
        </div>

        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Model Answer
          </h4>
          <div
            className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-900"
            dir={modelAnswerIsRtl ? "rtl" : "ltr"}
          >
            {item.modelAnswer}
          </div>
        </div>

        {item.reviewerReasoning && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Reviewer Reasoning
            </h4>
            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              {item.reviewerReasoning}
            </p>
          </div>
        )}

        {item.correctedAnswer && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Corrected Answer
            </h4>
            <div
              className="whitespace-pre-wrap rounded-md bg-indigo-50 p-3 text-sm text-gray-900"
              dir={detectRtl(item.correctedAnswer) ? "rtl" : "ltr"}
            >
              {item.correctedAnswer}
            </div>
          </div>
        )}

        {item.reviewer && (
          <div className="text-xs text-gray-500">
            Reviewed by {item.reviewer.name || item.reviewer.email}
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/50 p-4">
            <h4 className="text-sm font-medium text-gray-900">
              Edit & Approve
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Original Answer
                </label>
                <div
                  className="h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700"
                  dir={modelAnswerIsRtl ? "rtl" : "ltr"}
                >
                  {item.modelAnswer}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Corrected Answer
                </label>
                <textarea
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                  className="h-40 w-full resize-none rounded-md border border-gray-300 p-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  dir={modelAnswerIsRtl ? "rtl" : "ltr"}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCorrect}
                disabled={submitting || !editedAnswer.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Correction"}
              </button>
              <button
                onClick={() => setMode("view")}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "reject" && (
          <div className="space-y-3 rounded-md border border-red-200 bg-red-50/50 p-4">
            <h4 className="text-sm font-medium text-gray-900">
              Reject as Hallucination
            </h4>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this output is incorrect..."
              className="h-24 w-full resize-none rounded-md border border-gray-300 p-3 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={submitting || !rejectReason.trim()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Rejecting..." : "Reject"}
              </button>
              <button
                onClick={() => setMode("view")}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isResolved && mode === "view" && (
          <div className="flex gap-2 border-t border-gray-200 pt-4">
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => setMode("edit")}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Edit & Approve
            </button>
            <button
              onClick={() => setMode("reject")}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
