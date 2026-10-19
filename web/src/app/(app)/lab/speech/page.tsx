import { requireLabPage } from "@/lib/speech/page-gate";
import { RecordInterface } from "@/components/lab/record-interface";

export default async function RecordPage() {
  await requireLabPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Record</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Say a prompt out loud, then choose what happens to the clip. Nothing is
        shared until you choose.
      </p>
      <div className="mt-6">
        <RecordInterface />
      </div>
    </div>
  );
}
