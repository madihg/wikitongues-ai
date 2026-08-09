"use client";

import { describeArenaSignal, type ArenaSignal } from "./signal-copy";

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium tabular-nums text-text-primary">
      {children}
    </span>
  );
}

function LegendRow({
  symbol,
  mono,
  children,
}: {
  symbol: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className={`w-10 shrink-0 text-center text-sm text-text-primary ${
          mono ? "font-mono" : "font-medium tabular-nums"
        }`}
      >
        {symbol}
      </span>
      <span className="text-xs leading-relaxed text-text-secondary">
        {children}
      </span>
    </div>
  );
}

/**
 * The plain-English reading of the leaderboard, shown above the table rather
 * than hidden in a tooltip. Counts are live from /api/arena/leaderboard; the
 * "can we rank yet" verdict follows the Bradley-Terry fit, never a threshold
 * invented in the UI.
 */
export function ScoreExplainer({
  signal,
  distinguishable,
}: {
  signal: ArenaSignal | null;
  distinguishable: boolean;
}) {
  const copy = signal ? describeArenaSignal(signal, distinguishable) : null;

  return (
    <section className="rounded-lg border border-border bg-surface-sunken p-5">
      <h2 className="text-sm font-semibold text-text-primary">
        How to read this table
      </h2>

      <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-text-secondary">
        <p>
          Every cell is an <strong>arena strength on a 0 to 100 scale</strong>,
          fitted with Bradley-Terry from human blind pairwise votes and nothing
          else. <strong>50 is the neutral starting point</strong>: it means no
          evidence either way. It is not a score of 50 percent, and it is not a
          passing grade. A model only moves away from 50 when a native speaker
          picks its answer over another model&apos;s.
        </p>

        {copy && copy.verdict === "absence" ? (
          <p>
            Right now this table is reporting an{" "}
            <strong>absence of evidence, not a set of ties</strong>. Of{" "}
            <Num>{copy.comparisons}</Num> blind comparisons collected outside
            demo sessions, only <Num>{copy.decided}</Num> (
            <Num>{copy.decidedShare}</Num>) produced a decided winner. In{" "}
            <Num>{copy.bothInadequate}</Num> of them (
            <Num>{copy.bothInadequateShare}</Num>) the annotator rejected both
            answers as inadequate, and <Num>{copy.ties}</Num> came back an
            explicit tie. A ranking is built out of decided winners, so with{" "}
            <Num>{copy.decided}</Num> of them there is nothing to rank yet. The
            arena cannot currently tell you which model is better at Igala, and
            it will keep saying so until that changes.
          </p>
        ) : copy ? (
          <p>
            Of <Num>{copy.comparisons}</Num> blind comparisons collected outside
            demo sessions, <Num>{copy.decided}</Num> (
            <Num>{copy.decidedShare}</Num>) produced a decided winner,{" "}
            <Num>{copy.bothInadequate}</Num> rejected both answers as
            inadequate, and <Num>{copy.ties}</Num> came back an explicit tie.
            There are now enough decided winners for the fit to separate
            candidates, so the ordering below carries real information. Cells
            still marked <span className="font-mono">ns</span> are the
            categories where it does not.
          </p>
        ) : (
          <p className="text-text-tertiary">Loading the live vote counts.</p>
        )}

        <p>
          What would change it: <strong>decided winners accumulating</strong>,
          especially on the{" "}
          {copy ? <Num>{copy.heldOutPrompts}</Num> : "held-out"} frozen
          benchmark prompts, where the fine-tuned model now answers alongside
          the baselines. The community gold for those prompts never enters any
          training set, so a win there is a genuine win rather than a model
          reciting what it was trained on. That is what makes the comparison
          fair.
        </p>
      </div>

      <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
        <LegendRow symbol="50">
          Neutral. No evidence either way yet, so the fit leaves the model where
          it started.
        </LegendRow>
        <LegendRow symbol="ns" mono>
          Not statistically distinguishable at this sample size. Expected right
          now, and not a defect: it is the honest answer while decided winners
          are this rare.
        </LegendRow>
        <LegendRow symbol="▲ △">
          Best and second-best in that category on the votes cast so far.
          Provisional while <span className="font-mono">ns</span> is showing.
        </LegendRow>
        <LegendRow symbol="-">
          That model has no votes in that category yet, so there is nothing to
          fit.
        </LegendRow>
      </div>

      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-text-tertiary">
        No model grades the Igala here. A model that cannot speak Igala cannot
        judge it, so there is no LLM-as-judge score anywhere in this table.
        Automatic metrics (chrF, language identity, diacritic checks) are used
        for triage and gating only. Native human judgment decides.
        {copy ? " Counts above are live from the arena database." : ""}
      </p>
    </section>
  );
}
