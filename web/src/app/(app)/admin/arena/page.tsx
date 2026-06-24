import Link from "next/link";
import { BucketMatrix } from "@/components/arena/bucket-matrix";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

const NAV = [
  {
    href: "/admin/arena/candidates",
    label: "Candidates",
    tip: "The registry of model variants. A candidate is a reproducible recipe: a base model plus optional RAG, system prompt, or fine-tune artifact. 'Run eval' generates that candidate's answers on the held-out bank.",
  },
  {
    href: "/admin/arena/jobs",
    label: "Fine-tune jobs",
    tip: "Turn collected annotations into training sets and launch fine-tunes: pairwise picks become DPO pairs, edits become SFT targets. Currently uses a mock provider; wire a real GPU provider to train for real.",
  },
  {
    href: "/admin/arena/compare",
    label: "Head-to-head",
    tip: "Two candidates side by side, prompt-by-prompt on the held-out bank, with the human winner and explanation. This is where a model's failures become concrete.",
  },
  {
    href: "/admin/arena/trajectory",
    label: "Trajectory",
    tip: "Per-bucket champion strength over epochs — proof (or not) that the feedback loop is moving the needle on each linguistic dimension.",
  },
  {
    href: "/admin/arena/contested",
    label: "Collective review",
    tip: "Items where annotators disagreed, plus edits pending verification. Resolve these together to raise inter-annotator agreement and promote corrections to gold.",
  },
  {
    href: "/admin/arena/costs",
    label: "Cost ledger",
    tip: "Holistic spend across providers — inference (estimated from token counts) and fine-tune training, including the cost of Together sessions.",
  },
  {
    href: "/admin/arena/demo",
    label: "Demo session",
    tip: "Start a throwaway walkthrough of the real annotation episode for a live audience. Demo records never reach training, the leaderboard, or fine-tune sources.",
  },
  {
    href: "/admin",
    label: "Dashboard",
    tip: "Back to the researcher overview.",
  },
];

export default function ArenaPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl text-text-primary">
            Model Arena
            <InfoTip label="About the arena" width="w-80">
              The arena ranks candidate models{" "}
              <strong>per linguistic bucket</strong> using human pairwise
              judgments converted to <strong>Bradley-Terry</strong> strengths
              (the LMArena standard). Register variants that differ by one rung
              (baseline, +RAG, fine-tuned), generate their answers on a
              contamination-safe held-out bank, and have annotators compare them
              blind. LLM-as-judge is restricted to triage — it can&apos;t grade
              a language it is itself poor at.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Register model variants that differ by exactly one rung — a closed
            baseline, the same base with RAG, a fine-tuned variant — and rank
            them on the held-out Igala bank, per linguistic bucket. The
            rung-by-rung deltas are the experiment.
          </p>
        </div>
      </div>

      <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
        {NAV.map((l) => (
          <span key={l.href} className="inline-flex items-center gap-1">
            <Link
              href={l.href}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
            >
              {l.label}
            </Link>
            <InfoTip label={`About ${l.label}`}>{l.tip}</InfoTip>
          </span>
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
