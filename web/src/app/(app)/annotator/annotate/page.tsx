import { AnnotationInterface } from "@/components/annotation-interface";
import { HelpButton } from "@/components/help-button";

export default function AnnotatePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Annotate</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Compare two AI answers, tag why the loser fails, and fix the one you
        chose - every episode teaches the AI a rule, not just a verdict.
      </p>
      <div className="mt-6">
        <AnnotationInterface />
      </div>
      <HelpButton
        title="Annotate"
        description="Each round has one flow, on one page: first write how YOU would say it (your gold answer), then compare two AI attempts and pick the better one. Right after your pick, two things are required: tap at least one tag under the losing output saying why it lost (for example: this is Yoruba), and then either fix the answer you chose - your changes appear as suggestions, like Google Docs - or tap 'Nothing to correct'. When you do make fixes, a short English explanation of why is required too: the reason is what teaches the AI the rule, not just the fix. If both answers are inadequate, tag both, explain why, and write the correct version yourself."
      />
    </div>
  );
}
