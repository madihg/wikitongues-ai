import { AnnotationsReview } from "@/components/admin/annotations-review";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";
import { isAnnotationType } from "@/lib/annotations-query";

/**
 * Researcher annotation-review surface. Lives under the admin layout, so the
 * RoleGuard already restricts it to RESEARCHER.
 *
 * Deep-link contract (other pages link in via these exact param names):
 *   ?annotator=<userId>   pre-select that annotator in the filter
 *   ?type=pairwise|cold|edit   pre-select that event type
 * Both flow to the client component as initial filter state.
 */
export default async function AnnotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ annotator?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const initialAnnotator =
    typeof sp.annotator === "string" && sp.annotator.length > 0
      ? sp.annotator
      : "";
  const initialType = isAnnotationType(sp.type) ? sp.type : "";

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          Annotations
          <InfoTip width="w-80">
            Every annotation event, newest first — pairwise picks, cold-authored
            answers, and inline edits. Filter by annotator, type, or prompt
            category, then open a row to read the full submission. Cold answers
            and edits can be corrected and marked expert-reviewed; pairwise
            picks are read-only.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-tertiary">
          Individual annotator submissions. Demo-session activity is hidden by
          default.
        </p>
      </div>

      <AnnotationsReview
        initialAnnotator={initialAnnotator}
        initialType={initialType}
      />

      <HelpButton
        title="Annotations"
        description="This screen lists every annotation event submitted by your annotators, newest first: pairwise comparisons, cold-authored gold answers, and inline edits of model outputs. Use the filter bar to narrow by annotator, event type, or prompt category, and toggle demo-session activity in or out (off by default). Click any row to open the detail panel with the full submission — for a pairwise pick that includes both model outputs, the winner, the rubric scores, and any related edit or cold answer from the same annotator. You can correct a cold answer's text or an edit's corrected text inline, and mark either expert-reviewed. Pairwise judgments are read-only to preserve methodological integrity."
      />
    </div>
  );
}
