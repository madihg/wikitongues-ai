import { isLabResearcher, requireSpeakPage } from "@/lib/speech/page-gate";
import { ListenInterface } from "@/components/lab/listen-interface";
import { DecisionCards } from "@/components/lab/decision-card";
import { MinimalPairMarker } from "@/components/lab/minimal-pair-marker";
import { sessionIsLead } from "@/lib/admin/lead-route";

/**
 * The Listen tab, for every role. A researcher also gets the minimal-pair
 * marker. A research lead also gets the decision cards (which system is
 * ahead). Nobody who only rates sees a system name, a win rate or a count.
 */
export default async function SpeakListenPage() {
  await requireSpeakPage();
  const researcher = await isLabResearcher();
  // The ranking card names the systems and how each is doing. Raters hold
  // the researcher role too, and a rater must not see that while rating, so
  // the card is for research leads only (the owner and RESEARCH_LEADS). Its
  // route refuses anyone else as well.
  const lead = researcher && (await sessionIsLead());
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Listen</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Two voices say the same prompt. Pick the one that sounds better, and say
        why. You do not see who or what made either clip.
      </p>
      <div className="mt-6">
        <ListenInterface />
      </div>
      {researcher && (
        <div className="mt-10 space-y-6">
          {lead && <DecisionCards />}
          <MinimalPairMarker />
        </div>
      )}
    </div>
  );
}
