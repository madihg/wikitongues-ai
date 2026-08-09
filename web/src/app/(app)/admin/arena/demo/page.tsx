import { DemoLauncher } from "@/components/arena/demo-launcher";
import { InfoTip } from "@/components/info-tip";

export default function DemoPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Demo session
          <InfoTip width="w-80">
            Run the real annotation episode for a live audience without
            polluting the data. Records created in a demo session are flagged
            and excluded from training exports, the leaderboard, and fine-tune
            sources, so the vote counts in the arena stay a count of real
            community judgment.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Start a throwaway walkthrough to show people how annotation works.
          Nothing recorded here reaches training or the leaderboard.
        </p>
      </div>
      <DemoLauncher />
    </div>
  );
}
