/**
 * Episode-draft keys and the restore rule for src/components/
 * annotation-interface.tsx, pure so the node test environment can hold them.
 *
 * Two drafts are kept per episode (sessionStorage, per tab, as before):
 *   - the FULL draft under the A/B output ids: the verdict, tags, rubric and
 *     corrections are about those two outputs and mean nothing for another
 *     pair, so they come back only when the same pair comes back;
 *   - the COLD part (the speaker's own answer, its gloss, the question in
 *     Igala, and whether it was locked) under the prompt: it was written
 *     before any output was shown, so it belongs to the question, not the
 *     pair, and must survive a pair change (an arm joining the pool
 *     re-derives the pair on the next load).
 */

export type DraftStep = "prompt" | "pairwise" | "score";

export interface ColdDraft {
  coldAnswer: string;
  englishGloss: string;
  instructionIg: string;
  coldLocked: boolean;
}

/** The full draft's key: unchanged from before the split, so drafts saved
 *  before it still restore. */
export function pairDraftKey(outputAId: string, outputBId: string): string {
  return `wt-episode-${outputAId}:${outputBId}`;
}

/** The cold part's key, by the public prompt code. */
export function coldDraftKey(promptId: string): string {
  return `wt-episode-cold-${promptId}`;
}

/** The cold fields of any draft-shaped value, sanitized (storage is
 *  untrusted: an old or hand-edited value must not break the page). Null
 *  when there is nothing to restore. */
export function coldPartOf(raw: unknown): ColdDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const cold: ColdDraft = {
    coldAnswer: str(o.coldAnswer),
    englishGloss: str(o.englishGloss),
    instructionIg: str(o.instructionIg),
    coldLocked: o.coldLocked === true,
  };
  const empty =
    !cold.coldLocked &&
    !cold.coldAnswer.trim() &&
    !cold.englishGloss.trim() &&
    !cold.instructionIg.trim();
  return empty ? null : cold;
}

export type DraftRestore<D> =
  | { kind: "full"; draft: D }
  | { kind: "cold"; cold: ColdDraft; step: DraftStep }
  | null;

/**
 * What to restore when a task loads.
 *   - The same pair came back: the full draft, with the cold part laid over
 *     it (the cold part is written with every save, so it is never older),
 *     moved to the pairwise step if only the cold part was locked.
 *   - The pair changed: the cold part alone. A locked answer resumes at the
 *     pairwise step with the answer kept: it was written before any output
 *     was shown, so it is still source-free, while the authoring boxes must
 *     not reopen once outputs have been seen. An unlocked one resumes where
 *     it was being written.
 *   - Neither: nothing.
 */
export function planDraftRestore<
  D extends ColdDraft & { step: DraftStep },
>(full: D | null, coldRaw: unknown): DraftRestore<D> {
  const cold = coldPartOf(coldRaw);
  if (full) {
    // A lock is never undone: an unlocked cold part over a locked full draft
    // (only reachable through a damaged store) would reopen the authoring
    // boxes after outputs were seen.
    if (!cold || (full.coldLocked && !cold.coldLocked))
      return { kind: "full", draft: full };
    const step: DraftStep =
      cold.coldLocked && !full.coldLocked ? "pairwise" : full.step;
    return { kind: "full", draft: { ...full, ...cold, step } };
  }
  if (cold) {
    return {
      kind: "cold",
      cold,
      step: cold.coldLocked ? "pairwise" : "prompt",
    };
  }
  return null;
}
