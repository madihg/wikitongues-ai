import { prisma } from "@/lib/prisma";
import { computeAnnotationInsights } from "@/lib/annotation-insights";
import { computeMethodMetrics } from "@/lib/method-metrics";
import { BenchmarkBars } from "@/components/arena/benchmark-bars";
import { ByCategory } from "@/components/arena/by-category";

/**
 * The two data-loading blocks of the Benchmark tab, as async server
 * components. Each sits behind its own Suspense boundary on the page, and the
 * page checks the researcher before it renders either. Kept out of the page
 * file so a test can await them directly.
 */

/** The full scoreboard. One computeMethodMetrics call. */
export async function AgreementSection() {
  const metrics = await computeMethodMetrics(prisma);
  return (
    <BenchmarkBars
      candidates={metrics.candidates}
      ceilingChrf={metrics.agreementCeilingChrf}
      leakFreePrompts={metrics.benchmark.leakFreePrompts}
      // The whole field, on one screen, so it can be captured in one image.
      topN={Math.max(metrics.candidates.length, 1)}
    />
  );
}

/** The rubric arena block. One computeAnnotationInsights call, only when open. */
export async function CategorySection() {
  const insights = await computeAnnotationInsights(prisma);
  return <ByCategory corpus={insights.corpus} />;
}
