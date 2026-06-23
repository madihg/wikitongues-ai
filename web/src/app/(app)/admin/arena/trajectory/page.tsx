import Link from "next/link";
import { EpochTrajectory } from "@/components/arena/epoch-trajectory";

export default function TrajectoryPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Epoch trajectory</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Per-bucket champion strength across epochs. Each line tracks the
            best candidate&apos;s Bradley-Terry strength in that bucket as the
            flywheel turns — the shape of progress, bucket by bucket.
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>

      <EpochTrajectory />
    </div>
  );
}
