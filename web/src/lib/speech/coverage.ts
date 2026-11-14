/**
 * Coverage-first queue: which prompt does the pool need a clip of most?
 * A prompt's score counts the clips already held in four cells, and a LOWER
 * score is served FIRST:
 *   1. speaker   clips this speaker already has on the prompt
 *   2. prompt    clips anyone holds on the prompt (zero first)
 *   3. dialect   clips on the prompt in the speaker's dialect
 *   4. tone pair clips on the prompt's tone minimal pair, when it has one
 *      (the field does not exist on Prompt yet, so today this cell is 0)
 * The cells are compared in that order, so a prompt nobody has recorded
 * (prompt cell 0) ranks ahead of every prompt that has a clip, and a prompt
 * the speaker already covers ranks last. Equal scores keep the caller's
 * existing order (Array.prototype.sort is stable), so this only re-orders;
 * it never adds or drops a prompt.
 */

export interface CoverageClip {
  promptId: string;
  /** The recorder; null for a synthesised clip. */
  speakerId: string | null;
  dialect: string | null;
  /** The clip's prompt's tone minimal pair key, when the field exists. */
  tonePairKey?: string | null;
}

export interface CoveragePrompt {
  id: string;
  tonePairKey?: string | null;
}

export interface CoverageSpeaker {
  id: string;
  dialect?: string | null;
}

const BASE = 1000;
const cell = (n: number) => Math.min(n, BASE - 1);

export function coverageScore(
  prompt: CoveragePrompt,
  clips: CoverageClip[],
  speaker: CoverageSpeaker,
): number {
  let own = 0;
  let held = 0;
  let inDialect = 0;
  let inPair = 0;
  for (const c of clips) {
    if (c.promptId === prompt.id) {
      held++;
      if (c.speakerId === speaker.id) own++;
      if (speaker.dialect && c.dialect === speaker.dialect) inDialect++;
    }
    if (prompt.tonePairKey && c.tonePairKey === prompt.tonePairKey) inPair++;
  }
  return (
    ((cell(own) * BASE + cell(held)) * BASE + cell(inDialect)) * BASE +
    cell(inPair)
  );
}

/** The prompts, least covered first; equal scores keep their given order. */
export function rankByCoverage<P extends CoveragePrompt>(
  prompts: P[],
  clips: CoverageClip[],
  speaker: CoverageSpeaker,
): P[] {
  return prompts
    .map((p, i) => ({ p, i, s: coverageScore(p, clips, speaker) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.p);
}
