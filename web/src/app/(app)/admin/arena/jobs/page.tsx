import Link from "next/link";
import { JobMonitor } from "@/components/arena/job-monitor";

export default function JobsPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Fine-tune Jobs</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Collected annotations become training sets, run through a provider,
            and land back in the arena as new candidates queued for a run on the
            frozen benchmark. Training is only half of it: a tuned model also
            needs somewhere to be served. An OpenAI-tuned model is servable the
            moment the job finishes. A tuned open-weights model on Together
            needs a dedicated GPU endpoint, because serverless LoRA inference is
            no longer offered - which is why runs that trained equally well have
            ended up with very different fates.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/arena/jobs/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            New job
          </Link>
        </div>
      </div>

      <JobMonitor />
    </div>
  );
}
