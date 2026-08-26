import { CorrectionsInterface } from "@/components/corrections-interface";
import { HelpButton } from "@/components/help-button";

// The researcher demo path (?demo=) deliberately does not reach this lane in
// v1 - the walkthrough happens on the first-run onboarding cards themselves.
export default function CorrectionsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Corrections</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Fix AI answers you already judged - like marking homework. Your changes
        appear as suggestions, each with a reason.
      </p>
      <div className="mt-6">
        <CorrectionsInterface />
      </div>
      <HelpButton
        title="Corrections"
        description="This screen shows one AI answer you already judged during Annotate. Fix it directly in the text box - your changes appear as suggestions (crossed out and highlighted), the way Google Docs shows edits. Every change has two parts: the correct Igala, and a short reason why (a tap on a chip, or a few words in English or Igala). Reasons are highly encouraged but never required - they are what teaches the AI the rule, not just the fix. Use Skip if an answer needs no fixing."
      />
    </div>
  );
}
