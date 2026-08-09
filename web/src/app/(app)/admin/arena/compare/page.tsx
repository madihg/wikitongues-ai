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
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Head-to-head</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          A prompt-by-prompt diff of two candidates on the frozen Igala
          benchmark, with the human verdict alongside. Read this when the
          leaderboard has nothing to tell you, which is most of the time right
          now: the written reasons and the &quot;both inadequate&quot; verdicts
          are the real findings while decided winners are still rare.
        </p>
      </div>

      {a && b ? <HeadToHead a={a} b={b} /> : <ComparePicker a={a} b={b} />}
    </div>
  );
}
