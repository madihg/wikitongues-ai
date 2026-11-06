import { prisma } from "@/lib/prisma";
import { requireLabPage } from "@/lib/speech/page-gate";
import { loadDashboard } from "@/lib/speech/dashboard-data";
import { InfoTip } from "@/components/info-tip";
import { SpeechAlerts } from "@/components/admin/speech-alerts";
import { SpeechCandidates } from "@/components/admin/speech-candidates";
import { SpeechLedgerCard } from "@/components/admin/speech-ledger-card";
import { SpeechLoopControls } from "@/components/admin/speech-loop-controls";
import { SpeechOvernightCard } from "@/components/admin/speech-overnight-card";
import { SpeechTrend } from "@/components/admin/speech-trend";

/** Computed from the database per request, like the researcher dashboard. */
export const dynamic = "force-dynamic";

export default async function SpeechLoopPage() {
  await requireLabPage();
  const d = await loadDashboard(prisma);

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          Speech loop
          <InfoTip width="w-80">
            The nightly loop for Igala speech: it counts new kept clips,
            retrains when enough have arrived, scores the result on the frozen
            exam set and waits for a person to promote.
          </InfoTip>
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">
          What the loop did last night, what we hold, and how the models are
          doing.
        </p>
      </div>

      <div className="space-y-6">
        <SpeechAlerts alerts={d.alerts} />
        <SpeechOvernightCard view={d.overnight} />
        <div className="grid gap-6 lg:grid-cols-2">
          <SpeechLedgerCard ledger={d.ledger} />
          <SpeechLoopControls
            paused={d.loop.paused}
            monthSpendUsd={d.loop.monthSpendUsd}
            monthlyCapUsd={d.loop.monthlyCapUsd}
          />
        </div>
        <SpeechTrend points={d.trend} />
        <SpeechCandidates rows={d.candidates} />
      </div>
    </div>
  );
}
