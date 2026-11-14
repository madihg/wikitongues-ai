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
export function planDraftRestore<D extends ColdDraft & { step: DraftStep }>(
  full: D | null,
  coldRaw: unknown,
): DraftRestore<D> {
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

// ─── The last submitted item of this sitting ────────────────────────────────
//
// The "Saved" strip and "Edit previous" (src/components/episode-frame.tsx)
// need to know what was submitted last, and nothing more: which row to open
// in the edit drawer, and the prompt it belonged to. Kept in sessionStorage
// per kind of work, so it lasts for the sitting (the tab) and survives a
// reload, and is replaced by the next submit.

export type LastSavedType = "pairwise" | "cold" | "edit" | "listen";

export interface LastSaved {
  type: LastSavedType;
  id: string;
  promptText: string;
}

/** One key per kind of work: "annotate", "listen", "check", "tone". */
export function lastSavedKey(surface: string): string {
  return `wt-last-saved-${surface}`;
}

const LAST_SAVED_TYPES: readonly string[] = [
  "pairwise",
  "cold",
  "edit",
  "listen",
];

/** Storage is untrusted: anything that is not a well-formed entry is null. */
export function parseLastSaved(raw: unknown): LastSaved | null {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.type !== "string" || !LAST_SAVED_TYPES.includes(r.type)) {
    return null;
  }
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 64) {
    return null;
  }
  return {
    type: r.type as LastSavedType,
    id: r.id,
    promptText: typeof r.promptText === "string" ? r.promptText : "",
  };
}

/** The first 40 characters of the prompt, with "..." when it was cut. Cut on
 *  whole characters, so a letter is never split from its tone mark. */
export function savedStripText(promptText: string, max = 40): string {
  const chars = Array.from(promptText.trim().normalize("NFC"));
  if (chars.length <= max) return chars.join("");
  let end = max;
  // A combining mark stays with the letter before it.
  while (end < chars.length && /\p{M}/u.test(chars[end])) end++;
  if (end >= chars.length) return chars.join("");
  return `${chars.slice(0, end).join("").trimEnd()}...`;
}
