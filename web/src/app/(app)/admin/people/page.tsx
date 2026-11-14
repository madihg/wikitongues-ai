import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireResearcherPage } from "@/lib/admin/page-gate";
import { loadPeople } from "@/lib/admin/people-data";
import { weekRows, weekTotals } from "@/lib/admin/today";
import { weekOf, type Week } from "@/lib/admin/week";
import { speechLabEnabled } from "@/lib/lab-flags";
import { loadQueueInputs } from "@/lib/queue-input";
import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { TimeSpent } from "@/components/admin/time-spent";
import { WeekWorkTable } from "@/components/admin/week-work-table";

/**
 * People: who worked, for how many hours, and who is running out of prompts.
 *
 * Three blocks. The week's work, one row per person, with the prompts each
 * person has left (the same rows Today shows). Then the hours table, which
 * belongs to the time work and is only given a home here: it shows the
 * measured hours beside the recounted estimate and the frozen old estimate.
 * Then activity since the start, the card that used to sit on the Researcher
 * Dashboard.
 */
export const dynamic = "force-dynamic";

const heading = "font-mono text-xs uppercase tracking-widest text-text-muted";

async function WeekBlock({ week, speech }: { week: Week; speech: boolean }) {
  const people = await loadPeople(prisma, week, {
    speech,
    queuePrompts: loadQueueInputs().then((q) => q.queuePrompts),
  });
  const rows = weekRows(people);
  return (
    <WeekWorkTable rows={rows} totals={weekTotals(rows)} speech={speech} />
  );
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams?: Promise<{ w?: string }>;
}) {
  await requireResearcherPage();
  const sp = (await searchParams) ?? {};
  // Weeks back from this one: 0 is this week, 1 is last week. Never forward.
  const back = Math.min(Math.max(parseInt(sp.w ?? "0", 10) || 0, 0), 520);
  const week = weekOf(new Date(), -back);
  const speech = speechLabEnabled();
  const step =
    "rounded border border-border px-2.5 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-sunken";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">People</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Who worked, for how many hours, and who is running out of prompts.
        </p>
      </div>

      <div className="space-y-10">
        <section aria-labelledby="people-week">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="people-week" className={heading}>
              {week.label}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/people?w=${back + 1}`}
                className={step}
                aria-label="The week before"
              >
                &larr;
              </Link>
              {back > 0 && (
                <Link
                  href={
                    back === 1 ? "/admin/people" : `/admin/people?w=${back - 1}`
                  }
                  className={step}
                  aria-label="The week after"
                >
                  &rarr;
                </Link>
              )}
            </div>
          </div>
          <p className="mb-3 mt-1 text-sm text-text-tertiary">
            Monday to Sunday, Lagos time. Demo sessions are left out. Click a
            name to open that person&apos;s answers in Data.
          </p>
          <Suspense
            fallback={
              <div className="h-32 animate-pulse rounded-lg bg-surface-sunken" />
            }
          >
            <WeekBlock week={week} speech={speech} />
          </Suspense>
        </section>

        <section aria-labelledby="people-hours">
          <h2 id="people-hours" className={heading}>
            Hours
          </h2>
          <div className="mt-3">
            <TimeSpent />
          </div>
        </section>

        <section aria-labelledby="people-activity">
          <h2 id="people-activity" className={heading}>
            Since the start
          </h2>
          <div className="mt-3">
            <AnnotatorActivity />
          </div>
        </section>
      </div>
    </div>
  );
}
