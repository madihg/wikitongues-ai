import { requireLabPage } from "@/lib/speech/page-gate";
import { RecordingsInterface } from "@/components/lab/recordings-interface";

/**
 * Data, Speech clips: the recorded clips with the control that locks the exam
 * set. The same component the Recordings tab of the speech pages renders, so
 * there is one list and one set of rules. Speech switched off on the server:
 * this page does not exist (the tab is hidden too).
 */
export const dynamic = "force-dynamic";

export default async function DataClipsPage() {
  await requireLabPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Speech clips</h1>
      <p className="mt-2 max-w-2xl text-sm text-text-tertiary">
        Listen to what was recorded, flag bad audio, and lock the clips that
        make up the exam.
      </p>
      <div className="mt-6 max-w-3xl">
        <RecordingsInterface />
      </div>
    </div>
  );
}
