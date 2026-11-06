"use client";

import { useEffect, useState } from "react";
import type { DecisionCard } from "@/lib/speech/decision";
import type { ToneAccuracy } from "@/lib/speech/minimal-pairs";

/**
 * The Bradley-Terry decision card (PRD US-027) with tone accuracy beside it
 * (US-011). One card per pair of systems. Below 300 judgments from 5
 * listeners a card says "Not enough judgments" and shows no ranking and no
 * intervals; it always names 600 as the stronger target. Above, it lists each
 * system's strength with its 95 percent bootstrap interval, and names a
 * leader only when the two intervals do not overlap.
 */

export interface DecisionData {
  thresholds: { minJudgments: number; minListeners: number; strongJudgments: number };
  cards: DecisionCard[];
  toneAccuracy: Record<string, ToneAccuracy>;
}

const label = (system: string) => (system === "human" ? "Human speaker" : system);
const percent = (x: number) => `${Math.round(x * 100)}%`;

function ToneLine({ system, acc }: { system: string; acc?: ToneAccuracy }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="font-mono text-xs text-text-secondary">{label(system)}</span>
      <span className="text-text-primary" data-testid="tone-accuracy">
        {acc
          ? `Tone accuracy ${percent(acc.accuracy)} (${acc.correct} of ${acc.answered} heard right)`
          : "Tone accuracy: no minimal-pair answers yet"}
      </span>
    </li>
  );
}

export function DecisionCardsView({ data }: { data: DecisionData }) {
  if (data.cards.length === 0) {
    return (
      <p
        data-testid="decision-empty"
        className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary"
      >
        No judgments between two systems yet. Each pair of systems needs{" "}
        {data.thresholds.minJudgments} judgments from {data.thresholds.minListeners}{" "}
        listeners before it is ranked; {data.thresholds.strongJudgments} is the
        stronger target.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {data.cards.map((card) => (
        <section
          key={card.pair.join("|")}
          data-testid="decision-card"
          data-status={card.status}
          aria-label={`${label(card.pair[0])} against ${label(card.pair[1])}`}
          className="rounded-lg border border-border bg-surface p-4 sm:p-6"
        >
          <h3 className="text-sm font-semibold text-text-primary">
            {label(card.pair[0])} against {label(card.pair[1])}
          </h3>
          <p
            data-testid="decision-message"
            className={`mt-2 text-sm ${card.status === "not_enough" ? "text-warning" : "text-text-secondary"}`}
          >
            {card.message}
          </p>
          {card.strengths && (
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Bradley-Terry strengths with 95 percent intervals</caption>
              <thead>
                <tr className="text-left text-text-tertiary">
                  <th scope="col" className="py-1 font-normal">System</th>
                  <th scope="col" className="py-1 font-normal">Strength</th>
                  <th scope="col" className="py-1 font-normal">95% interval</th>
                </tr>
              </thead>
              <tbody>
                {card.strengths.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs text-text-secondary">{label(s.id)}</td>
                    <td className="py-2 font-mono text-text-primary">{s.strength.toFixed(1)}</td>
                    <td className="py-2 font-mono text-text-primary">
                      {s.ciLow.toFixed(1)} to {s.ciHigh.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {card.strengths && (
            <p className="mt-2 text-sm text-text-primary">
              {card.leader
                ? `${label(card.leader)} is ahead: the intervals do not overlap.`
                : "The intervals overlap: no system is ahead yet."}
            </p>
          )}
          <ul className="mt-3 space-y-1 border-t border-border pt-3">
            {card.pair.map((sys) => (
              <ToneLine key={sys} system={sys} acc={data.toneAccuracy[sys]} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DecisionCards() {
  const [data, setData] = useState<DecisionData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/lab/speech/listen/decision");
        if (!res.ok) throw new Error("failed");
        const j = (await res.json()) as DecisionData;
        if (live) setData(j);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-label="Decision" aria-live="polite" className="space-y-3">
      <h2 className="text-lg font-semibold text-text-primary">Which voice is better</h2>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Could not load the decision cards.
        </p>
      )}
      {!data && !failed && <p className="text-sm text-text-tertiary">Loading...</p>}
      {data && <DecisionCardsView data={data} />}
    </section>
  );
}
