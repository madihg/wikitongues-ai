import Link from "next/link";
import { VerdictHeadlineCard } from "@/components/arena/speakers-verdict";
import type { VerdictHeadline } from "@/lib/annotation-insights";
import type { SpeechHeadline } from "@/lib/admin/measure/headline";
import { formatHolding, type Holding } from "@/lib/admin/today";

/**
 * The three tiles of "The models" on Today, and the "What we hold" line. Each
 * tile shows one number from the view it links to, built by that view's own
 * function, with one plain sentence under it.
 */

const tile = "flex flex-col rounded-lg border border-border bg-surface p-5";
const eyebrow = "font-mono text-xs uppercase tracking-widest text-text-muted";
const open = "mt-auto pt-4 text-sm font-medium text-accent-text";

export function VerdictTile({ headline }: { headline: VerdictHeadline }) {
  return (
    <div className={tile}>
      <h3 className={eyebrow}>Text: speakers&apos; verdict</h3>
      <div className="mt-3 [&>div]:p-4 [&_p:first-child]:text-sm">
        <VerdictHeadlineCard headline={headline} />
      </div>
      <Link href="/admin/arena/verdict" className={open}>
        Open the verdict
      </Link>
    </div>
  );
}

export function AgreementTile({
  leader,
}: {
  leader: { name: string; approach: string; score: number } | null;
}) {
  return (
    <div className={tile}>
      <h3 className={eyebrow}>Text: agreement score</h3>
      {leader ? (
        <>
          <p className="mt-3 text-4xl tabular-nums text-text-primary">
            {leader.score.toFixed(1)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {leader.name}, the best of the models examined.
          </p>
          <p className="mt-2 text-sm text-text-tertiary">
            100 is one speaker agreeing with another.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-text-tertiary">
          No model can be scored yet. The score needs one test question answered
          by two speakers.
        </p>
      )}
      <Link href="/admin/arena/eval" className={open}>
        Open the benchmark
      </Link>
    </div>
  );
}

export function SpeechTile({ headline }: { headline: SpeechHeadline | null }) {
  return (
    <div className={tile}>
      <h3 className={eyebrow}>Speech</h3>
      {headline === null ? (
        <p className="mt-3 text-sm text-text-tertiary">
          Speech is switched off on this server.
        </p>
      ) : (
        <>
          {headline.recognition ? (
            <>
              <p className="mt-3 text-4xl tabular-nums text-text-primary">
                {headline.recognition.lettersWrongPer100}
                <span className="ml-2 text-base text-text-secondary">
                  of 100 letters wrong
                </span>
              </p>
              <p className="mt-1 text-sm text-text-tertiary">
                {`${headline.recognition.examClips} ${headline.recognition.locked ? "exam clips" : "clips, not a locked exam"}. Sample: ${headline.recognition.tier}.`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-base text-text-primary">{headline.empty}</p>
          )}
          <p className="mt-2 text-sm text-text-secondary">
            {headline.listeners
              ? `Listeners chose the model in ${headline.listeners.chosen} of ${headline.listeners.rounds} rounds. Sample: ${headline.listeners.tier}.`
              : "No listener has compared a model with a person yet."}
          </p>
          <p className="mt-2 text-sm text-text-tertiary">
            We hold {headline.held.clips} clips,{" "}
            {Math.round(headline.held.minutes * 10) / 10} minutes.
          </p>
        </>
      )}
      {headline !== null && (
        <Link href="/admin/speech" className={open}>
          Open the measurements
        </Link>
      )}
    </div>
  );
}

export function HoldingsLine({
  holdings,
  period,
}: {
  holdings: Holding[];
  /** "this week" or "that week": which week the small number is about. */
  period: string;
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {holdings.map((h) => {
        const f = formatHolding(h);
        return (
          <div
            key={h.key}
            className="rounded-lg border border-border bg-surface px-5 py-4"
          >
            <dd className="text-2xl tabular-nums text-text-primary">
              {f.total}
              <span className="ml-2 text-sm text-text-tertiary">
                {f.inWeek} {period}
              </span>
            </dd>
            <dt className="mt-1 text-sm text-text-secondary">{h.label}</dt>
          </div>
        );
      })}
    </dl>
  );
}
