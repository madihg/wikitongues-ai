import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeAnnotationInsights } from "@/lib/annotation-insights";
import { computeMethodMetrics } from "@/lib/method-metrics";
import { loadSpeechMeasure } from "@/lib/admin/measure/data";
import { speechHeadline } from "@/lib/admin/measure/headline";
import { benchmarkLeader } from "@/lib/admin/today";
import type { TodayWork } from "@/lib/admin/today-data";
import { NeedsYou } from "@/components/admin/needs-you";
import {
  AgreementTile,
  HoldingsLine,
  SpeechTile,
  VerdictTile,
} from "@/components/admin/today-tiles";
import { WeekWorkTable } from "@/components/admin/week-work-table";

/**
 * The blocks of Today as async server components. The page checks the
 * researcher first, then starts the two loads once and hands each block the
 * promise it needs, so a block paints as soon as its own data is in and no
 * query runs twice. Nothing here fetches from the browser.
 */

const heading = "font-mono text-xs uppercase tracking-widest text-text-muted";

export async function NeedsYouBlock({ work }: { work: Promise<TodayWork> }) {
  return <NeedsYou lines={(await work).needs} />;
}

/**
 * The models. One call to computeAnnotationInsights, one to
 * computeMethodMetrics, and the speech measures when speech is on.
 */
export async function ModelsBlock({ speech }: { speech: boolean }) {
  const [insights, metrics, measure] = await Promise.all([
    computeAnnotationInsights(prisma),
    computeMethodMetrics(prisma),
    speech ? loadSpeechMeasure(prisma) : null,
  ]);
  return (
    <section aria-labelledby="the-models">
      <h2 id="the-models" className={heading}>
        The models
      </h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <VerdictTile headline={insights.headline} />
        <AgreementTile leader={benchmarkLeader(metrics.candidates)} />
        <SpeechTile headline={measure ? speechHeadline(measure) : null} />
      </div>
    </section>
  );
}

export async function WeekWorkBlock({
  work,
  speech,
  thisWeek,
}: {
  work: Promise<TodayWork>;
  speech: boolean;
  thisWeek: boolean;
}) {
  const { rows, totals } = await work;
  return (
    <section aria-labelledby="week-work">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="week-work" className={heading}>
          {thisWeek ? "This week's work" : "That week's work"}
        </h2>
        <Link
          href="/admin/people"
          className="text-sm font-medium text-accent-text"
        >
          Hours, all weeks and CSV
        </Link>
      </div>
      <div className="mt-3">
        <WeekWorkTable rows={rows} totals={totals} speech={speech} />
      </div>
    </section>
  );
}

export async function HoldingsBlock({
  work,
  thisWeek,
}: {
  work: Promise<TodayWork>;
  thisWeek: boolean;
}) {
  return (
    <section aria-labelledby="what-we-hold">
      <h2 id="what-we-hold" className={heading}>
        What we hold
      </h2>
      <div className="mt-3">
        <HoldingsLine
          holdings={(await work).holdings}
          period={thisWeek ? "this week" : "that week"}
        />
      </div>
    </section>
  );
}
