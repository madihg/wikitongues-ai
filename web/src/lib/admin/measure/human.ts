import {
  pairedBootstrapDelta,
  wilsonInterval,
  type Interval,
} from "@/lib/eval/stats";
import { krippendorffAlpha } from "@/lib/stats/krippendorff";
import {
  CHECK_LEVELS,
  CHECK_VERDICTS,
  type CheckVerdict,
} from "@/lib/speech/check";
import {
  AXES_VERSION,
  axesSetFor,
  readStoredAxes,
} from "@/lib/speech/speech-axes";
import {
  AGREEMENT_MIN_UNITS,
  AXIS_GAP_MIN,
  AXIS_QUOTE_MIN,
  CHECK_PERCENT_MIN,
  TONE_PAIR_MIN,
  humanTier,
  nextHumanTier,
  showsPercent,
  type HumanTier,
} from "./tiers";

/**
 * The human half of the speech measurement view, as pure functions: what
 * listeners decided when they compared a model's clip with a person's clip
 * of the same sentence, without knowing which was which.
 *
 * Rules that hold for every number here:
 *   - demo rows never count;
 *   - a tie and "both unusable" are shown beside the choice, never folded in;
 *   - rows scored under another rubric version are never averaged together;
 *   - below the first sample threshold a number is a count, not a percentage.
 *
 * `HUMAN` is the system name of a person's clip (decision.ts, systemOf).
 */

export const HUMAN_SYSTEM = "human";

/** One Listen judgment, as the adapter hands it over. No text, no audio. */
export interface ListenRow {
  id: string;
  promptId: string;
  annotatorId: string;
  recordingAId: string;
  recordingBId: string;
  /** System of clip A and of clip B: a model ref, or "human". */
  a: string;
  b: string;
  winner: string;
  /** The stored axes value, unread. */
  axes: unknown;
  isDemo: boolean;
  createdAt: string;
}

export type Outcome = "model" | "person" | "tie" | "both_unusable";

/** A judgment of one model against a person, with the sides resolved. */
export interface ModelRound {
  id: string;
  promptId: string;
  annotatorId: string;
  /** The same two clips, whichever side each was played on. */
  pairKey: string;
  modelSide: "a" | "b";
  outcome: Outcome;
  axes: unknown;
  createdAt: string;
}

/** Every model that has met a person in a counted round, most rounds first. */
export function systemsAgainstHuman(rows: ListenRow[]): string[] {
  const n = new Map<string, number>();
  for (const r of rows) {
    if (r.isDemo) continue;
    const model =
      r.a === HUMAN_SYSTEM ? r.b : r.b === HUMAN_SYSTEM ? r.a : null;
    if (!model || model === HUMAN_SYSTEM) continue;
    n.set(model, (n.get(model) ?? 0) + 1);
  }
  return [...n.entries()]
    .sort(([x, a], [y, b]) => b - a || (x < y ? -1 : 1))
    .map(([s]) => s);
}

/**
 * The counted rounds where one clip is a person's and the other comes from
 * `modelRef`. A round between two people, two models, or another model is
 * not this model's evidence and is left out.
 */
export function roundsAgainstHuman(
  rows: ListenRow[],
  modelRef: string,
): ModelRound[] {
  const out: ModelRound[] = [];
  for (const r of rows) {
    if (r.isDemo) continue;
    let modelSide: "a" | "b";
    if (r.a === modelRef && r.b === HUMAN_SYSTEM) modelSide = "a";
    else if (r.b === modelRef && r.a === HUMAN_SYSTEM) modelSide = "b";
    else continue;
    let outcome: Outcome;
    if (r.winner === "tie") outcome = "tie";
    else if (r.winner === "both_unusable") outcome = "both_unusable";
    else if (r.winner === "a" || r.winner === "b") {
      outcome = r.winner === modelSide ? "model" : "person";
    } else continue;
    out.push({
      id: r.id,
      promptId: r.promptId,
      annotatorId: r.annotatorId,
      pairKey: [r.recordingAId, r.recordingBId].sort().join("|"),
      modelSide,
      outcome,
      axes: r.axes,
      createdAt: r.createdAt,
    });
  }
  return out;
}

export interface Preference {
  rounds: number;
  sentences: number;
  listeners: number;
  firstAt: string | null;
  lastAt: string | null;
  model: number;
  person: number;
  tie: number;
  bothUnusable: number;
  tier: HumanTier;
  /** The sentence that says how far the next tier is. Null at the top. */
  next: string | null;
  /**
   * How often listeners chose the model, among rounds where they chose one:
   * model / (model + person), with its Wilson 95% range. Null below the
   * first threshold, or when no round named a winner: counts only.
   */
  share: Interval | null;
}

export function preference(rounds: ModelRound[]): Preference {
  const count = (o: Outcome) => rounds.filter((r) => r.outcome === o).length;
  const model = count("model");
  const person = count("person");
  const sentences = new Set(rounds.map((r) => r.promptId)).size;
  const listeners = new Set(rounds.map((r) => r.annotatorId)).size;
  const tier = humanTier(rounds.length, sentences, listeners);
  const times = rounds.map((r) => r.createdAt).sort();
  return {
    rounds: rounds.length,
    sentences,
    listeners,
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    model,
    person,
    tie: count("tie"),
    bothUnusable: count("both_unusable"),
    tier,
    next: nextHumanTier(rounds.length, sentences, listeners),
    share:
      showsPercent(tier) && model + person > 0
        ? wilsonInterval(model, model + person)
        : null,
  };
}

// ─── the score lines, both clips ────────────────────────────────────────────

export interface AxisLine {
  key: string;
  /** Rounds where both clips got a number on this line. */
  rated: number;
  person: number | null;
  model: number | null;
  /** Model minus person in the same round, with its paired range. Null under 30 rated rounds. */
  gap: {
    mean: number;
    ciLow: number;
    ciHigh: number;
    distinguishable: boolean;
  } | null;
  /** True from 100 rated rounds on. */
  quotable: boolean;
}

export interface AxisTable {
  version: string;
  lines: AxisLine[];
  /** Rows stored when only the winning clip was scored. Left out, and counted. */
  winnerOnlyExcluded: number;
  /** Rows scored under another rubric version. Left out, and counted. */
  otherVersionExcluded: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Mean score per line for the person's clip and the model's clip, and the
 * paired gap. Only rows scored under `version` with both clips rated on that
 * line enter a line. N/A is left out of that line only.
 */
export function axisTable(
  rounds: ModelRound[],
  version: string = AXES_VERSION,
): AxisTable {
  const set = axesSetFor(version);
  const keys = set ? set.axes.map((a) => a.key) : [];
  const perKey = new Map<string, { person: number[]; model: number[] }>(
    keys.map((k) => [k, { person: [], model: [] }]),
  );
  let winnerOnlyExcluded = 0;
  let otherVersionExcluded = 0;

  for (const r of rounds) {
    if (r.axes === null || r.axes === undefined) continue;
    if (isRecord(r.axes) && "target" in r.axes) {
      winnerOnlyExcluded++;
      continue;
    }
    if (
      isRecord(r.axes) &&
      typeof r.axes.version === "string" &&
      r.axes.version !== version
    ) {
      otherVersionExcluded++;
      continue;
    }
    const stored = readStoredAxes(r.axes);
    if (!stored || stored.version !== version) continue;
    const modelScores = stored.scores[r.modelSide];
    const personScores = stored.scores[r.modelSide === "a" ? "b" : "a"];
    for (const k of keys) {
      const m = modelScores[k];
      const p = personScores[k];
      if (typeof m !== "number" || typeof p !== "number") continue;
      const bucket = perKey.get(k)!;
      bucket.model.push(m);
      bucket.person.push(p);
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  return {
    version,
    winnerOnlyExcluded,
    otherVersionExcluded,
    lines: keys.map((key) => {
      const { person, model } = perKey.get(key)!;
      const rated = model.length;
      let gap: AxisLine["gap"] = null;
      if (rated >= AXIS_GAP_MIN) {
        const d = pairedBootstrapDelta(model, person, { seed: 20261113 });
        gap = {
          mean: d.mean,
          ciLow: d.ciLow,
          ciHigh: d.ciHigh,
          distinguishable: d.distinguishable,
        };
      }
      return {
        key,
        rated,
        person: avg(person),
        model: avg(model),
        gap,
        quotable: rated >= AXIS_QUOTE_MIN,
      };
    }),
  };
}

// ─── Check: does the clip say what is written? ──────────────────────────────

export interface CheckRow {
  recordingId: string;
  reviewerId: string;
  verdict: string;
  level: string | null;
  /** System of the checked clip: a model ref, or "human". */
  system: string;
  isDemo: boolean;
}

export interface CheckColumn {
  checked: number;
  counts: Record<CheckVerdict, number>;
  /** Share per verdict with its Wilson range. Null under 30 checked clips: counts only. */
  shares: Record<CheckVerdict, Interval> | null;
  /** Under "No": how many on each level. Always counts. */
  levels: Record<string, number>;
}

function checkColumn(rows: CheckRow[]): CheckColumn {
  const counts = Object.fromEntries(
    CHECK_VERDICTS.map((v) => [v, 0]),
  ) as Record<CheckVerdict, number>;
  const levels: Record<string, number> = Object.fromEntries(
    CHECK_LEVELS.map((l) => [l.key, 0]),
  );
  let checked = 0;
  for (const r of rows) {
    if (!(CHECK_VERDICTS as readonly string[]).includes(r.verdict)) continue;
    checked++;
    counts[r.verdict as CheckVerdict]++;
    if (r.verdict === "does_not_match" && r.level && r.level in levels) {
      levels[r.level]++;
    }
  }
  return {
    checked,
    counts,
    levels,
    shares:
      checked >= CHECK_PERCENT_MIN
        ? (Object.fromEntries(
            CHECK_VERDICTS.map((v) => [v, wilsonInterval(counts[v], checked)]),
          ) as Record<CheckVerdict, Interval>)
        : null,
  };
}

/** The Check table: a column for people's clips and one for the model's. */
export function checkTable(
  rows: CheckRow[],
  modelRef: string | null,
): { person: CheckColumn; model: CheckColumn } {
  const counted = rows.filter((r) => !r.isDemo);
  return {
    person: checkColumn(counted.filter((r) => r.system === HUMAN_SYSTEM)),
    model: checkColumn(
      modelRef ? counted.filter((r) => r.system === modelRef) : [],
    ),
  };
}

// ─── tone pairs ─────────────────────────────────────────────────────────────

export interface TonePairs {
  answered: number;
  correct: number;
  unsure: number;
  /** Null under 30 answers: counts only. */
  share: Interval | null;
  /** True from 50 answers on. */
  trusted: boolean;
}

/** "Not sure" counts as not correct, as in minimal-pairs.ts. */
export function tonePairs(
  answers: Array<{ system: string; heard: string; isDemo: boolean }>,
  system: string,
): TonePairs {
  const mine = answers.filter((a) => !a.isDemo && a.system === system);
  const correct = mine.filter((a) => a.heard === "target").length;
  return {
    answered: mine.length,
    correct,
    unsure: mine.filter((a) => a.heard === "unsure").length,
    share:
      mine.length >= CHECK_PERCENT_MIN
        ? wilsonInterval(correct, mine.length)
        : null,
    trusted: mine.length >= TONE_PAIR_MIN,
  };
}

// ─── do two listeners agree? ────────────────────────────────────────────────

export interface ListenerAgreement {
  /** Rounds (the same two clips) judged by two or more listeners. */
  sharedRounds: number;
  /** Null under 30 shared rounds, or when it cannot be computed. */
  alpha: number | null;
}

export function listenerAgreement(rounds: ModelRound[]): ListenerAgreement {
  const byPair = new Map<string, Map<string, Outcome>>();
  for (const r of rounds) {
    let judges = byPair.get(r.pairKey);
    if (!judges) byPair.set(r.pairKey, (judges = new Map()));
    // One judgment per listener per pair: the first one stands.
    if (!judges.has(r.annotatorId)) judges.set(r.annotatorId, r.outcome);
  }
  const units = [...byPair.values()].map((j) => [...j.values()]);
  const result = krippendorffAlpha(units, "nominal");
  return {
    sharedRounds: result.units,
    alpha: result.units >= AGREEMENT_MIN_UNITS ? result.alpha : null,
  };
}

// ─── the whole half, for one model ──────────────────────────────────────────

export interface HumanHalf {
  modelRef: string | null;
  preference: Preference;
  axes: AxisTable;
  agreement: ListenerAgreement;
}

export function humanHalf(
  rows: ListenRow[],
  modelRef: string | null,
): HumanHalf {
  const rounds = modelRef ? roundsAgainstHuman(rows, modelRef) : [];
  return {
    modelRef,
    preference: preference(rounds),
    axes: axisTable(rounds),
    agreement: listenerAgreement(rounds),
  };
}
