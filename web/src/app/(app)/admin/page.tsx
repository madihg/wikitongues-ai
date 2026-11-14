import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireResearcherPage } from "@/lib/admin/page-gate";
import { loadTodayWork } from "@/lib/admin/today-data";
import { weekOf } from "@/lib/admin/week";
import { speechLabEnabled } from "@/lib/lab-flags";
import { loadQueueInputs } from "@/lib/queue-input";
import {
  HoldingsBlock,
  ModelsBlock,
  NeedsYouBlock,
  WeekWorkBlock,
} from "@/components/admin/today-sections";

/**
 * Today: what changed this week, and what needs me.
 *
 * One column, four blocks, no tabs. It replaces the Researcher Dashboard,
 * which stacked ten cards and made seven requests from the browser after it
 * loaded. Everything here is rendered on the server in one pass:
 *
 *   Needs you         only the lines whose number crossed its threshold
 *   The models        one tile per model, each a number from its own view
 *   This week's work  one row per person who worked
 *   What we hold      the size of the corpus and what the week added
 *
 * The cards that left this page are all still reachable: the agreement bars
 * on Text model, Benchmark; agreement between annotators on Data,
 * Disagreements; activity and hours on People; the downloads on Data, Export;
 * the old leaderboard, category scores and gap closure under More, Archive.
 *
 * Every number is computed from the database per request.
 */
export const dynamic = "force-dynamic";

const Skeleton = ({ rows, tall }: { rows: number; tall?: boolean }) => (
  <div className="space-y-2" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className={`animate-pulse rounded-md bg-surface-sunken ${tall ? "h-28" : "h-10"}`}
        style={{ animationDelay: `${i * 80}ms` }}
      />
    ))}
  </div>
);

export default async function TodayPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  await requireResearcherPage();
  const sp = (await searchParams) ?? {};
  const thisWeek = sp.week !== "last";
  const now = new Date();
  const week = weekOf(now, thisWeek ? 0 : -1);
  const speech = speechLabEnabled();

  // Started once, awaited by three blocks. The queue is the same load the
  // Annotate page makes, so "Prompts left" is what a person would be served.
  const work = loadQueueInputs().then(({ queuePrompts }) =>
    loadTodayWork(prisma, { now, week, speech, queuePrompts }),
  );
  // A block that never renders must not leave a rejection unhandled.
  work.catch(() => undefined);

  const toggle = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-text-tertiary hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Today</h1>
          <p className="mt-2 text-sm text-text-tertiary">
            What changed this week, and what needs you. {week.label}, Monday to
            Sunday, Lagos time.
          </p>
        </div>
        <div
          role="group"
          aria-label="Which week"
          className="inline-flex rounded-md border border-border bg-surface p-0.5"
        >
          {toggle("This week", "/admin", thisWeek)}
          {toggle("Last week", "/admin?week=last", !thisWeek)}
        </div>
      </div>

      <div className="space-y-10">
        <Suspense fallback={null}>
          <NeedsYouBlock work={work} />
        </Suspense>
        <Suspense fallback={<Skeleton rows={3} tall />}>
          <ModelsBlock speech={speech} />
        </Suspense>
        <Suspense fallback={<Skeleton rows={4} />}>
          <WeekWorkBlock work={work} speech={speech} thisWeek={thisWeek} />
        </Suspense>
        <Suspense fallback={<Skeleton rows={1} tall />}>
          <HoldingsBlock work={work} thisWeek={thisWeek} />
        </Suspense>
      </div>
    </div>
  );
}
