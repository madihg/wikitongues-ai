import Link from "next/link";
import { TrainingBuilder } from "@/components/arena/training-builder";

export default function NewJobPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">New Fine-tune Job</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Pick a method and a base candidate, optionally filter by prompt
            category, and launch. SFT teaches the language the model is missing,
            from community-authored gold. DPO is the finisher that sharpens an
            already-competent model using decided winners, so it is not usable
            yet - almost every comparison so far came back &quot;both
            inadequate&quot;. The builder always excludes held-out prompts from
            the training set: a benchmark that leaked into training is
            meaningless.
          </p>
        </div>
        <Link
          href="/admin/arena/jobs"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Jobs
        </Link>
      </div>

      <TrainingBuilder />
    </div>
  );
}
