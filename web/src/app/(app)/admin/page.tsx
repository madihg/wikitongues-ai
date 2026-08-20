import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeMethodMetrics } from "@/lib/method-metrics";
import { BenchmarkBars } from "@/components/arena/benchmark-bars";
import { Leaderboard } from "@/components/admin/leaderboard";
import { CategoryBreakdown } from "@/components/admin/category-breakdown";
import { AgreementStats } from "@/components/admin/agreement-stats";
import { GapDashboard } from "@/components/admin/gap-dashboard";
import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { TimeSpent } from "@/components/admin/time-spent";
import { ExportPanel } from "@/components/admin/export-panel";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

/** The benchmark card is computed from the database per request - the house
 * rule: no hardcoded counts or scores anywhere in the UI. */
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const metrics = await computeMethodMetrics(prisma);

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
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/annotations"
            className="group rounded-lg border border-border bg-surface p-6 shadow-sm transition-colors hover:bg-surface-sunken"
          >
            <h2 className="text-base font-semibold text-text-primary">
              Annotations
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">
              Read every annotator&apos;s pairwise picks, cold answers, and
              edits. Correct and mark reviewed.
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-accent-text">
              Open review surface →
            </span>
          </Link>
          <Link
            href="/annotator/prompts"
            className="group rounded-lg border border-border bg-surface p-6 shadow-sm transition-colors hover:bg-surface-sunken"
          >
            <h2 className="text-base font-semibold text-text-primary">
              Prompt Catalogue
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">
              Browse and edit the prompt bank. Changes are audited per field.
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-accent-text">
              Browse and edit →
            </span>
          </Link>
        </div>

        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              Community Agreement Score
              <InfoTip width="w-80">
                Leak-free stripped chrF rescaled so that 100 marks how closely
                one native speaker agrees with another on the same frozen
                questions. Computed live per request; never capped at 100.
              </InfoTip>
            </h2>
            <Link
              href="/how-it-works"
              className="text-sm font-medium text-accent-text"
            >
              How this score works →
            </Link>
          </div>
          <p className="mb-3 mt-1 text-sm text-text-tertiary">
            The frozen-exam benchmark, drawn the way language models are usually
            compared.
          </p>
          <BenchmarkBars
            candidates={metrics.candidates}
            ceilingChrf={metrics.agreementCeilingChrf}
            leakFreePrompts={metrics.benchmark.leakFreePrompts}
          />
        </section>

        <Leaderboard />
        <CategoryBreakdown />

        <div className="grid gap-6 lg:grid-cols-2">
          <AgreementStats />
          <GapDashboard />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AnnotatorActivity />
          <TimeSpent />
        </div>
        <ExportPanel />
      </div>

      <HelpButton
        title="Researcher Dashboard"
        description="This screen gives researchers a read-only overview of annotation progress and model performance. The Leaderboard ranks models by aggregate score. Category Breakdown shows performance across linguistic and cultural dimensions. Agreement Stats measure inter-annotator consistency. The Gap Dashboard highlights areas where model knowledge is weakest. Annotator Activity tracks contributor participation. Use Export to download data for offline analysis."
      />
    </div>
  );
}
