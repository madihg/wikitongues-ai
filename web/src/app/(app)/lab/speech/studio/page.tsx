import { requireLabPage } from "@/lib/speech/page-gate";
import { StudioInterface } from "@/components/lab/studio-interface";

export default async function StudioPage() {
  await requireLabPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Studio</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        A recording session for one voice. Work through the script line by line;
        each kept take counts toward the target.
      </p>
      <div className="mt-6">
        <StudioInterface />
      </div>
    </div>
  );
}
