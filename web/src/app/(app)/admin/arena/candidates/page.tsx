import Link from "next/link";
import { CandidateRegistry } from "@/components/arena/candidate-registry";

export default function CandidatesPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Candidate Models</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            The registry of model variants in the arena. Each is a reproducible
            generation recipe, so &quot;Claude baseline&quot;, &quot;Gemini +
            RAG&quot;, and a fine-tuned open-weights variant are all just rows.
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>

      <CandidateRegistry />
    </div>
  );
}
