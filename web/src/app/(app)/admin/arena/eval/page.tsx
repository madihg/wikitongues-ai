import { Suspense } from "react";
import Link from "next/link";
import { requireResearcherPage } from "@/lib/admin/page-gate";
import { PUBLIC_HOW_IT_WORKS_URL } from "@/lib/personas";
import { AutoEval } from "@/components/arena/auto-eval";
import {
  AgreementSection,
  CategorySection,
} from "@/components/arena/benchmark-sections";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

/**
 * The Benchmark tab: every automatic number about the text model, in one
 * place, in order of how often it is quoted.
 *
 *   1. The Community Agreement Score for every model (the bars that used to
 *      head the Researcher Dashboard and, cut to five, the Arena overview).
 *   2. The automatic eval behind it, unchanged.
 *   3. "By category": the rubric arena table and its reading guide, closed
 *      until asked for. Closed means not computed: the block is rendered only
 *      for ?open=category, so a reader who came for the bars never pays for
 *      the vote-by-vote fit.
 *
 * The page itself awaits nothing but the gate. Each block loads behind its
 * own Suspense boundary, so the heading and the tab bar paint at once, as the
 * Automatic eval page always did.
 */
export const dynamic = "force-dynamic";

const Skeleton = ({ rows }: { rows: number }) => (
  <div className="space-y-2" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className="h-10 animate-pulse rounded-md bg-surface-sunken"
        style={{ animationDelay: `${i * 80}ms` }}
      />
    ))}
  </div>
);

export default async function BenchmarkPage({
  searchParams,
}: {
  searchParams?: Promise<{ open?: string }>;
}) {
  await requireResearcherPage();
  const sp = (await searchParams) ?? {};
  const categoryOpen = sp.open === "category";

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Benchmark
          <InfoTip label="About the benchmark" width="w-96">
            What a machine can measure about the text model without a speaker in
            the room. Three blocks: how close each model writes to the
            community, the automatic checks behind that score, and strength per
            rubric category from the blind votes. None of it says whether an
            answer is good Igala. The Verdict tab does that.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          The numbers a machine can compute. Where they disagree with the
          speakers, the speakers win.
        </p>
      </div>

      <div className="space-y-12">
        {/* ── 1. the agreement scoreboard, every model ───────────────── */}
        <section aria-labelledby="agreement-scoreboard">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="agreement-scoreboard"
              className="flex items-center gap-2 text-base font-semibold text-text-primary"
            >
              Community Agreement Score
              <InfoTip width="w-80">
                Leak-free stripped chrF rescaled so that 100 marks how closely
                one native speaker agrees with another on the same frozen
                questions. Computed live per request; never capped at 100.
              </InfoTip>
            </h2>
            <a
              href={PUBLIC_HOW_IT_WORKS_URL}
              className="text-sm font-medium text-accent-text"
            >
              How this score works &rarr;
            </a>
          </div>
          <p className="mb-3 max-w-3xl text-sm text-text-secondary">
            This scoreboard is a machine proxy for how closely a system&apos;s
            writing resembles the community&apos;s; the verdict is human
            judgment of whether the answer is any good. Where the two disagree,
            the humans win. Each model is listed with its approach, so a bare
            model and the same model with the method can be read side by side.
          </p>
          <Suspense fallback={<Skeleton rows={6} />}>
            <AgreementSection />
          </Suspense>
        </section>

        {/* ── 2. the automatic eval, as it was ───────────────────────── */}
        <section aria-labelledby="automatic-eval">
          <h2
            id="automatic-eval"
            className="flex items-center gap-2 text-base font-semibold text-text-primary"
          >
            Automatic eval
            <InfoTip label="About the automatic eval" width="w-96">
              Human blind judgment is the ground truth for Igala quality, but it
              is slow: across every comparison collected so far, only a handful
              name a winner. This page gives a fast, defensible signal in the
              meantime by scoring every candidate&apos;s answers on the frozen
              prompts against the community gold, and it publishes its own error
              bars, its own ceiling, and its own measured agreement with the
              human labels we do hold. Every count and score on it is computed
              per request, so nothing here goes stale as the corpus grows.
            </InfoTip>
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-text-secondary">
            Character n-gram similarity to community gold, a language-identity
            gate, and the inter-gold ceiling that bounds both. Recomputed on
            demand; the same numbers are available from the command line with{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              npx tsx --env-file=.env.local scripts/run-eval.ts
            </code>
            .
          </p>
          <AutoEval />
        </section>

        {/* ── 3. by category: closed until asked for ─────────────────── */}
        <section id="by-category" className="scroll-mt-8">
          {categoryOpen ? (
            <div>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-6">
                <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
                  By category
                </span>
                <Link
                  href="/admin/arena/eval#by-category"
                  className="text-sm font-medium text-accent-text"
                >
                  Close
                </Link>
              </div>
              <Suspense fallback={<Skeleton rows={4} />}>
                <CategorySection />
              </Suspense>
            </div>
          ) : (
            <Link
              href="/admin/arena/eval?open=category#by-category"
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-sunken"
            >
              <span>
                <span className="text-sm font-semibold text-text-primary">
                  By category
                </span>
                <span className="ml-3 text-sm text-text-tertiary">
                  Strength per rubric category, from the blind votes, with how
                  to read it.
                </span>
              </span>
              <span className="text-sm font-medium text-accent-text">Open</span>
            </Link>
          )}
        </section>
      </div>

      <HelpButton
        title="Benchmark"
        description="Every candidate's answers on the frozen prompt bank, scored against the community gold with chrF (character n-gram F-score, the standard for low-resource machine translation), diacritic-aware match rates, and token edit similarity. Each figure carries its n and a bootstrap 95% interval, and every table shows the inter-gold ceiling: how well native speakers match each other under the same metric. That ceiling, not 100%, is the limit. Head-to-head comparisons are paired by prompt and print 'not distinguishable' whenever the interval crosses zero. The language-identity gate estimates whether an output is Igala at all; its Igala-vs-English accuracy is cross-validated and reported, while its Yoruba, Igbo and Pidgin verdicts come from small hardcoded seed lexicons with no validation data and are triage flags only. No number on this page measures Igala fluency: only a speaker can do that."
      />
    </div>
  );
}
