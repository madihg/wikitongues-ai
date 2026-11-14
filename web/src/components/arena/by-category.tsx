import { RubricArenaTable } from "@/components/arena/rubric-arena-table";
import { share } from "@/components/arena/signal-copy";
import type { CorpusSplit } from "@/lib/annotation-insights";

/**
 * "By category": the rubric arena table and its reading guide, exactly as the
 * Model Arena overview carried them (sections three and four of that page),
 * now the last block of the Benchmark tab. Every count in the prose comes
 * from the corpus split the caller computed from the database; nothing is
 * typed in.
 */
export function ByCategory({ corpus }: { corpus: CorpusSplit }) {
  const hasLegacy = corpus.legacyComparisons > 0;

  return (
    <div className="space-y-10">
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
          every blind comparison recorded outside demo sessions, including every
          arm the project has since retired;{" "}
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
              {share(corpus.legacyDecided, corpus.legacyComparisons)}) among the
              retired arms. The table below defaults to the window that opens at
              the annotation pivot for exactly that reason. That window is dated
              rather than membership-based, so it also holds the matchups
              against a retired arm recorded after the pivot and its own count
              runs a little above the pool number quoted here; both are drawn
              from the same comparisons, minus demo sessions and test accounts.
              It only gives a candidate a row once that candidate has enough
              decided votes inside the window to fit anything at all. Everything
              below that line is listed with its count, and all time is one
              click away.
            </>
          ) : (
            <>
              {" "}
              Every comparison recorded so far is between current pool arms, so
              the two numbers agree.
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
            Every cell is an <strong>arena strength on a 0 to 100 scale</strong>
            , fitted with Bradley-Terry from human blind pairwise votes and
            nothing else. <span className="font-mono">50</span> means no
            evidence either way, not a score of 50 percent.{" "}
            <span className="font-mono">ns</span> means not statistically
            distinguishable at this sample size, and{" "}
            <span className="font-mono">-</span> means no votes in that category
            yet. A model only moves away from 50 when a native speaker picks its
            answer over another model&apos;s.
          </p>
          <p>
            Spread {corpus.allDecided.toLocaleString()} decided winners across
            every candidate and every rubric category and most cells have
            nothing in them, which is why the table sits below the verdict
            rather than above it, why its window starts at the annotation pivot,
            and why a candidate needs a minimum of decided votes inside that
            window before it gets a row. A candidate under that minimum is
            listed with its count instead: absence of evidence is shown as
            absence, never as a tie. What changes it is decided winners
            accumulating on the frozen benchmark prompts, whose community gold
            never enters any training set.
          </p>
          <p>
            No model grades the Igala here. A model that cannot speak Igala
            cannot judge it, so there is no LLM-as-judge score anywhere on this
            page. Automatic metrics (chrF, language identity, diacritic checks)
            are triage and gating only. Native human judgment decides.
          </p>
        </div>
      </section>
    </div>
  );
}
