import Link from "next/link";
import { DemoLauncher } from "@/components/arena/demo-launcher";
import { InfoTip } from "@/components/info-tip";

export default function DemoPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl text-text-primary">
            Demo session
            <InfoTip width="w-80">
              Run the real annotation episode for a live audience without
              polluting data. Records created in a demo session are flagged and
              excluded from training exports, the leaderboard, and fine-tune
              sources.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Start a throwaway walkthrough to show people how annotation works.
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>
      <DemoLauncher />
    </div>
  );
}
