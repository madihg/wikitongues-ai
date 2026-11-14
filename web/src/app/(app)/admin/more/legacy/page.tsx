import Link from "next/link";
import { Leaderboard } from "@/components/admin/leaderboard";
import { CategoryBreakdown } from "@/components/admin/category-breakdown";
import { GapDashboard } from "@/components/admin/gap-dashboard";
import { requireResearcherPage } from "@/lib/admin/page-gate";

/**
 * The three cards that left the Researcher Dashboard, rendered exactly as
 * they were. Each fetches its own data from a researcher-only route. Kept so
 * nothing is lost; linked only from More, Archive.
 */
export default async function LegacyCardsPage() {
  await requireResearcherPage();
  return (
    <div>
      <div className="mb-8">
        <p className="text-sm">
          <Link href="/admin/more" className="font-medium text-accent-text">
            &larr; More
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          Old dashboard cards
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-tertiary">
          Three cards from the old Researcher Dashboard, kept as they were. Each
          one says below why it is no longer on the main pages.
        </p>
      </div>

      <div className="space-y-10">
        <section id="leaderboard" className="scroll-mt-8">
          <p className="mb-3 max-w-2xl text-sm text-text-secondary">
            This table counts every model ever tried, including the ones we have
            retired. For who is ahead today, read the Verdict.
          </p>
          <Leaderboard />
        </section>
        <section id="categories" className="scroll-mt-8">
          <p className="mb-3 max-w-2xl text-sm text-text-secondary">
            The rubric is scored on the winning answer only. So these averages
            describe winners, not models.
          </p>
          <CategoryBreakdown />
        </section>
        <section id="gaps" className="scroll-mt-8">
          <p className="mb-3 max-w-2xl text-sm text-text-secondary">
            This card reads the learner review queue. No item has ever arrived
            there.
          </p>
          <GapDashboard />
        </section>
      </div>
    </div>
  );
}
