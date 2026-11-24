import { HelpButton } from "@/components/help-button";
import { WorkFlow } from "@/components/work/work-flow";

/**
 * Annotate: the one place for all of a person's work (decided on the
 * 2026-11-24 call). Recording, checking clips, tone marks, writing and
 * comparing answers, and listening are tabs inside this page, in the order
 * the leads set (lib/work-flow.ts), never separate sidebar lines.
 */
export default function AnnotatePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Annotate</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        All your work in one place. The most needed work opens first; the tabs
        show what else is waiting.
      </p>
      <div className="mt-6">
        <WorkFlow />
      </div>
      <HelpButton
        title="Annotate"
        description="Everything you do lives here, as tabs at the top of the page. Record: read your own answer out loud, then a short English translation, one step at a time. Check: listen to someone else's clip and say whether it matches what they wrote. Tone marks: add the tone marks to an answer, and change nothing else. Write & compare: first write how YOU would say it, then compare two AI attempts, pick the better one, tag why the loser lost, and fix the one you chose or tap 'Nothing to correct'. Listen: pick the voice that sounds more like a real Igala speaker. When one kind of work runs out, the page offers the next."
      />
    </div>
  );
}
