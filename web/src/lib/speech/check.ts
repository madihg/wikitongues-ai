import { normaliseForScoring } from "./normalise";

/**
 * The Check screen's rules, shared by the routes and the screen. Client-safe.
 */

export const CHECK_VERDICTS = ["matches", "does_not_match", "cannot_hear"] as const;
export type CheckVerdict = (typeof CHECK_VERDICTS)[number];

/** What one verdict does to the clip's reviewStatus. */
export const VERDICT_STATUS: Record<CheckVerdict, "keep" | "wrong_text" | "bad_audio"> = {
  matches: "keep",
  does_not_match: "wrong_text",
  cannot_hear: "bad_audio",
};

/** The words of a written answer, as the reviewer sees and points at them. */
export function answerWords(answer: string): string[] {
  return answer.split(/\s+/).filter(Boolean);
}

/**
 * Which words differ between the written answer and a machine transcript, by
 * position in each. Words compare after the scoring normaliser (case,
 * punctuation and NFC), tones kept: a missing tone mark on the machine side
 * shows as a difference, which is the point of the second look. A longest
 * common subsequence of equal words is "the same"; everything else differs.
 */
export function differingWords(
  answer: string,
  transcript: string,
): { answer: number[]; transcript: number[] } {
  const a = answerWords(answer);
  const t = answerWords(transcript);
  const norm = (w: string) => normaliseForScoring(w);
  const an = a.map(norm);
  const tn = t.map(norm);
  // LCS table.
  const m = an.length;
  const n = tn.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        an[i] === tn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const sameA = new Set<number>();
  const sameT = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (an[i] === tn[j]) {
      sameA.add(i++);
      sameT.add(j++);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return {
    answer: a.map((_, k) => k).filter((k) => !sameA.has(k)),
    transcript: t.map((_, k) => k).filter((k) => !sameT.has(k)),
  };
}
