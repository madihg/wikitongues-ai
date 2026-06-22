import Link from "next/link";
import { JobMonitor } from "@/components/arena/job-monitor";

export default function JobsPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Fine-tune Jobs</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            The flywheel: collected pairwise and edit annotations become
            training sets, run through a provider, and land back in the arena as
            new candidates ready for a held-out eval. The closed (mock) path
            runs offline; open-weights providers are stubbed until credentials
            are wired.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/arena"
            className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            Back to Arena
          </Link>
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
