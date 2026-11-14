import { AgreementStats } from "@/components/admin/agreement-stats";
import { ContestedItems } from "@/components/arena/contested-items";
import { requireResearcherPage } from "@/lib/admin/page-gate";

/**
 * Data, Disagreements: first whether annotators apply the rubric alike, then
 * the places where two speakers chose or wrote differently, then the
 * corrections waiting for a second reader. The same three components as
 * before (the Inter-Annotator Agreement card of the old dashboard and the
 * Collective review page), in the order a reader needs them.
 */
export default async function DisagreementsPage() {
  await requireResearcherPage();
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Disagreements</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          The places where we do not agree with each other, and the corrections
          waiting for a second pair of eyes. There are two kinds of disagreement
          on this page and they are not the same thing: one is about which model
          answered better, the other is about how we ourselves write Igala. The
          second one is where the work is.
        </p>
      </div>
      <div className="space-y-10">
        <AgreementStats />
        <ContestedItems />
      </div>
    </div>
  );
}
