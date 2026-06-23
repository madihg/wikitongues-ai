import Link from "next/link";
import { ContestedItems } from "@/components/arena/contested-items";

export default function ContestedPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Collective Review</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Disagreements and pending edits to resolve as a group. Collective
            sessions raise inter-annotator agreement and turn corrections into
            verified gold data.
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>
      <ContestedItems />
    </div>
  );
}
