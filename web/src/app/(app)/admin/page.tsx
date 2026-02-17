import { Leaderboard } from "@/components/admin/leaderboard";
import { CategoryBreakdown } from "@/components/admin/category-breakdown";
import { AgreementStats } from "@/components/admin/agreement-stats";
import { GapDashboard } from "@/components/admin/gap-dashboard";
import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { ExportPanel } from "@/components/admin/export-panel";

export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Researcher Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-500">
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
    </div>
  );
}
