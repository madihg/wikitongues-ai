import { EpochTrajectory } from "@/components/arena/epoch-trajectory";

export default function TrajectoryPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Epoch trajectory</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          The best candidate&apos;s arena strength in each prompt category, over
          time. It is drawn from the same blind human votes as the leaderboard,
          so it can only move once annotators start picking winners. While
          nearly every comparison comes back &quot;both inadequate&quot;, a flat
          line here means no evidence has arrived yet, not that the work has
          stalled.
        </p>
      </div>

      <EpochTrajectory />
    </div>
  );
}
