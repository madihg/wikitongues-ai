import Link from "next/link";
import {
  MIN_DECIDED_PER_PAIRING,
  type AnnotationInsights,
  type PairingSummary,
  type TagCount,
  type VerdictHeadline,
  type WeeklyInadequacy,
} from "@/lib/annotation-insights";
import { failureTagLabel } from "@/lib/failure-tags";

/**
 * "The Speakers' Verdict" - annotation insights rendered for a non-ML human.
 * Server-rendered, no chart library, same card language as the rest of the
 * arena (rounded-lg border border-border bg-surface shadow-sm). Every number
 * arrives through computeAnnotationInsights - this file draws, it never
 * computes, and it never hardcodes a count.
 */

function pct(part: number, whole: number): string {
  if (whole === 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

// ─── 1. headline ────────────────────────────────────────────────────────────

function Headline({ headline }: { headline: VerdictHeadline }) {
  if (headline.poolDecided === 0 || headline.leaderName === null) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm leading-relaxed text-text-secondary">
          No decided matchups between the current systems yet. The headline
          appears as soon as speakers start preferring one answer over the other
          in blind comparisons.
        </p>
      </div>
    );
  }
  const leaderLabel = headline.leaderCommunityTaught
    ? "the community-taught system"
    : "the untouched model";
  return (
    <div className="rounded-lg border border-accent bg-accent-subtle p-6 shadow-sm">
      <p className="text-lg leading-relaxed text-text-primary">
        In <strong>{headline.poolComparisons}</strong> blind matchups between
        the current systems, when speakers preferred one answer, they chose{" "}
        {leaderLabel} - <strong>{headline.leaderName}</strong> -{" "}
        <strong>{headline.leaderWins}</strong> times out of{" "}
        <strong>{headline.poolDecided}</strong>.
      </p>
      <p className="mt-2 text-sm text-text-secondary">
        The rest of those matchups: {headline.runnerUpName ?? "the other side"}{" "}
        won {headline.runnerUpWins}, {headline.poolTies} were judged equally
        good, and in {headline.poolBothInadequate} the speaker rejected both
        answers. Every matchup is blind: the speaker never knows which system
        wrote which answer.
      </p>
    </div>
  );
}

// ─── 2. head-to-head bars ───────────────────────────────────────────────────

function PairingBar({ p }: { p: PairingSummary }) {
  const segments = [
    { label: `${p.aName} wins`, value: p.aWins, cls: "bg-pick-a" },
    { label: "ties", value: p.ties, cls: "bg-border-strong" },
    { label: "both rejected", value: p.bothInadequate, cls: "bg-warning" },
    { label: `${p.bName} wins`, value: p.bWins, cls: "bg-pick-b" },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-text-primary">
          <span className="text-pick-a">{p.aName}</span>
          <span className="mx-1.5 text-text-muted">vs</span>
          <span className="text-pick-b">{p.bName}</span>
        </span>
        <span className="text-xs text-text-tertiary">
          {p.total} matchups
          {p.isCurrentPool && (
            <span className="ml-2 rounded-md bg-accent-subtle px-2 py-0.5 font-medium text-accent-text">
              current pairing
            </span>
          )}
        </span>
      </div>
      <div
        className="flex h-5 w-full overflow-hidden rounded-md"
        role="img"
        aria-label={`${p.aName} ${p.aWins} wins, ${p.bName} ${p.bWins} wins, ${p.ties} ties, ${p.bothInadequate} both rejected`}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.cls}
            style={{ width: `${(s.value / p.total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-pick-a" />
          {p.aName}: {p.aWins}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-pick-b" />
          {p.bName}: {p.bWins}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-border-strong" />
          ties: {p.ties}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-warning" />
          both rejected: {p.bothInadequate}
        </span>
      </div>
    </div>
  );
}

// ─── 3. why answers lose ────────────────────────────────────────────────────

function TagBars({ tags }: { tags: TagCount[] }) {
  const max = Math.max(...tags.map((t) => t.count), 1);
  return (
    <div className="space-y-2">
      {tags.map((t) => (
        <div key={t.key} className="flex items-center gap-3">
          <span className="w-52 shrink-0 truncate text-sm text-text-secondary">
            {failureTagLabel(t.key)}
          </span>
          <div className="h-4 flex-1 rounded-sm bg-surface-sunken">
            <div
              className="h-full rounded-sm bg-accent"
              style={{ width: `${(t.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-xs text-text-tertiary">
            {t.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 4. honesty strip ───────────────────────────────────────────────────────

function InadequacyStrip({ weekly }: { weekly: WeeklyInadequacy[] }) {
  const observed = weekly.filter((w) => w.total > 0);
  if (observed.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        No comparisons recorded yet, so there is no rate to draw.
      </p>
    );
  }
  const first = observed[0];
  const last = observed[observed.length - 1];
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {weekly.map((w) => {
          const rate = w.total > 0 ? w.bothInadequate / w.total : null;
          return (
            <div
              key={w.weekStart}
              className="flex h-full flex-1 items-end"
              title={
                rate === null
                  ? `Week of ${w.weekStart}: no comparisons`
                  : `Week of ${w.weekStart}: ${w.bothInadequate} of ${w.total} matchups rejected both answers (${pct(w.bothInadequate, w.total)})`
              }
            >
              {rate === null ? (
                <div className="h-px w-full bg-border" />
              ) : (
                <div
                  className="w-full rounded-t-sm bg-warning"
                  style={{ height: `${Math.max(rate * 100, 2)}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-text-tertiary">
        <span>
          week of {first.weekStart}: {pct(first.bothInadequate, first.total)}{" "}
          rejected both
        </span>
        <span>
          week of {last.weekStart}: {pct(last.bothInadequate, last.total)}{" "}
          rejected both
        </span>
      </div>
    </div>
  );
}

// ─── 5. recent decided examples ─────────────────────────────────────────────

function RecentExamples({ recent }: { recent: AnnotationInsights["recent"] }) {
  if (recent.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        No decided comparisons yet - examples appear once speakers start picking
        winners.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {recent.map((r, i) => (
        <article
          key={`${r.createdAt}-${i}`}
          className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-sunken px-4 py-2.5">
            <p className="min-w-0 flex-1 text-sm text-text-primary">
              {r.promptText}
            </p>
            <span className="font-mono text-xs text-text-muted">
              {r.createdAt.slice(0, 10)}
            </span>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-2">
            <div className="bg-surface p-4 ring-2 ring-inset ring-success">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {r.winnerName}
                </span>
                <span className="rounded-md bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                  a speaker chose this
                </span>
              </div>
              <p className="font-mono text-sm whitespace-pre-wrap text-text-primary">
                {r.winnerOutput}
              </p>
            </div>
            <div className="bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {r.loserName}
                </span>
              </div>
              <p className="font-mono text-sm whitespace-pre-wrap text-text-primary">
                {r.loserOutput}
              </p>
              {r.loserTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.loserTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-danger-subtle px-2 py-0.5 text-xs text-danger"
                    >
                      {failureTagLabel(t)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-border px-4 py-2.5 text-sm text-text-secondary">
            <span className="font-medium text-text-tertiary">
              In the speaker&apos;s words:{" "}
            </span>
            {r.explanation}
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── the full view ──────────────────────────────────────────────────────────

export function SpeakersVerdict({
  insights,
}: {
  insights: AnnotationInsights;
}) {
  return (
    <div className="space-y-6">
      <Headline headline={insights.headline} />

      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary">
          Head to head
        </h2>
        <p className="mb-4 mt-1 text-sm text-text-tertiary">
          Every pairing with at least {MIN_DECIDED_PER_PAIRING} decided
          matchups. The bar splits each pairing&apos;s matchups by outcome; the
          current pairing pool is featured first.
        </p>
        {insights.pairings.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            No pairing has reached {MIN_DECIDED_PER_PAIRING} decided matchups
            yet.
          </p>
        ) : (
          <div className="space-y-6">
            {insights.pairings.map((p) => (
              <PairingBar key={`${p.aName}::${p.bName}`} p={p} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            Why answers lose
          </h2>
          <p className="mb-4 mt-1 text-sm text-text-tertiary">
            When a speaker picks a winner, they tag what is wrong with the
            answer they rejected. These are those tags, across all decided
            matchups.
          </p>
          {insights.losingTags.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              No failure tags on rejected answers yet.
            </p>
          ) : (
            <TagBars tags={insights.losingTags} />
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            When both answers fail
          </h2>
          <p className="mb-4 mt-1 text-sm text-text-tertiary">
            Tags from matchups where the speaker rejected both answers - the
            failures no system has solved yet.
          </p>
          {insights.bothInadequateTags.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              No failure tags on both-rejected matchups yet.
            </p>
          ) : (
            <TagBars tags={insights.bothInadequateTags} />
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary">
          Both still inadequate - the honest chart
        </h2>
        <p className="mb-4 mt-1 text-sm text-text-tertiary">
          The share of matchups each week where the speaker rejected BOTH
          answers. Progress here means the bars falling, and they have further
          to fall.
        </p>
        <InadequacyStrip weekly={insights.weekly} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-text-primary">
          Recent verdicts, in full
        </h2>
        <p className="mb-4 mt-1 text-sm text-text-tertiary">
          The last {insights.recent.length} matchups where a speaker preferred
          one answer: the question, both answers, the pick, and the
          speaker&apos;s own explanation. Verdicts are shown without names.
        </p>
        <RecentExamples recent={insights.recent} />
      </section>
    </div>
  );
}

/**
 * Compact teaser for the arena Overview: the headline sentence plus a link.
 * Same live-data rule - the numbers arrive through computeAnnotationInsights
 * on the page that renders this.
 */
export function VerdictTeaser({ headline }: { headline: VerdictHeadline }) {
  return (
    <Link
      href="/admin/arena/verdict"
      className="group block rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:bg-surface-sunken"
    >
      <h2 className="text-base font-semibold text-text-primary">
        The Speakers&apos; Verdict
      </h2>
      {headline.poolDecided > 0 && headline.leaderName !== null ? (
        <p className="mt-1 text-sm text-text-secondary">
          In {headline.poolComparisons} blind matchups between the current
          systems, when speakers preferred one answer, they chose{" "}
          {headline.leaderName} {headline.leaderWins} times out of{" "}
          {headline.poolDecided}.
        </p>
      ) : (
        <p className="mt-1 text-sm text-text-secondary">
          What Igala speakers decide in blind matchups, and why losing answers
          lose.
        </p>
      )}
      <span className="mt-3 inline-block text-sm font-medium text-accent-text">
        See the verdict &rarr;
      </span>
    </Link>
  );
}
