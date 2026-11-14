import { requireSpeakPage } from "@/lib/speech/page-gate";
import { CheckInterface } from "@/components/lab/check-interface";

export default async function SpeakCheckPage() {
  await requireSpeakPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Check</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Listen to someone else&apos;s clip and read what they wrote. Does the
        recording match the text? Your answer helps keep the data clean.
      </p>
      <div className="mt-6">
        <CheckInterface />
      </div>
    </div>
  );
}
