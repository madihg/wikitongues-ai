"use client";

import { ReviewQueue } from "@/components/review-queue";
import { HelpButton } from "@/components/help-button";

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
      <HelpButton
        title="Handoff Review"
        description="This screen shows AI-generated responses that the model flagged as low-confidence — cases where it wasn't sure of its answer. Review each item and choose to approve it, correct it, or reject it. You can also tag items to identify specific knowledge gaps. Your decisions help improve model reliability for underrepresented languages."
      />
    </div>
  );
}
