import { requireLabPage } from "@/lib/speech/page-gate";
import { RecordingsInterface } from "@/components/lab/recordings-interface";

export default async function RecordingsPage() {
  await requireLabPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Recordings</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Listen to what was recorded, flag bad audio, and export the manifest of
        clips that may be published openly.
      </p>
      <div className="mt-6">
        <RecordingsInterface />
      </div>
    </div>
  );
}
