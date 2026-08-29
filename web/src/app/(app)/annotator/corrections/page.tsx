import { CorrectionsInterface } from "@/components/corrections-interface";
import { HelpButton } from "@/components/help-button";
import { RoleGuard } from "@/components/role-guard";

// 2026-08-28 rework (Halim's call): annotators no longer have a standalone
// Corrections tab - corrections happen inside the episode, right after the
// A/B verdict. This page stays as the RESEARCHER view of the backlog lane
// (already-judged outputs still waiting for a fix); an annotator who follows
// an old link lands in the annotate flow, where their corrections now live.
// The API routes (/api/edits/*) and all stored edits are untouched.
export default function CorrectionsPage() {
  return (
    <RoleGuard allowedRoles={["RESEARCHER"]} fallback="/annotator/annotate">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Corrections
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">
          The correction backlog: AI answers already judged, still waiting for a
          fix. Annotators now make these corrections inside Annotate, right
          after each verdict - this researcher lane remains for working through
          older judgments.
        </p>
        <div className="mt-6">
          <CorrectionsInterface />
        </div>
        <HelpButton
          title="Corrections"
          description="This researcher lane shows one AI answer you already judged during Annotate. Fix it directly in the text box - your changes appear as suggestions (crossed out and highlighted), the way Google Docs shows edits. Every change has two parts: the correct Igala, and the reason why. Annotators no longer see this tab: for them the same correction step now happens inside each Annotate episode, right after they pick a winner. Use Skip if an answer needs no fixing."
        />
      </div>
    </RoleGuard>
  );
}
