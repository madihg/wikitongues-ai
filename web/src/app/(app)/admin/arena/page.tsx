import { BucketMatrix } from "@/components/arena/bucket-matrix";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

export default function ArenaPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Model Arena
          <InfoTip label="About the arena" width="w-80">
            The arena compares candidate models{" "}
            <strong>per prompt category</strong> using blind human pairwise
            judgments, converted to <strong>Bradley-Terry</strong> strengths on
            a 0-100 scale. Categories are the ones annotators already work in
            (spelling and tone marks, grammar, vocabulary, register, figurative
            language, cultural knowledge, authenticity). It cannot rank the
            models yet: almost every comparison so far came back &quot;both
            inadequate&quot;, and a ranking needs decided winners. No model
            judges the Igala at any point.
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

      <BucketMatrix />

      <HelpButton
        title="Model Arena"
        description="Candidate models compared per prompt category using blind human pairwise judgments, converted to a 0-100 Bradley-Terry arena strength. 50 means no evidence either way, not a score of 50 percent. The arena cannot rank the models today: almost every comparison so far came back 'both inadequate', so 'ns' cells are reporting an absence of evidence rather than a tie. That changes as decided winners accumulate on the 43 frozen benchmark prompts, whose community gold never enters training. No model grades the Igala here: a model that cannot speak Igala cannot judge it. Automatic metrics (chrF, language identity, diacritic checks) are triage and gating only."
      />
    </div>
  );
}
