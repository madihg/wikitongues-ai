import { bradleyTerry, type PairwiseObservation } from "@/lib/arena/bradley-terry";

/**
 * The Bradley-Terry decision card (PRD US-027), the pure half. One card per
 * pair of systems ("human" or a synthesis model ref), fitted from the counted
 * Listen judgments with the arena's own bradleyTerry (MM fit, 1000 bootstrap
 * resamples, 95 percent intervals). The card refuses to rank until a pair has
 * 300 judgments from at least 5 listeners, and names 600 as the stronger
 * target. A rank shown earlier would be noise dressed as a result.
 */

export const MIN_JUDGMENTS = 300;
export const MIN_LISTENERS = 5;
export const STRONG_JUDGMENTS = 600;
export const BOOTSTRAP_SAMPLES = 1000;

/** The system a clip belongs to, for pairing: a model ref, or "human". */
export function systemOf(c: {
  sourceType: string;
  sourceRef: string | null;
  modelOutputId: string | null;
}): string {
  if (c.sourceType !== "derived") return "human";
  if (c.sourceRef) return c.sourceRef;
  return c.modelOutputId ? `synth:${c.modelOutputId}` : "synth";
}

export interface JudgmentRow {
  /** System of clip A and of clip B. */
  a: string;
  b: string;
  winner: string;
  annotatorId: string;
  isDemo: boolean;
}

export type CardStatus = "not_enough" | "enough" | "strong";

export interface SystemStrength {
  id: string;
  /** BT strength on the arena's 0 to 100 display scale. */
  strength: number;
  ciLow: number;
  ciHigh: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface DecisionCard {
  pair: [string, string];
  judgments: number;
  listeners: number;
  status: CardStatus;
  message: string;
  /** Null until the pair has enough judgments: no ranking, no intervals. */
  strengths: SystemStrength[] | null;
  /** True when the top two intervals do not overlap. */
  distinguishable: boolean;
  leader: string | null;
}

export function statusOf(judgments: number, listeners: number): CardStatus {
  if (judgments < MIN_JUDGMENTS || listeners < MIN_LISTENERS) return "not_enough";
  return judgments >= STRONG_JUDGMENTS ? "strong" : "enough";
}

export function thresholdMessage(judgments: number, listeners: number): string {
  const status = statusOf(judgments, listeners);
  if (status === "not_enough") {
    return `Not enough judgments: ${judgments} of ${MIN_JUDGMENTS} needed, from ${listeners} of ${MIN_LISTENERS} listeners. ${STRONG_JUDGMENTS} judgments is the stronger target.`;
  }
  if (status === "enough") {
    return `${judgments} judgments from ${listeners} listeners: enough to compare these two. ${STRONG_JUDGMENTS} judgments is the stronger target.`;
  }
  return `${judgments} judgments from ${listeners} listeners: past the stronger target of ${STRONG_JUDGMENTS}.`;
}

/** One card per unordered pair of systems, sorted by pair. */
export function decisionCards(rows: JudgmentRow[]): DecisionCard[] {
  const pairs = new Map<string, JudgmentRow[]>();
  for (const r of rows) {
    if (r.isDemo || r.a === r.b) continue;
    if (r.winner !== "a" && r.winner !== "b" && r.winner !== "tie") continue;
    const key = [r.a, r.b].sort().join("\u0000");
    let list = pairs.get(key);
    if (!list) pairs.set(key, (list = []));
    list.push(r);
  }

  return [...pairs.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([key, list]) => {
      const pair = key.split("\u0000") as [string, string];
      const judgments = list.length;
      const listeners = new Set(list.map((r) => r.annotatorId)).size;
      const status = statusOf(judgments, listeners);
      const card: DecisionCard = {
        pair,
        judgments,
        listeners,
        status,
        message: thresholdMessage(judgments, listeners),
        strengths: null,
        distinguishable: false,
        leader: null,
      };
      if (status === "not_enough") return card;

      const obs: PairwiseObservation[] = list.map((r) => ({
        a: r.a,
        b: r.b,
        winner: r.winner as "a" | "b" | "tie",
      }));
      const fit = bradleyTerry(obs, { bootstrapSamples: BOOTSTRAP_SAMPLES });
      card.strengths = fit.candidates.map((c) => ({
        id: c.id,
        strength: c.strength,
        ciLow: c.ciLow,
        ciHigh: c.ciHigh,
        wins: c.wins,
        losses: c.losses,
        ties: c.ties,
      }));
      card.distinguishable = fit.distinguishable;
      card.leader = fit.distinguishable ? fit.candidates[0].id : null;
      return card;
    });
}
