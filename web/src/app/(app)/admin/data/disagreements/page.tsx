import { AgreementStats } from "@/components/admin/agreement-stats";
import Link from "next/link";
import { ContestedItems } from "@/components/arena/contested-items";
import { TONE_PASS_HREF } from "@/lib/admin/routes";
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
      <Link
        href={TONE_PASS_HREF}
        className="mb-8 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-sunken"
      >
        <span>
          <span className="text-sm font-semibold text-text-primary">
            Tone marks, pass 2
          </span>
          <span className="ml-3 text-sm text-text-tertiary">
            Where two speakers marked the tones of the same answer, how often
            they agree, and the choice between them.
          </span>
        </span>
        <span className="text-sm font-medium text-accent-text">Open</span>
      </Link>

      <div className="space-y-10">
        <AgreementStats />
        <ContestedItems />
      </div>
    </div>
  );
}
