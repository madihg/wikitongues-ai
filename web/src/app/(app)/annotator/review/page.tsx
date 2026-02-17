"use client";

import { ReviewQueue } from "@/components/review-queue";

export default function ReviewPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Handoff Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review low-confidence model outputs flagged for human verification.
          Approve, correct, or reject items and categorize knowledge gaps.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}
