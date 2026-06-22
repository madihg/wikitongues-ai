import Link from "next/link";
import { HeadToHead, ComparePicker } from "@/components/arena/head-to-head";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const a = typeof sp.a === "string" ? sp.a : "";
  const b = typeof sp.b === "string" ? sp.b : "";

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text-primary">Head-to-head</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            A prompt-by-prompt diff of two candidates on the held-out Igala
            bank, with the human pick highlighted. This is where a rung-by-rung
            delta becomes concrete: read the actual answers, not just the score.
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>

      {a && b ? <HeadToHead a={a} b={b} /> : <ComparePicker a={a} b={b} />}
    </div>
  );
}
