/**
 * AUTORATER VALIDATION - measuring what the automatic metrics are worth against
 * the human labels we actually hold.
 *
 * The autorater is a rule, not a model:
 *   1. if BOTH sides score below the inadequacy threshold -> "both_inadequate";
 *   2. else if the two sides are within the tie margin      -> "tie";
 *   3. else the higher-scoring side wins.
 *
 * Both constants are fixed A PRIORI from the inter-gold ceiling, never tuned to
 * maximise agreement - tuning a threshold on the same labels you then report
 * agreement against is how autoraters get to claim numbers they have not earned.
 * The inadequacy threshold is a low quantile of the human-vs-human chrF
 * distribution: "further from the gold than all but the least typical native
 * speaker".
 *
 * ============ WHY THIS VALIDATION IS WEAK, IN NUMBERS ============
 * Figures below are a DATED OBSERVATION (2026-08-09) of a label set that grows
 * as annotators work; validateAutorater() always recomputes them from whatever
 * labels exist at call time, so these comments illustrate the shape of the
 * problem and are never read as data.
 *
 * As of that date: of 781 blind comparisons, 775 are "both inadequate", 5 name
 * a winner and 1 is a tie. Two consequences we refuse to paper over:
 *
 *   - The DECIDED set (n = 5) cannot support any accuracy claim. A 95% Wilson
 *     interval on 5 trials spans roughly 40 percentage points whatever the
 *     result. `requiredNForHalfWidth` tells you what n would be needed.
 *   - Agreement on the both-inadequate set is nearly free: a constant predictor
 *     that says "both inadequate" every time already scores ~99%. So we report
 *     the MAJORITY BASELINE next to the accuracy, and Cohen's kappa, which
 *     corrects for it. If kappa is near zero, the autorater has learned the base
 *     rate and nothing else, and the report must say exactly that.
 */

import { wilsonInterval, type Interval } from "./stats";
import { percentile } from "./stats";

export type HumanVerdict = "a" | "b" | "tie" | "both_inadequate";
export type AutoVerdict = HumanVerdict;

export interface OutputSignal {
  /** Best-of-references chrF for this output. Null when the prompt has no gold. */
  chrf: number | null;
  /** Language gate verdict. */
  isIgala: boolean;
  langTop: string;
  langLowConfidence: boolean;
  /** Human failure tags recorded for THIS side, if any. */
  failureTags: string[];
}

export interface HumanCase {
  comparisonId: string;
  promptId: string;
  winner: HumanVerdict;
  a: OutputSignal;
  b: OutputSignal;
}

export interface AutoraterThresholds {
  /** chrF below this on BOTH sides -> both_inadequate. */
  inadequate: number;
  /** |chrF_a - chrF_b| below this -> tie. */
  tieMargin: number;
  /** Quantile of the human-vs-human chrF distribution used for `inadequate`. */
  quantile: number;
  /** How many human-vs-human samples the quantile was taken from. */
  nCeilingSamples: number;
}

export const DEFAULT_TIE_MARGIN = 0.05;
export const DEFAULT_INADEQUATE_QUANTILE = 0.1;

/**
 * Fix the inadequacy threshold from the inter-gold ceiling distribution, not
 * from the labels being predicted. `goldChrf` is the flat list of leave-one-out
 * human-vs-human chrF values produced by the eval runner.
 */
export function calibrateThresholds(
  goldChrf: number[],
  quantile = DEFAULT_INADEQUATE_QUANTILE,
  tieMargin = DEFAULT_TIE_MARGIN,
): AutoraterThresholds {
  const sorted = [...goldChrf].sort((a, b) => a - b);
  return {
    // With no ceiling data at all, fall back to a stated constant rather than
    // silently picking 0 (which would call nothing inadequate).
    inadequate: sorted.length > 0 ? percentile(sorted, quantile) : 0.2,
    tieMargin,
    quantile,
    nCeilingSamples: sorted.length,
  };
}

/** Apply the rule. Sides with no gold score are treated as unscorable (0). */
export function autoVerdict(
  a: OutputSignal,
  b: OutputSignal,
  t: AutoraterThresholds,
): AutoVerdict {
  const sa = a.chrf ?? 0;
  const sb = b.chrf ?? 0;
  if (sa < t.inadequate && sb < t.inadequate) return "both_inadequate";
  if (Math.abs(sa - sb) < t.tieMargin) return "tie";
  return sa > sb ? "a" : "b";
}

export interface SubsetAgreement {
  n: number;
  agree: number;
  accuracy: Interval;
  /** Human-readable statement of what this subset can and cannot support. */
  note: string;
}

export interface LangGateValidation {
  /**
   * Outputs a human tagged `not_igala` or `wrong_language`. The gate should
   * call these non-Igala.
   */
  nTagged: number;
  nTaggedDetected: number;
  recall: Interval;
  /**
   * Outputs with failure tags that are NOT language tags. The gate calling
   * these non-Igala is a false alarm on the only contrast we can measure -
   * though note these outputs were still judged inadequate for other reasons,
   * so this is an upper bound on the false-alarm rate, not a clean estimate.
   */
  nOtherTagged: number;
  nOtherFlagged: number;
  falseAlarmUpperBound: Interval;
  note: string;
}

export interface AutoraterValidation {
  thresholds: AutoraterThresholds;
  /** Agreement across every comparison, whatever the human said. */
  overall: SubsetAgreement;
  /** The 5-ish comparisons where a human actually named a winner. */
  decided: SubsetAgreement;
  /**
   * The only FAIR test of the ranking rule: decided comparisons where BOTH
   * sides sit on a prompt that has community gold, so the autorater actually
   * had a reference to score against. A decided comparison on a prompt outside
   * the gold-backed bank gives the autorater nothing to work with, and counting
   * it as a miss would overstate how badly the rule performs - just as counting
   * it as a hit would flatter it. We report it separately.
   */
  decidedScorable: SubsetAgreement;
  /** Comparisons where the human rejected both sides (the large majority). */
  bothInadequate: SubsetAgreement;
  ties: SubsetAgreement;
  /** What a constant predictor of the most common label would score. */
  majorityBaseline: { label: HumanVerdict; accuracy: number; n: number };
  /**
   * Cohen's kappa on the binary contrast "both inadequate vs anything else".
   * Near 0 means the autorater has reproduced the base rate and nothing more.
   */
  kappaInadequate: number;
  /** How many decided comparisons would be needed for a +/-10pt interval. */
  requiredDecidedFor10pt: number;
  langGate: LangGateValidation;
  /** Verdict-vs-verdict confusion counts: human -> auto -> count. */
  confusion: Record<string, Record<string, number>>;
  /** Plain-English headline, safe to print verbatim. */
  headline: string;
}

const LANGUAGE_FAILURE_TAGS = new Set(["not_igala", "wrong_language"]);

function subset(
  cases: HumanCase[],
  predicate: (c: HumanCase) => boolean,
  t: AutoraterThresholds,
  note: (n: number) => string,
): SubsetAgreement {
  const rows = cases.filter(predicate);
  const agree = rows.filter(
    (c) => autoVerdict(c.a, c.b, t) === c.winner,
  ).length;
  return {
    n: rows.length,
    agree,
    accuracy: wilsonInterval(agree, rows.length),
    note: note(rows.length),
  };
}

/**
 * n needed for a 95% Wilson half-width of `halfWidth` at the worst case p = 0.5.
 * n ~= (z / halfWidth)^2 * 0.25.
 */
export function requiredNForHalfWidth(halfWidth: number): number {
  const z = 1.959963984540054;
  return Math.ceil((z / halfWidth) ** 2 * 0.25);
}

function cohensKappa(cases: HumanCase[], t: AutoraterThresholds): number {
  if (cases.length === 0) return 0;
  const n = cases.length;
  let bothBoth = 0;
  let humanOnly = 0;
  let autoOnly = 0;
  let neither = 0;
  for (const c of cases) {
    const h = c.winner === "both_inadequate";
    const a = autoVerdict(c.a, c.b, t) === "both_inadequate";
    if (h && a) bothBoth++;
    else if (h && !a) humanOnly++;
    else if (!h && a) autoOnly++;
    else neither++;
  }
  const po = (bothBoth + neither) / n;
  const humanYes = (bothBoth + humanOnly) / n;
  const autoYes = (bothBoth + autoOnly) / n;
  const pe = humanYes * autoYes + (1 - humanYes) * (1 - autoYes);
  if (pe >= 1) return 0;
  return (po - pe) / (1 - pe);
}

function validateLangGate(cases: HumanCase[]): LangGateValidation {
  const sides: OutputSignal[] = [];
  for (const c of cases) {
    sides.push(c.a, c.b);
  }
  const tagged = sides.filter((s) =>
    s.failureTags.some((tag) => LANGUAGE_FAILURE_TAGS.has(tag)),
  );
  const otherTagged = sides.filter(
    (s) =>
      s.failureTags.length > 0 &&
      !s.failureTags.some((tag) => LANGUAGE_FAILURE_TAGS.has(tag)),
  );
  const detected = tagged.filter((s) => !s.isIgala).length;
  const flagged = otherTagged.filter((s) => !s.isIgala).length;

  return {
    nTagged: tagged.length,
    nTaggedDetected: detected,
    recall: wilsonInterval(detected, tagged.length),
    nOtherTagged: otherTagged.length,
    nOtherFlagged: flagged,
    falseAlarmUpperBound: wilsonInterval(flagged, otherTagged.length),
    note:
      tagged.length === 0
        ? "No output in the corpus carries a language failure tag (not_igala / wrong_language), so the language gate has NO human ground truth here at all."
        : tagged.length < 30
          ? `Only ${tagged.length} outputs carry a language failure tag. Any recall figure from this sample is uninformative - ${requiredNForHalfWidth(0.1)} would be needed for a +/-10pt interval.`
          : `Validated against ${tagged.length} human-tagged outputs.`,
  };
}

export function validateAutorater(
  cases: HumanCase[],
  thresholds: AutoraterThresholds,
): AutoraterValidation {
  const t = thresholds;

  const overall = subset(
    cases,
    () => true,
    t,
    (n) =>
      `All ${n} comparisons. Read this next to the majority baseline below - the label distribution is extremely skewed, so a high number here is close to free.`,
  );
  const decided = subset(
    cases,
    (c) => c.winner === "a" || c.winner === "b",
    t,
    (n) =>
      n === 0
        ? "No human has named a winner in any comparison. The autorater's ranking behaviour is entirely unvalidated."
        : `Only ${n} comparison(s) name a winner. This CANNOT support an accuracy claim: a 95% interval on ${n} trials is wider than the effect anyone cares about. ${requiredNForHalfWidth(0.1)} decided comparisons would be needed for a +/-10 point interval.`,
  );
  const decidedScorable = subset(
    cases,
    (c) =>
      (c.winner === "a" || c.winner === "b") &&
      c.a.chrf !== null &&
      c.b.chrf !== null,
    t,
    (n) =>
      n === 0
        ? "Not one human-decided comparison sits on a prompt with community gold, so the ranking rule has never been given a fair test. Every 'miss' in the row above is the autorater guessing with no reference at all."
        : `${n} human-decided comparison(s) where the autorater actually had gold to score against. This is the only fair test of its ranking behaviour, and ${requiredNForHalfWidth(0.1)} would be needed to make it meaningful.`,
  );
  const bothInadequate = subset(
    cases,
    (c) => c.winner === "both_inadequate",
    t,
    (n) =>
      `${n} comparisons where the human rejected both sides. Agreement here mostly measures whether the threshold is low enough, not whether the metric can judge Igala.`,
  );
  const ties = subset(
    cases,
    (c) => c.winner === "tie",
    t,
    (n) => `${n} tie(s).`,
  );

  // Majority baseline: the accuracy of always predicting the most common label.
  const labelCounts = new Map<HumanVerdict, number>();
  for (const c of cases) {
    labelCounts.set(c.winner, (labelCounts.get(c.winner) ?? 0) + 1);
  }
  let majorityLabel: HumanVerdict = "both_inadequate";
  let majorityCount = 0;
  for (const [label, count] of labelCounts) {
    if (count > majorityCount) {
      majorityCount = count;
      majorityLabel = label;
    }
  }

  const confusion: Record<string, Record<string, number>> = {};
  for (const c of cases) {
    const auto = autoVerdict(c.a, c.b, t);
    confusion[c.winner] ??= {};
    confusion[c.winner][auto] = (confusion[c.winner][auto] ?? 0) + 1;
  }

  const kappa = cohensKappa(cases, t);
  const langGate = validateLangGate(cases);

  const acc = overall.accuracy;
  const baselineAcc = cases.length > 0 ? majorityCount / cases.length : 0;
  const headline =
    cases.length === 0
      ? "No human comparisons available: the autorater is entirely unvalidated."
      : `The autorater agrees with native speakers on ${(acc.mean * 100).toFixed(1)}% of the labels we hold (n=${cases.length}, 95% CI ${(acc.ciLow * 100).toFixed(1)}-${(acc.ciHigh * 100).toFixed(1)}%). Always guessing "${majorityLabel}" would score ${(baselineAcc * 100).toFixed(1)}%, so the honest measure is Cohen's kappa = ${kappa.toFixed(3)}${
          kappa < 0.2
            ? " - which is near zero: on this label set the autorater is reproducing the base rate, not demonstrating judgment."
            : "."
        } Only ${decided.n} comparison(s) name a winner, and only ${decidedScorable.n} of those sit on a prompt with community gold, so its ability to RANK two models is essentially untested.`;

  return {
    thresholds: t,
    overall,
    decided,
    decidedScorable,
    bothInadequate,
    ties,
    majorityBaseline: {
      label: majorityLabel,
      accuracy: baselineAcc,
      n: cases.length,
    },
    kappaInadequate: kappa,
    requiredDecidedFor10pt: requiredNForHalfWidth(0.1),
    langGate,
    confusion,
    headline,
  };
}
