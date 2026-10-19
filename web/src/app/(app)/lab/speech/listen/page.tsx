import { requireLabPage } from "@/lib/speech/page-gate";
import { ListenInterface } from "@/components/lab/listen-interface";

export default async function ListenPage() {
  await requireLabPage();
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
    </div>
  );
}
