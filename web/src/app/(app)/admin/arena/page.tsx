import Link from "next/link";
import { BucketMatrix } from "@/components/arena/bucket-matrix";
import { HelpButton } from "@/components/help-button";

export default function ArenaPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Model Arena</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Register model variants that differ by exactly one rung — a closed
            baseline, the same base with RAG, a fine-tuned variant — and rank
            them on the held-out Igala bank, per linguistic bucket. The
            rung-by-rung deltas are the experiment.
          </p>
        </div>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {[
          { href: "/admin/arena/candidates", label: "Candidates" },
          { href: "/admin/arena/jobs", label: "Fine-tune jobs" },
          { href: "/admin/arena/compare", label: "Head-to-head" },
          { href: "/admin/arena/trajectory", label: "Trajectory" },
          { href: "/admin/arena/contested", label: "Collective review" },
          { href: "/admin", label: "Dashboard" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <BucketMatrix />

      <HelpButton
        title="Model Arena"
        description="The arena ranks candidate models per linguistic bucket using human pairwise judgments converted to Bradley-Terry strengths. Register candidates (a base model + optional RAG, system prompt, or fine-tune artifact), generate their answers on the held-out question bank, and have annotators compare them blind. Cells show a 0-100 arena strength with a confidence-aware tint; 'ns' marks buckets where the sample is too small to tell candidates apart. LLM-as-judge is restricted to triage and never reports a score here."
      />
    </div>
  );
}
