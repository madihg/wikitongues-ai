import {
  MIN_JUDGMENTS,
  MIN_LISTENERS,
  STRONG_JUDGMENTS,
} from "@/lib/speech/decision";

/**
 * How much a speech number can be trusted, as one word shown next to it.
 *
 * A percentage from eight rounds looks exactly like a percentage from eight
 * hundred. So the page never prints one without saying how much evidence is
 * behind it, and below the first threshold it prints counts only. These are
 * starting values (decision D10 of the dashboard spec), kept in this one
 * file so they can be changed in one place.
 */

// ─── people: rounds where a listener compared the model with a person ───────

export const HUMAN_TIERS = {
  early: 30,
  readable: 100,
  readableSentences: 50,
  ranking: MIN_JUDGMENTS,
  rankingListeners: MIN_LISTENERS,
  strong: STRONG_JUDGMENTS,
} as const;

export type HumanTier = "Too few" | "Early" | "Readable" | "Ranking" | "Strong";

export function humanTier(
  rounds: number,
  sentences: number,
  listeners: number,
): HumanTier {
  const t = HUMAN_TIERS;
  if (rounds < t.early) return "Too few";
  if (listeners >= t.rankingListeners) {
    if (rounds >= t.strong) return "Strong";
    if (rounds >= t.ranking) return "Ranking";
  }
  if (rounds >= t.readable && sentences >= t.readableSentences)
    return "Readable";
  return "Early";
}

/** What each word means, in one plain sentence. Shown under the word. */
export const HUMAN_TIER_MEANING: Record<HumanTier, string> = {
  "Too few": `Fewer than ${HUMAN_TIERS.early} rounds. Counts only, no percentage.`,
  Early: `${HUMAN_TIERS.early} to ${HUMAN_TIERS.readable - 1} rounds. The range is wide, about 17 points either way at ${HUMAN_TIERS.early} rounds.`,
  Readable: `${HUMAN_TIERS.readable} rounds or more, on ${HUMAN_TIERS.readableSentences} sentences or more. About 10 points either way.`,
  Ranking: `${HUMAN_TIERS.ranking} rounds or more, from ${HUMAN_TIERS.rankingListeners} listeners or more. Enough to rank two systems. About 6 points either way.`,
  Strong: `${HUMAN_TIERS.strong} rounds or more, from ${HUMAN_TIERS.rankingListeners} listeners or more. About 4 points either way.`,
};

/** Below this the page shows counts and no percentage. */
export const showsPercent = (tier: HumanTier) => tier !== "Too few";

const more = (n: number, one: string, many: string) =>
  `${n} more ${n === 1 ? one : many}`;

/**
 * The distance to the next word, as a sentence: "22 more rounds to reach
 * Early." Null at the top tier.
 */
export function nextHumanTier(
  rounds: number,
  sentences: number,
  listeners: number,
): string | null {
  const t = HUMAN_TIERS;
  const tier = humanTier(rounds, sentences, listeners);
  const needs: string[] = [];
  let target: HumanTier;
  if (tier === "Too few") {
    target = "Early";
    needs.push(more(t.early - rounds, "round", "rounds"));
  } else if (tier === "Early") {
    target = "Readable";
    if (rounds < t.readable)
      needs.push(more(t.readable - rounds, "round", "rounds"));
    if (sentences < t.readableSentences) {
      needs.push(
        more(t.readableSentences - sentences, "sentence", "sentences"),
      );
    }
  } else if (tier === "Readable") {
    target = "Ranking";
    if (rounds < t.ranking)
      needs.push(more(t.ranking - rounds, "round", "rounds"));
    if (listeners < t.rankingListeners) {
      needs.push(more(t.rankingListeners - listeners, "listener", "listeners"));
    }
  } else if (tier === "Ranking") {
    target = "Strong";
    needs.push(more(t.strong - rounds, "round", "rounds"));
  } else {
    return null;
  }
  return `${needs.join(" and ")} to reach ${target}.`;
}

// ─── the exam: clips the recogniser is scored on ────────────────────────────

export const EXAM_TIERS = {
  early: 50,
  trustworthy: 300,
  trustworthySpeakers: 3,
  /** Marked vowels needed before the tone number is within about 3 points. */
  toneVowels: 1000,
} as const;

export type ExamTier = "Smoke test" | "Early" | "Trustworthy";

/**
 * `locked` false means the clips scored are not the locked exam (a run made
 * by hand on whatever clips exist): a smoke test, whatever its size.
 */
export function examTier(
  clips: number,
  speakers: number,
  locked = true,
): ExamTier {
  const t = EXAM_TIERS;
  if (!locked || clips < t.early) return "Smoke test";
  if (clips >= t.trustworthy && speakers >= t.trustworthySpeakers)
    return "Trustworthy";
  return "Early";
}

export const EXAM_TIER_MEANING: Record<ExamTier, string> = {
  "Smoke test": `Fewer than ${EXAM_TIERS.early} exam clips, or clips that are not a locked exam. It shows the pipeline runs. The numbers are in grey and nothing is called better or worse.`,
  Early: `${EXAM_TIERS.early} to ${EXAM_TIERS.trustworthy - 1} exam clips. A difference is named only when its range leaves no doubt.`,
  Trustworthy: `${EXAM_TIERS.trustworthy} exam clips or more, from ${EXAM_TIERS.trustworthySpeakers} speakers or more who are in no training set.`,
};

export function nextExamTier(
  clips: number,
  speakers: number,
  locked = true,
): string | null {
  const t = EXAM_TIERS;
  const tier = examTier(clips, speakers, locked);
  if (tier === "Trustworthy") return null;
  if (!locked) {
    return `Lock ${t.early} exam clips and score the model on them to reach Early.`;
  }
  if (tier === "Smoke test") {
    return `${more(t.early - clips, "exam clip", "exam clips")} to reach Early.`;
  }
  const needs: string[] = [];
  if (clips < t.trustworthy)
    needs.push(more(t.trustworthy - clips, "exam clip", "exam clips"));
  if (speakers < t.trustworthySpeakers) {
    needs.push(more(t.trustworthySpeakers - speakers, "speaker", "speakers"));
  }
  return `${needs.join(" and ")} to reach Trustworthy.`;
}

// ─── smaller thresholds, each named where it is used ────────────────────────

export const AXIS_GAP_MIN = 30; // rated rounds per line before a gap is shown
export const AXIS_QUOTE_MIN = 100; // rated rounds per line before it is quoted
export const CHECK_PERCENT_MIN = 30; // checked clips per column before a percentage
export const CHECK_TRUST_MIN = 100; // checked clips per column to trust it
export const CHECK_LEVEL_MIN = 5; // cases of one level before it is more than a count
export const TONE_PAIR_MIN = 50; // answers before the tone pair score is trusted
export const AGREEMENT_MIN_UNITS = 30; // rounds judged by two listeners
