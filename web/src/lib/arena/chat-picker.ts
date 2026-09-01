/**
 * Ordering and selection logic for the chat model picker.
 *
 * The picker used to be a wall of toggle pills in registry order, which made
 * the leading model invisible and made it easy to select six billed API calls
 * by accident. This module fixes both with three rules, kept pure so they can
 * be tested without a DOM:
 *
 * 1. ORDER: candidates sort by live Community Agreement Score, best first.
 *    The score comes from the same computation as the scoreboard
 *    (computeMethodMetrics via /api/public/method-metrics) - never from a
 *    hardcoded name. When scores are unavailable the fallback is versionLabel
 *    descending, so newer serving versions still float up.
 *
 * 2. DEFAULT: with no selection in the URL, the top-ranked model is selected
 *    alone. "The leading model" is whatever the data says today.
 *
 * 3. SELECTION: tapping a row replaces the selection (radio-like); a separate
 *    "+ compare" affordance adds up to MAX_COMPARE_MODELS total. The chat
 *    grid renders three columns well; more than that turns comparison into
 *    skimming. Legacy share links may still carry up to MAX_CHAT_MODELS
 *    (chat-selection.ts) - the cap here governs what the picker ADDS, not
 *    what an old URL may resolve.
 */

/** What the picker knows about a candidate before scores arrive. */
export interface PickerCandidate {
  slug: string;
  name: string;
  kind: string;
  ragEnabled: boolean;
  /** Human method label ("retrieval v4", "fine-tuned", ...), derived
   * server-side by approachLabel so client and scoreboard cannot drift. */
  approach: string;
  versionLabel: string | null;
}

/** A candidate joined with its live score (null = not scored yet). */
export interface RankedCandidate extends PickerCandidate {
  score: number | null;
}

/** Hard cap on models the picker will assemble: the chat grid renders up to
 * three columns legibly, and each model is a separate billed API call. */
export const MAX_COMPARE_MODELS = 3;

/**
 * Join candidates with their live scores and sort best-first.
 *
 * Scores are keyed by candidate NAME because that is how computeMethodMetrics
 * keys its scoreboard rows. Ties and unscored rows fall back to versionLabel
 * descending (so "rag-v4" outranks "rag-v3"), then name, so the order is
 * total and stable. Unscored rows always sort below scored ones.
 */
export function rankChatCandidates(
  candidates: readonly PickerCandidate[],
  scoreByName: ReadonlyMap<string, number | null> | null,
): RankedCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreByName?.get(c.name) ?? null }))
    .sort((a, b) => {
      if (a.score !== null || b.score !== null) {
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        if (a.score !== b.score) return b.score - a.score;
      }
      const av = a.versionLabel ?? "";
      const bv = b.versionLabel ?? "";
      if (av !== bv) return bv.localeCompare(av);
      return a.name.localeCompare(b.name);
    });
}

/**
 * The default selection when the URL names no models: the current leader,
 * alone. One model is the honest default - it answers fastest, costs one API
 * call, and comparison is an explicit choice, not an accident.
 */
export function defaultChatSelection(
  ranked: readonly RankedCandidate[],
): string[] {
  return ranked.length > 0 ? [ranked[0].slug] : [];
}

/** Tap a row: the selection becomes exactly that model (radio semantics). */
export function selectOnly(slug: string): string[] {
  return [slug];
}

/**
 * "+ compare": add one more model, preserving order, refusing duplicates and
 * anything past the cap. Returns a fresh array either way so callers can
 * treat the result as the next state.
 */
export function addCompare(
  selected: readonly string[],
  slug: string,
): string[] {
  if (selected.includes(slug) || selected.length >= MAX_COMPARE_MODELS) {
    return [...selected];
  }
  return [...selected, slug];
}

/** Remove one model from the selection (the chip's x). */
export function removeModel(
  selected: readonly string[],
  slug: string,
): string[] {
  return selected.filter((s) => s !== slug);
}

/**
 * Split the ranked list into the rows worth reading first and the long tail
 * behind "show all models".
 *
 * Primary = scored, non-baseline arms: the candidates that might actually be
 * deployed, with evidence attached. Everything else - untuned baselines and
 * unscored legacy arms - collapses. When nothing qualifies as primary (e.g.
 * scores unavailable), everything is primary: a fully collapsed picker would
 * hide all the models.
 */
export function partitionPicker(ranked: readonly RankedCandidate[]): {
  primary: RankedCandidate[];
  tail: RankedCandidate[];
} {
  const primary = ranked.filter(
    (r) => r.score !== null && r.kind !== "baseline",
  );
  if (primary.length === 0) return { primary: [...ranked], tail: [] };
  return {
    primary,
    tail: ranked.filter((r) => r.score === null || r.kind === "baseline"),
  };
}
