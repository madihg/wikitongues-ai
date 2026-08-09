"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { bucketShort, bucketLabel } from "@/lib/buckets";
import type { EvalBucket } from "@prisma/client";

/**
 * The researcher view of the AUTOMATIC eval.
 *
 * Design rules this component is not allowed to break, because the numbers are
 * easy to over-read:
 *   - every figure is shown with its n;
 *   - every aggregate is shown with its 95% interval, or the words "n too small"
 *     when there isn't one;
 *   - the inter-gold ceiling sits in the SAME table as the model rows, so a
 *     model score is never read against 100%;
 *   - a head-to-head whose interval crosses zero prints "not distinguishable",
 *     never a rank;
 *   - the autorater's agreement number is shown next to the majority baseline
 *     and Cohen's kappa, so a 90% that is really the base rate cannot pass for
 *     a result.
 */

interface Interval {
  mean: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  underpowered: boolean;
}

interface MetricCell {
  metric: string;
  best: Interval;
  meanOverRefs: Interval;
}

interface CategoryReport {
  bucket: string;
  n: number;
  metrics: MetricCell[];
}

interface LeaderComparison {
  leaderId: string;
  leaderName: string;
  nPaired: number;
  deltaMean: number;
  ciLow: number;
  ciHigh: number;
  distinguishable: boolean;
  underpowered: boolean;
}

interface CandidateReport {
  candidateId: string;
  candidateName: string;
  n: number;
  isLeader: boolean;
  vsLeader: LeaderComparison | null;
  overall: MetricCell[];
  byCategory: CategoryReport[];
  language: {
    igalaShare: Interval;
    englishLikeShare: Interval;
    lowConfidenceShare: number;
    verdictCounts: Record<string, number>;
    signatureFlagged: number;
  };
}

interface HeadToHead {
  candidateA: string;
  candidateB: string;
  nPaired: number;
  cells: { metric: string; delta: Interval & { distinguishable: boolean } }[];
}

interface SubsetAgreement {
  n: number;
  agree: number;
  accuracy: Interval;
  note: string;
}

interface EvalData {
  computedAt: string;
  metricLabels: Record<string, string>;
  languageLabels: Record<string, string>;
  profileProvenance: Record<string, { source: string; caveat: string }>;
  corpus: {
    holdoutPrompts: number;
    goldAnswersTotal: number;
    goldAnswersOnHoldout: number;
    candidateOutputs: number;
    humanComparisons: number;
    comparisonsOutsideHoldout: number;
  };
  report: {
    generatedAt: string;
    nPrompts: number;
    nPromptsWithGold: number;
    candidates: CandidateReport[];
    ceiling: {
      overall: MetricCell[];
      byCategory: CategoryReport[];
      nPromptsWithCeiling: number;
      nPromptsWithoutCeiling: number;
    };
    headToHead: HeadToHead[];
    caveats: string[];
  };
  autorater: {
    thresholds: {
      inadequate: number;
      tieMargin: number;
      quantile: number;
      nCeilingSamples: number;
    };
    overall: SubsetAgreement;
    decided: SubsetAgreement;
    decidedScorable: SubsetAgreement;
    bothInadequate: SubsetAgreement;
    ties: SubsetAgreement;
    majorityBaseline: { label: string; accuracy: number; n: number };
    kappaInadequate: number;
    requiredDecidedFor10pt: number;
    langGate: {
      nTagged: number;
      nTaggedDetected: number;
      recall: Interval;
      note: string;
    };
    headline: string;
  };
  langidCrossValidation: {
    perClass: Record<
      string,
      { correct: number; total: number; accuracy: number }
    >;
    overallAccuracy: number;
    overallTotal: number;
    igalaVsNotIgala: { correct: number; total: number; accuracy: number };
    englishLikeAccuracy: number;
    folds: number;
    validatedClasses: string[];
    unvalidatedClasses: string[];
  };
}

const HEADLINE_METRICS = [
  "chrf",
  "chrfpp",
  "exactMatch",
  "toneInsensitiveMatch",
  "tokenEditSimilarity",
];

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function IntervalCell({ i }: { i: Interval }) {
  if (i.n === 0) {
    return <span className="text-text-muted">no data</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium text-text-primary">{pct(i.mean)}</span>{" "}
      {i.underpowered ? (
        <span
          className="text-warning"
          title="Sample too small to bootstrap an interval"
        >
          n={i.n}, no CI
        </span>
      ) : (
        <span className="text-text-tertiary">
          [{pct(i.ciLow)}–{pct(i.ciHigh)}]
        </span>
      )}
    </span>
  );
}

/**
 * Every row's own verdict against the top row. The table is sorted by score,
 * and a sorted table reads as a ranking whether or not the intervals support
 * one, so the answer travels with the row rather than living in a separate
 * section a reader may never reach.
 */
function LeaderCell({ c }: { c: CandidateReport }) {
  if (c.isLeader) {
    return (
      <span
        className="text-text-tertiary"
        title="Highest chrF point estimate. Not a claim that it is the best model."
      >
        top row
      </span>
    );
  }
  if (!c.vsLeader) {
    return (
      <span
        className="text-text-muted"
        title="Too few shared prompts to compare"
      >
        no shared prompts
      </span>
    );
  }
  const v = c.vsLeader;
  if (!v.distinguishable) {
    return (
      <span
        className="text-text-tertiary"
        title={`Paired chrF delta against ${v.leaderName} on ${v.nPaired} shared prompts; the 95% interval includes zero.`}
      >
        tied at this n
      </span>
    );
  }
  return (
    <span
      className="text-text-secondary"
      title={`Paired chrF delta against ${v.leaderName} on ${v.nPaired} shared prompts; the 95% interval excludes zero.`}
    >
      separated
    </span>
  );
}

function metricOf(cells: MetricCell[], metric: string): MetricCell | undefined {
  return cells.find((c) => c.metric === metric);
}

function Section({
  title,
  tip,
  children,
}: {
  title: string;
  tip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg text-text-primary">
        {title}
        {tip ? (
          <InfoTip label={`About ${title}`} width="w-96">
            {tip}
          </InfoTip>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

export function AutoEval() {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `reload` is bumped by the Recompute button. The effect only ever calls
  // setState from an async callback, never synchronously in its body, so it
  // cannot cascade renders.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/arena/eval${reload > 0 ? "?refresh=1" : ""}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const recompute = useCallback(() => {
    setLoading(true);
    setReload((n) => n + 1);
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-md bg-surface-sunken"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const { report, autorater, langidCrossValidation: cv, corpus } = data;
  const nameById = new Map(
    report.candidates.map((c) => [c.candidateId, c.candidateName]),
  );

  // Only render categories that at least one candidate was scored on.
  const buckets = Array.from(
    new Set(
      report.candidates.flatMap((c) => c.byCategory.map((b) => b.bucket)),
    ),
  ).sort();

  // De-duplicate the ordered head-to-head pairs (A vs B and B vs A).
  const seen = new Set<string>();
  const pairs = report.headToHead.filter((h) => {
    const key = [h.candidateA, h.candidateB].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const noCandidates = report.candidates.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-tertiary">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{corpus.holdoutPrompts} frozen prompts</span>
          <span>{report.nPromptsWithGold} with community gold</span>
          <span>{corpus.goldAnswersOnHoldout} gold answers on them</span>
          <span>{corpus.candidateOutputs} candidate outputs</span>
          <span>{corpus.humanComparisons} human comparisons</span>
          <span className="font-mono">computed {data.computedAt}</span>
        </div>
        <button
          onClick={recompute}
          disabled={loading}
          className="rounded-md border border-border-strong px-3 py-1 font-medium text-text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-50"
        >
          {loading ? "Recomputing…" : "Recompute"}
        </button>
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">
          These are automatic proxies, not quality.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {report.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      {noCandidates ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          No candidate has answers stored on the frozen bank yet. Run an eval
          from the Candidates tab first.
        </div>
      ) : null}

      {/* ── 1. candidates vs the ceiling ─────────────────────────────── */}
      <Section
        title="Reference-based scores against community gold"
        tip={
          <>
            Each candidate&apos;s answer on a frozen prompt is scored against{" "}
            <strong>every</strong> community gold answer for that prompt, and we
            keep the best match (the standard multi-reference rule). chrF is
            character n-gram F-score with recall weighted twice as heavily as
            precision, the standard metric for low-resource machine translation.
            The last row is the <strong>inter-gold ceiling</strong>: the same
            score computed between the human gold answers themselves. It is the
            resolution limit of the metric, and the number every model row must
            be read against.
          </>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Candidate
                </th>
                <th className="px-2 py-3 text-right font-medium text-text-secondary">
                  n
                </th>
                {HEADLINE_METRICS.map((m) => (
                  <th
                    key={m}
                    className="px-3 py-3 text-left text-xs font-medium text-text-secondary"
                  >
                    {data.metricLabels[m] ?? m}
                  </th>
                ))}
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-text-secondary"
                  title="Paired chrF comparison against the top row. Sort order alone is not a ranking."
                >
                  vs top row
                </th>
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((c) => (
                <tr
                  key={c.candidateId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3 font-medium text-text-primary">
                    {c.candidateName}
                  </td>
                  <td className="px-2 py-3 text-right text-text-tertiary">
                    {metricOf(c.overall, "chrf")?.best.n ?? 0}
                  </td>
                  {HEADLINE_METRICS.map((m) => (
                    <td key={m} className="px-3 py-3 text-xs">
                      <IntervalCell i={metricOf(c.overall, m)!.best} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-xs">
                    <LeaderCell c={c} />
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong bg-surface-sunken">
                <td className="px-3 py-3">
                  <div className="font-medium text-text-primary">
                    Inter-gold ceiling
                  </div>
                  <div className="text-xs text-text-tertiary">
                    native speaker vs native speaker
                  </div>
                </td>
                <td className="px-2 py-3 text-right text-text-tertiary">
                  {report.ceiling.nPromptsWithCeiling}
                </td>
                {HEADLINE_METRICS.map((m) => (
                  <td key={m} className="px-3 py-3 text-xs">
                    <IntervalCell
                      i={metricOf(report.ceiling.overall, m)!.best}
                    />
                  </td>
                ))}
                <td className="px-3 py-3 text-xs text-text-muted">
                  not a model
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-tertiary">
          Rows are sorted by chrF for readability. That order is{" "}
          <strong>not</strong> a ranking: a row marked &quot;tied at this
          n&quot; is not below the top row in any sense the data supports.
        </p>
        <p className="text-xs text-text-tertiary">
          Ceiling computed on {report.ceiling.nPromptsWithCeiling} prompts that
          have two or more gold answers; {report.ceiling.nPromptsWithoutCeiling}{" "}
          prompts have too few for a ceiling to exist. Each gold answer is held
          out and scored against the rest, exactly as a model is, so the ceiling
          is measured on one fewer reference than the models get and is
          therefore a slight under-estimate.
        </p>
      </Section>

      {/* ── 2. head to head ──────────────────────────────────────────── */}
      <Section
        title="Head-to-head, paired"
        tip={
          <>
            The difference in chrF computed prompt by prompt on the prompts both
            candidates answered, then bootstrapped over prompts. Pairing removes
            prompt difficulty, which is the dominant source of variance here.
            When the interval contains zero we print{" "}
            <strong>not distinguishable</strong> rather than a winner: at this
            sample size the data cannot support one.
          </>
        }
      >
        {pairs.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            Not enough overlapping prompts to compare any two candidates.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="px-3 py-3 text-left font-medium text-text-secondary">
                    A
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-text-secondary">
                    B
                  </th>
                  <th className="px-2 py-3 text-right font-medium text-text-secondary">
                    paired n
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-text-secondary">
                    chrF delta (A − B)
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-text-secondary">
                    Verdict
                  </th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((h) => {
                  const d = h.cells.find((c) => c.metric === "chrf")!.delta;
                  return (
                    <tr
                      key={`${h.candidateA}-${h.candidateB}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-3 text-text-primary">
                        {nameById.get(h.candidateA)}
                      </td>
                      <td className="px-3 py-3 text-text-primary">
                        {nameById.get(h.candidateB)}
                      </td>
                      <td className="px-2 py-3 text-right text-text-tertiary">
                        {h.nPaired}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="font-medium text-text-primary">
                          {d.mean >= 0 ? "+" : ""}
                          {(d.mean * 100).toFixed(1)}
                        </span>{" "}
                        {d.underpowered ? (
                          <span className="text-warning">n={d.n}, no CI</span>
                        ) : (
                          <span className="text-text-tertiary">
                            [{(d.ciLow * 100).toFixed(1)},{" "}
                            {(d.ciHigh * 100).toFixed(1)}]
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {d.distinguishable ? (
                          <span className="font-medium text-success">
                            {d.mean > 0 ? "A higher" : "B higher"}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">
                            not distinguishable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 3. language gate ─────────────────────────────────────────── */}
      <Section
        title="Language-identity gate"
        tip={
          <>
            A character n-gram classifier that asks whether an output is Igala
            at all. The Igala and English profiles are trained on data we hold
            (community gold, prompt texts) and are cross-validated below. The
            Yoruba, Igbo and Pidgin profiles are hardcoded seed word lists with{" "}
            <strong>no validation data</strong>, so a verdict of
            &quot;Yoruba&quot; is a flag for a human, never a finding.
          </>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Candidate
                </th>
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Called Igala
                </th>
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Called English-like
                </th>
                <th className="px-2 py-3 text-right font-medium text-text-secondary">
                  Foreign orthography
                </th>
                <th className="px-2 py-3 text-right font-medium text-text-secondary">
                  Gate abstained
                </th>
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((c) => (
                <tr
                  key={c.candidateId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3 font-medium text-text-primary">
                    {c.candidateName}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <IntervalCell i={c.language.igalaShare} />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <IntervalCell i={c.language.englishLikeShare} />
                  </td>
                  <td
                    className="px-2 py-3 text-right text-text-secondary"
                    title="Outputs containing a character Igala orthography does not use (ṣ, ị, ụ, ṅ)"
                  >
                    {c.language.signatureFlagged}
                  </td>
                  <td
                    className="px-2 py-3 text-right text-text-tertiary"
                    title="Text too short or the margin too small for the verdict to mean anything"
                  >
                    {pct(c.language.lowConfidenceShare)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-text-primary">
            How reliable is this gate? Measured, not assumed.
          </p>
          <p className="mt-2 text-text-secondary">
            {cv.folds}-fold cross-validation on held-out text: the
            Igala-vs-English distinction is right{" "}
            <strong>{pct(cv.overallAccuracy)}</strong> of the time (n=
            {cv.overallTotal}). The binary question the gate is actually used
            for, &quot;is this Igala?&quot;, is right{" "}
            <strong>{pct(cv.igalaVsNotIgala.accuracy)}</strong> of the time (n=
            {cv.igalaVsNotIgala.total}).
          </p>
          <ul className="mt-2 space-y-1 text-xs text-text-tertiary">
            {Object.entries(cv.perClass).map(([label, c]) => (
              <li key={label}>
                {data.languageLabels[label] ?? label}: {pct(c.accuracy)} of{" "}
                {c.total} held-out texts
              </li>
            ))}
            <li className="text-warning">
              No validation data exists for{" "}
              {cv.unvalidatedClasses
                .map((l) => data.languageLabels[l] ?? l)
                .join(", ")}
              . Those verdicts come from hardcoded seed lexicons and are triage
              only.
            </li>
          </ul>
        </div>
      </Section>

      {/* ── 4. per category ──────────────────────────────────────────── */}
      <Section
        title="chrF by prompt category"
        tip="Same metric, split by what the prompt tests. The ceiling row is per category too, because human agreement varies enormously between a one-word spelling prompt and an open blessing."
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-medium text-text-secondary">
                  Candidate
                </th>
                {buckets.map((b) => (
                  <th
                    key={b}
                    title={bucketLabel(b as EvalBucket)}
                    className="px-2 py-3 text-center text-xs font-medium text-text-secondary"
                  >
                    {bucketShort(b as EvalBucket)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((c) => (
                <tr
                  key={c.candidateId}
                  className="border-b border-border last:border-0"
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 py-3 font-medium text-text-primary">
                    {c.candidateName}
                  </td>
                  {buckets.map((b) => {
                    const cat = c.byCategory.find((x) => x.bucket === b);
                    if (!cat) {
                      return (
                        <td
                          key={b}
                          className="px-2 py-3 text-center text-text-muted"
                        >
                          –
                        </td>
                      );
                    }
                    const cell = metricOf(cat.metrics, "chrf")!;
                    return (
                      <td key={b} className="px-2 py-3 text-center text-xs">
                        <div className="text-text-primary">
                          {pct(cell.best.mean)}
                        </div>
                        <div className="text-text-tertiary">n={cat.n}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong bg-surface-sunken">
                <td className="sticky left-0 z-10 bg-surface-sunken px-3 py-3 font-medium text-text-primary">
                  Inter-gold ceiling
                </td>
                {buckets.map((b) => {
                  const cat = report.ceiling.byCategory.find(
                    (x) => x.bucket === b,
                  );
                  if (!cat) {
                    return (
                      <td
                        key={b}
                        className="px-2 py-3 text-center text-text-muted"
                        title="Fewer than two gold answers: no ceiling can be computed"
                      >
                        n/a
                      </td>
                    );
                  }
                  const cell = metricOf(cat.metrics, "chrf")!;
                  return (
                    <td key={b} className="px-2 py-3 text-center text-xs">
                      <div className="text-text-primary">
                        {pct(cell.best.mean)}
                      </div>
                      <div className="text-text-tertiary">n={cat.n}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 5. autorater validation ──────────────────────────────────── */}
      <Section
        title="How much does the autorater agree with native speakers?"
        tip={
          <>
            The autorater is a rule over the metrics above: both sides below the
            inadequacy threshold means &quot;both inadequate&quot;, a gap inside
            the tie margin means a tie, otherwise the higher score wins. The
            threshold is fixed from the inter-gold ceiling{" "}
            <strong>before</strong> looking at the labels, so this is not a
            number we tuned into existence.
          </>
        }
      >
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-primary">{autorater.headline}</p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Human label
                </th>
                <th className="px-2 py-3 text-right font-medium text-text-secondary">
                  n
                </th>
                <th className="px-2 py-3 text-right font-medium text-text-secondary">
                  agreed
                </th>
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  Agreement
                </th>
                <th className="px-3 py-3 text-left font-medium text-text-secondary">
                  What this can support
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["All labels", autorater.overall],
                  ["Human named a winner", autorater.decided],
                  [
                    "…and the autorater had gold for it",
                    autorater.decidedScorable,
                  ],
                  ["Human rejected both", autorater.bothInadequate],
                  ["Human called it a tie", autorater.ties],
                ] as const
              ).map(([label, s]) => (
                <tr
                  key={label}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3 text-text-primary">{label}</td>
                  <td className="px-2 py-3 text-right text-text-tertiary">
                    {s.n}
                  </td>
                  <td className="px-2 py-3 text-right text-text-tertiary">
                    {s.agree}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {s.n === 0 ? (
                      <span className="text-text-muted">no data</span>
                    ) : (
                      <IntervalCell i={s.accuracy} />
                    )}
                  </td>
                  <td className="max-w-md px-3 py-3 text-xs text-text-tertiary">
                    {s.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-tertiary">
              Majority baseline
            </div>
            <div className="mt-1 text-lg text-text-primary">
              {pct(autorater.majorityBaseline.accuracy)}
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              What a predictor that always says &quot;
              {autorater.majorityBaseline.label}&quot; would score. Any
              agreement figure has to beat this to mean anything.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-tertiary">
              Cohen&apos;s kappa
            </div>
            <div className="mt-1 text-lg text-text-primary">
              {autorater.kappaInadequate.toFixed(3)}
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Agreement corrected for the base rate. Near zero means the
              autorater has learned that almost everything is inadequate, and
              nothing else.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-tertiary">
              Decided comparisons
            </div>
            <div className="mt-1 text-lg text-text-primary">
              {autorater.decided.n} / {autorater.requiredDecidedFor10pt}
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Human-picked winners we have, against the number needed for a ±10
              point accuracy interval. Until this gets close, the autorater
              cannot be said to rank models.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-text-primary">
            Language gate against human failure tags
          </p>
          <p className="mt-1 text-text-secondary">
            {autorater.langGate.nTaggedDetected} of {autorater.langGate.nTagged}{" "}
            outputs a native speaker tagged &quot;not Igala&quot; or &quot;it is
            Yoruba, Igbo, or Pidgin&quot; were also called non-Igala by the
            gate.
          </p>
          <p className="mt-1 text-xs text-warning">{autorater.langGate.note}</p>
        </div>

        <p className="text-xs text-text-tertiary">
          Thresholds, fixed a priori: an output counts as inadequate below chrF{" "}
          {pct(autorater.thresholds.inadequate)}, which is the{" "}
          {(autorater.thresholds.quantile * 100).toFixed(0)}th percentile of{" "}
          {autorater.thresholds.nCeilingSamples} human-vs-human scores. Two
          sides within {pct(autorater.thresholds.tieMargin)} chrF count as a
          tie.
        </p>
      </Section>
    </div>
  );
}
