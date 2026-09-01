import Link from "next/link";
// The rubric arena matrix now lives in its own component (a sibling workflow
// moved it out of bucket-matrix.tsx). It is section three here, and it owns no
// page-level copy: the reading guide below the table is this page's.
import { RubricArenaTable } from "@/components/arena/rubric-arena-table";
import { BenchmarkBars } from "@/components/arena/benchmark-bars";
import {
  InadequacyStrip,
  PairingSplitBar,
  VerdictHeadlineCard,
} from "@/components/arena/speakers-verdict";
import { share } from "@/components/arena/signal-copy";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";
import { prisma } from "@/lib/prisma";
import { computeAnnotationInsights } from "@/lib/annotation-insights";
import { computeMethodMetrics } from "@/lib/method-metrics";

/**
 * The Model Arena Overview.
 *
 * Order is the argument. This page used to lead with the Bradley-Terry
 * candidate-by-category table fitted over ALL history, where nearly every cell
 * reads 50 (no evidence) or a dash, because the all-time corpus is dominated
 * by matchups between arms the project has since retired - the era when
 * speakers rejected both answers almost every time. So the page opened by
 * apologizing for its own headline number.
 *
 * It now leads with evidence that exists:
 *   1. the speakers' verdict on the systems running today,
 *   2. the Community Agreement Score scoreboard, named as the machine proxy
 *      it is,
 *   3. the rubric arena table, demoted below both,
 *   4. a short reading guide, under the data rather than above it.
 *
 * Every number is computed from the database per request - the house rule: no
 * hardcoded counts or scores anywhere in the UI.
 */
export const dynamic = "force-dynamic";

export default async function ArenaPage() {
  const [insights, metrics] = await Promise.all([
    computeAnnotationInsights(prisma),
    computeMethodMetrics(prisma),
  ]);
  const { corpus, headline } = insights;
  const currentPool = insights.pairings.find((p) => p.isCurrentPool) ?? null;
  const hasLegacy = corpus.legacyComparisons > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Model Arena
          <InfoTip label="About the arena" width="w-80">
            Candidate model variants that differ by exactly one rung are put in
            front of native Igala speakers on the frozen benchmark. This page
            reads top to bottom in order of how much the evidence supports: what
            speakers decided about the systems running today, then a
            character-overlap proxy for resemblance to community writing, then
            the per-category Bradley-Terry table fitted over all history. No
            model judges the Igala at any point.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Register model variants that differ by exactly one rung - a closed
          baseline, the same base with retrieval, a fine-tuned variant - and put
          them in front of native speakers on the frozen Igala benchmark, one
          prompt category at a time. The method ladder is benchmark first, then
          SFT to teach the missing language, then DPO as the finisher. The
          rung-by-rung deltas are the experiment.
        </p>
      </div>

      <div className="space-y-10">
        {/* ── 1. the verdict: the lede ──────────────────────────────────── */}
        <section aria-labelledby="verdict-lede">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="verdict-lede"
              className="text-base font-semibold text-text-primary"
            >
              What the speakers decided
            </h2>
            <Link
              href="/admin/arena/verdict"
              className="text-sm font-medium text-accent-text"
            >
              The full Speakers&apos; Verdict &rarr;
            </Link>
          </div>

          <VerdictHeadlineCard headline={headline} />

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary">
                The current pairing
              </h3>
              <p className="mb-4 mt-1 text-sm text-text-tertiary">
                The two systems speakers are comparing right now, split by
                outcome. Membership is a live database flag, not a name list.
              </p>
              {currentPool ? (
                <PairingSplitBar p={currentPool} />
              ) : (
                <p className="text-sm text-text-tertiary">
                  No pairing between current pool arms has enough decided
                  matchups to draw yet. It appears as soon as speakers start
                  preferring one answer over the other.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary">
                Both answers rejected, and where that rate is going
              </h3>
              <p className="mb-4 mt-1 text-sm text-text-tertiary">
                {hasLegacy ? (
                  <>
                    Speakers rejected both answers in{" "}
                    <strong className="text-text-secondary">
                      {share(
                        corpus.legacyBothInadequate,
                        corpus.legacyComparisons,
                      )}
                    </strong>{" "}
                    of the {corpus.legacyComparisons} matchups involving an arm
                    since retired. Among the {corpus.poolComparisons} matchups
                    between the current pool arms it is{" "}
                    <strong className="text-text-secondary">
                      {share(corpus.poolBothInadequate, corpus.poolComparisons)}
                    </strong>
                    . Progress here means the bars falling, and they have
                    further to fall.
                  </>
                ) : (
                  <>
                    Speakers rejected both answers in{" "}
                    <strong className="text-text-secondary">
                      {share(corpus.allBothInadequate, corpus.allComparisons)}
                    </strong>{" "}
                    of the {corpus.allComparisons} matchups recorded so far.
                    Progress here means the bars falling.
                  </>
                )}
              </p>
              <InadequacyStrip weekly={insights.weekly} />
            </div>
          </div>
        </section>

        {/* ── 2. the agreement scoreboard ───────────────────────────────── */}
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
            <Link
              href="/admin/arena/eval"
              className="text-sm font-medium text-accent-text"
            >
              The full Automatic eval tab &rarr;
            </Link>
          </div>
          <p className="mb-3 max-w-3xl text-sm text-text-secondary">
            This scoreboard is a machine proxy for how closely a system&apos;s
            writing resembles the community&apos;s; the verdict above is human
            judgment of whether the answer is any good. Where the two disagree,
            the humans win.
          </p>
          <BenchmarkBars
            candidates={metrics.candidates}
            ceilingChrf={metrics.agreementCeilingChrf}
            leakFreePrompts={metrics.benchmark.leakFreePrompts}
            topN={5}
          />
        </section>

        {/* ── 3. the rubric arena table, demoted ────────────────────────── */}
        <section aria-labelledby="rubric-arena">
          <h2
            id="rubric-arena"
            className="text-base font-semibold text-text-primary"
          >
            The rubric arena, category by category
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-text-secondary">
            Bradley-Terry strengths per rubric category, from blind human votes
            and nothing else. {corpus.allComparisons.toLocaleString()} counts
            every blind comparison recorded outside demo sessions, including
            every arm the project has since retired;{" "}
            {corpus.poolComparisons.toLocaleString()} counts only the matchups
            between two systems currently in the pairing pool.
            {hasLegacy ? (
              <>
                {" "}
                The pool number is the one that carries the signal:{" "}
                {corpus.poolDecided.toLocaleString()} of its{" "}
                {corpus.poolComparisons.toLocaleString()} matchups produced a
                decided winner (
                {share(corpus.poolDecided, corpus.poolComparisons)}), against{" "}
                {corpus.legacyDecided.toLocaleString()} of{" "}
                {corpus.legacyComparisons.toLocaleString()} (
                {share(corpus.legacyDecided, corpus.legacyComparisons)}) among
                the retired arms. The table below defaults to the window that
                opens at the annotation pivot for exactly that reason. That
                window is dated rather than membership-based, so it also holds
                the matchups against a retired arm recorded after the pivot and
                its own count runs a little above the pool number quoted here;
                both are drawn from the same comparisons, minus demo sessions
                and test accounts. It only gives a candidate a row once that
                candidate has enough decided votes inside the window to fit
                anything at all. Everything below that line is listed with its
                count, and all time is one click away.
              </>
            ) : (
              <>
                {" "}
                Every comparison recorded so far is between current pool arms,
                so the two numbers agree.
              </>
            )}
          </p>

          <RubricArenaTable />
        </section>

        {/* ── 4. how to read it, under the data ─────────────────────────── */}
        <section
          aria-labelledby="reading-guide"
          className="rounded-lg border border-border bg-surface-sunken p-5"
        >
          <h2
            id="reading-guide"
            className="text-sm font-semibold text-text-primary"
          >
            How to read the table above
          </h2>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-text-secondary">
            <p>
              Every cell is an{" "}
              <strong>arena strength on a 0 to 100 scale</strong>, fitted with
              Bradley-Terry from human blind pairwise votes and nothing else.{" "}
              <span className="font-mono">50</span> means no evidence either
              way, not a score of 50 percent.{" "}
              <span className="font-mono">ns</span> means not statistically
              distinguishable at this sample size, and{" "}
              <span className="font-mono">-</span> means no votes in that
              category yet. A model only moves away from 50 when a native
              speaker picks its answer over another model&apos;s.
            </p>
            <p>
              Spread {corpus.allDecided.toLocaleString()} decided winners across
              every candidate and every rubric category and most cells have
              nothing in them, which is why the table sits below the verdict
              rather than above it, why its window starts at the annotation
              pivot, and why a candidate needs a minimum of decided votes inside
              that window before it gets a row. A candidate under that minimum
              is listed with its count instead: absence of evidence is shown as
              absence, never as a tie. What changes it is decided winners
              accumulating on the frozen benchmark prompts, whose community gold
              never enters any training set.
            </p>
            <p>
              No model grades the Igala here. A model that cannot speak Igala
              cannot judge it, so there is no LLM-as-judge score anywhere on
              this page. Automatic metrics (chrF, language identity, diacritic
              checks) are triage and gating only. Native human judgment decides.
            </p>
          </div>
        </section>
      </div>

      <HelpButton
        title="Model Arena"
        description="The Overview leads with what native speakers decided in blind matchups between the systems currently in the pairing pool, because that is where the evidence is. Below it, the Community Agreement Score is a character-overlap proxy for how closely a system's writing resembles the community's - a machine measure, not a quality verdict; where it disagrees with the speakers, the speakers win. The candidate-by-category Bradley-Terry table sits third. Its window defaults to the era that opens at the annotation pivot - derived from the first comparison involving a system in today's pairing pool, not a date typed into the interface - because the era before it is most of the input and almost none of the decided votes; all time is one click away. A candidate earns a row only once it has enough decided votes inside the selected window, and anything below that line is listed with its count rather than dropped. 50 means no evidence either way, 'ns' means not distinguishable at this sample size, and '-' means no votes in that category. Every count and score on this page is computed from the database per request; demo sessions and test accounts are excluded everywhere. No model grades the Igala at any point."
      />
    </div>
  );
}
