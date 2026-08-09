import { AutoEval } from "@/components/arena/auto-eval";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

/**
 * The AUTOMATIC eval surface. Kept separate from the human leaderboard on
 * purpose: the leaderboard reports what native speakers judged, this page
 * reports what a character-overlap metric and a language classifier can guess.
 * One is evidence about quality; the other is a fast proxy whose reliability is
 * itself measured on this page.
 */
export default function ArenaEvalPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Automatic eval
          <InfoTip label="About the automatic eval" width="w-96">
            Human blind judgment is the ground truth for Igala quality, but it
            is slow: after 781 comparisons only a handful name a winner. This
            page gives a fast, defensible signal in the meantime by scoring
            every candidate&apos;s answers on the frozen prompts against the
            community gold, and it publishes its own error bars, its own
            ceiling, and its own measured agreement with the human labels we do
            hold.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          Character n-gram similarity to community gold, a language-identity
          gate, and the inter-gold ceiling that bounds both. Recomputed on
          demand; the same numbers are available from the command line with{" "}
          <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-xs">
            npx tsx --env-file=.env.local scripts/run-eval.ts
          </code>
          .
        </p>
      </div>

      <AutoEval />

      <HelpButton
        title="Automatic eval"
        description="Every candidate's answers on the frozen prompt bank, scored against the community gold with chrF (character n-gram F-score, the standard for low-resource machine translation), diacritic-aware match rates, and token edit similarity. Each figure carries its n and a bootstrap 95% interval, and every table shows the inter-gold ceiling: how well native speakers match each other under the same metric. That ceiling, not 100%, is the limit. Head-to-head comparisons are paired by prompt and print 'not distinguishable' whenever the interval crosses zero. The language-identity gate estimates whether an output is Igala at all; its Igala-vs-English accuracy is cross-validated and reported, while its Yoruba, Igbo and Pidgin verdicts come from small hardcoded seed lexicons with no validation data and are triage flags only. No number on this page measures Igala fluency: only a speaker can do that."
      />
    </div>
  );
}
