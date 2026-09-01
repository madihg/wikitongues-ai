import { prisma } from "@/lib/prisma";
import { computeAnnotationInsights } from "@/lib/annotation-insights";
import { SpeakersVerdict } from "@/components/arena/speakers-verdict";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

/** Every number on this page is computed from the database per request - the
 * house rule: no hardcoded counts or scores anywhere in the UI. */
export const dynamic = "force-dynamic";

export default async function VerdictPage() {
  const insights = await computeAnnotationInsights(prisma);

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          The Speakers&apos; Verdict
          <InfoTip label="About this view" width="w-80">
            Native Igala speakers judge pairs of answers blind - they never know
            which system wrote which. This view aggregates those verdicts: who
            wins when a speaker prefers one answer, what is wrong with the
            answers they reject, and how often both answers are still
            inadequate. Every number is computed live from the annotation
            records; demo sessions and test accounts are excluded.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          What Igala speakers actually decide when they compare two answers
          without knowing which system wrote them - the wins, the reasons
          answers lose, and the failures no system has solved yet.
        </p>
      </div>

      <SpeakersVerdict insights={insights} />

      <HelpButton
        title="The Speakers' Verdict"
        description="Every judgment here comes from a native Igala speaker comparing two answers blind. The headline counts matchups between the systems currently in the pairing pool. Head to head splits each pairing's matchups by outcome. 'Why answers lose' aggregates the failure tags speakers attach to answers they reject. The honesty chart tracks how often BOTH answers were rejected, week by week. Recent verdicts show full matchups with the speaker's own written explanation - attributed to 'a speaker', never by name. Demo sessions and test accounts are excluded everywhere, and no number on this page is hardcoded."
      />
    </div>
  );
}
