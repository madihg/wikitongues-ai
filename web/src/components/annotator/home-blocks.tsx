import Link from "next/link";
import {
  WAITING_COPY,
  nothingWaiting,
  waitingCards,
  type WaitingCounts,
} from "@/lib/waiting";

/**
 * The blocks of the annotator Dashboard that the spec adds (annotator
 * experience spec, section 4.2): "Waiting for you" and "What you have done".
 * Plain components with no fetch of their own: the page makes one request
 * and hands the numbers down.
 */

/** The card every Dashboard number sits in: title, big number, one line. */
export function StatCard({
  title,
  value,
  description,
  href,
}: {
  title: string;
  value: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <h3 className="text-sm font-medium text-text-tertiary">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-tertiary">{description}</p>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group relative block cursor-pointer rounded-lg border border-border bg-surface p-6 transition-colors hover:border-accent/40 hover:bg-surface-sunken"
    >
      {content}
      <span className="absolute right-6 top-6 text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        &rarr;
      </span>
    </Link>
  );
}

export function WaitingBlock({
  counts,
  placeholder,
  children,
}: {
  /** Undefined while loading or when the numbers could not be loaded. */
  counts: WaitingCounts | undefined;
  /** What a number shows while there is none: "…" loading, "Not available" on error. */
  placeholder: string;
  /** Extra cards after the waiting ones (the researcher-only cards). */
  children?: React.ReactNode;
}) {
  const cards = waitingCards(
    counts ?? {
      annotate: 0,
      record: 0,
      listen: 0,
      check: 0,
      tone: 0,
      fix: 0,
      fixTotal: 0,
    },
  );
  return (
    <section aria-labelledby="waiting-heading">
      <h2
        id="waiting-heading"
        className="mb-4 text-sm font-medium text-text-secondary"
      >
        {WAITING_COPY.heading}
      </h2>
      {counts && nothingWaiting(counts) && (
        <p className="mb-4 text-sm text-text-tertiary">{WAITING_COPY.empty}</p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((c) => (
          <StatCard
            key={c.key}
            title={c.title}
            value={counts ? String(c.value) : placeholder}
            description={c.line}
            href={c.href}
          />
        ))}
        {children}
      </div>
    </section>
  );
}

export function DoneBlock({
  completed,
  coldAnswers,
  clips,
  showClips,
  placeholder,
}: {
  completed: number | undefined;
  coldAnswers: number | undefined;
  clips: number | undefined;
  /** Speech is on for this account, or it has clips already. */
  showClips: boolean;
  placeholder: string;
}) {
  const rows: [string, number | undefined][] = [
    ["Comparisons Completed", completed],
    ["Gold Answers Written", coldAnswers],
    ...(showClips
      ? ([["Clips recorded", clips]] as [string, number | undefined][])
      : []),
  ];
  return (
    <section aria-labelledby="done-heading">
      <h2 id="done-heading" className="text-sm font-medium text-text-secondary">
        What you have done
      </h2>
      <dl className="mt-2 max-w-xs space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-6"
          >
            <dt className="text-text-tertiary">
              <Link
                href="/annotator/history"
                className="hover:text-text-secondary hover:underline"
              >
                {label}
              </Link>
            </dt>
            <dd className="font-semibold tabular-nums text-text-primary">
              {value === undefined ? placeholder : value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
