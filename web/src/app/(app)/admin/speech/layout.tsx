import { ViewTabs } from "@/components/admin/view-tabs";
import { SPEECH_MODEL_TABS } from "@/lib/admin/routes";

/**
 * The Speech model view: is the speech model getting better? Three tabs.
 * Measure is the view's own page. Loop holds the six cards of the nightly
 * run that used to be this address's whole page. Rights is the register of
 * outside audio. Each page checks the lab flag and the researcher itself.
 */
export default function SpeechModelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ViewTabs tabs={SPEECH_MODEL_TABS} label="Speech model sections" />
      {children}
    </div>
  );
}
