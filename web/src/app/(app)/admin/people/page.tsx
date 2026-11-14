import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireLeadPage } from "@/lib/admin/page-gate";
import { loadPeople } from "@/lib/admin/people-data";
import { recentlyActive } from "@/lib/admin/today";
import { weekOf } from "@/lib/admin/week";
import { speechLabEnabled } from "@/lib/lab-flags";
import { loadQueueInputs } from "@/lib/queue-input";
import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { PromptsLeftTable } from "@/components/admin/prompts-left-table";
import { TimeSpent } from "@/components/admin/time-spent";

/**
 * People: who worked, for how many hours, and who is running out of prompts.
 *
 * Research leads only (the owner and RESEARCH_LEADS): this is pay and people
 * data. Another researcher gets the forbidden page and nothing is read.
 *
 * Three blocks. Prompts left, the one thing no other table has: what the
 * Annotate page would still serve each person, fewest first. Then the hours
 * table, which belongs to the time work and is only given a home here: the
 * week's hours (measured, recounted, and the frozen old estimate) with
 * submissions, edits and recordings, week by week, and its CSV. Then
 * activity since the start.
 */
export const dynamic = "force-dynamic";

const heading = "font-mono text-xs uppercase tracking-widest text-text-muted";

async function PromptsLeftBlock() {
  const now = new Date();
  const people = await loadPeople(prisma, weekOf(now), {
    speech: speechLabEnabled(),
    queuePrompts: loadQueueInputs().then((q) => q.queuePrompts),
  });
  // The working team: anyone with work on record in the last 30 days.
  return <PromptsLeftTable people={recentlyActive(people, now)} />;
}

export default async function PeoplePage() {
  await requireLeadPage();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">People</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Who worked, for how many hours, and who is running out of prompts.
        </p>
      </div>

      <div className="space-y-10">
        <section aria-labelledby="people-prompts">
          <h2 id="people-prompts" className={heading}>
            Prompts left
          </h2>
          <p className="mb-3 mt-1 text-sm text-text-tertiary">
            Questions each person can still be given on the Annotate page,
            fewest first. Everyone who worked in the last 30 days. Click a name
            to open that person&apos;s answers in Data.
          </p>
          <Suspense
            fallback={
              <div className="h-32 max-w-xl animate-pulse rounded-lg bg-surface-sunken" />
            }
          >
            <PromptsLeftBlock />
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
