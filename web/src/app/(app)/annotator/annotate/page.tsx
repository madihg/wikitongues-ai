import { HelpButton } from "@/components/help-button";
import { WorkFlow } from "@/components/work/work-flow";

/**
 * Annotate: the one place for all of a person's work (decided on the
 * 2026-11-24 call). Recording, checking clips, tone marks, writing and
 * comparing answers, and listening come one task at a time, mixed in the
 * runs the leads set (lib/work-flow.ts), with a filter to stick to one
 * kind. Never separate sidebar lines.
 */
export default function AnnotatePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Annotate</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        All your work in one place, one task at a time. Pick a kind above the
        work to stay on it.
      </p>
      <div className="mt-6">
        <WorkFlow />
      </div>
      <HelpButton
        title="Annotate"
        description="Everything you do lives here, one task at a time. All mixes the kinds of work: a few recordings, then a few clips to check, then text, and round again. Tap one kind at the top to stay on it, or All to mix again. Record: read your own answer out loud, then a short English translation, one step at a time. Check: listen to someone else's clip and say whether it matches what they wrote. Tone marks: add the tone marks to an answer, and change nothing else. Write & compare: first write how YOU would say it, then compare two AI attempts, pick the better one, tag why the loser lost, and fix the one you chose or tap 'Nothing to correct'. Listen: pick the voice that sounds more like a real Igala speaker. When one kind of work runs out, the page moves on to the next."
      />
    </div>
  );
}
