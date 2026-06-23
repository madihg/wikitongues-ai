import { Leaderboard } from "@/components/admin/leaderboard";
import { CategoryBreakdown } from "@/components/admin/category-breakdown";
import { AgreementStats } from "@/components/admin/agreement-stats";
import { GapDashboard } from "@/components/admin/gap-dashboard";
import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { ExportPanel } from "@/components/admin/export-panel";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          Researcher Dashboard
          <InfoTip width="w-80">
            The researcher dashboard summarizes annotation progress and model
            performance for Igala. Each section below explains its own metric.
          </InfoTip>
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Cross-model comparisons, annotation progress, and benchmark results.
          All data is read-only.
        </p>
      </div>

      <div className="space-y-6">
        <Leaderboard />
        <CategoryBreakdown />

        <div className="grid gap-6 lg:grid-cols-2">
          <AgreementStats />
          <GapDashboard />
        </div>

        <AnnotatorActivity />
        <ExportPanel />
      </div>

      <HelpButton
        title="Researcher Dashboard"
        description="This screen gives researchers a read-only overview of annotation progress and model performance. The Leaderboard ranks models by aggregate score. Category Breakdown shows performance across linguistic and cultural dimensions. Agreement Stats measure inter-annotator consistency. The Gap Dashboard highlights areas where model knowledge is weakest. Annotator Activity tracks contributor participation. Use Export to download data for offline analysis."
      />
    </div>
  );
}
