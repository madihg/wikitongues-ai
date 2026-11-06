import { abSwap } from "@/lib/pairing";
import { toneStrip } from "./normalise";

/**
 * Tone minimal pairs (PRD US-011), the pure half. A researcher marks a
 * train-side prompt with the spelling its clips are meant to say (the target)
 * and a foil that differs from it in tone marks only. The Listen lane then
 * asks, for each clip of that prompt, "Which word did you hear?", offering the
 * two spellings in an order that does not reveal the target. A listener may
 * say they are not sure. Tone accuracy per system is correct over answered,
 * with "not sure" counted as not correct.
 */

/**
 * The coverage cell these items fill. PR G's coverageScore counts a cell as
 * covered when this many minimal-pair items exist for a speaker or dialect;
 * it imports the key from here so the two never drift.
 */
export const MINIMAL_PAIR_CELL = "tone_minimal_pair";

export const MAX_SPELLING_CHARS = 200;

export function minimalPairCoverage(
  pairs: Array<{ promptId: string }>,
): { cell: typeof MINIMAL_PAIR_CELL; items: number } {
  return { cell: MINIMAL_PAIR_CELL, items: new Set(pairs.map((p) => p.promptId)).size };
}

export type PairCheck =
  | { ok: true; target: string; foil: string }
  | { ok: false; error: string };

/** Two non-empty spellings, different, with the same letters once tone marks are removed. */
export function validatePair(target: unknown, foil: unknown): PairCheck {
  if (typeof target !== "string" || typeof foil !== "string") {
    return { ok: false, error: "Both spellings are required." };
  }
  const t = target.normalize("NFC").trim();
  const f = foil.normalize("NFC").trim();
  if (!t || !f) return { ok: false, error: "Both spellings are required." };
  if (t.length > MAX_SPELLING_CHARS || f.length > MAX_SPELLING_CHARS) {
    return { ok: false, error: "A spelling can be at most 200 characters." };
  }
  if (t === f) return { ok: false, error: "The two spellings must differ." };
  if (toneStrip(t) !== toneStrip(f)) {
    return { ok: false, error: "The two spellings may differ in tone marks only." };
  }
  return { ok: true, target: t, foil: f };
}

export interface PairSpellings {
  targetSpelling: string;
  foilSpelling: string;
}

export type Heard = "target" | "foil" | "unsure";

/** The heard spelling (null for "not sure") as a stored answer, or "invalid". */
export function scoreAnswer(
  pair: PairSpellings,
  heardSpelling: string | null,
): { heard: Heard; correct: boolean } | "invalid" {
  if (heardSpelling === null) return { heard: "unsure", correct: false };
  if (typeof heardSpelling !== "string") return "invalid";
  const h = heardSpelling.normalize("NFC").trim();
  if (h === pair.targetSpelling.normalize("NFC")) return { heard: "target", correct: true };
  if (h === pair.foilSpelling.normalize("NFC")) return { heard: "foil", correct: false };
  return "invalid";
}

/** Both spellings, in an order fixed per listener and prompt (the arena's abSwap). */
export function optionsFor(
  pair: PairSpellings,
  annotatorId: string,
  promptCode: string,
): Array<{ text: string }> {
  const flip = abSwap(annotatorId, `${promptCode}:minimal-pair`);
  const two = [pair.targetSpelling, pair.foilSpelling];
  return (flip ? two.reverse() : two).map((text) => ({ text }));
}

export interface ToneAccuracy {
  answered: number;
  correct: number;
  unsure: number;
  /** correct over answered. */
  accuracy: number;
}

export function toneAccuracy(
  answers: Array<{ system: string; heard: string; isDemo: boolean }>,
): Record<string, ToneAccuracy> {
  const out: Record<string, ToneAccuracy> = {};
  for (const a of answers) {
    if (a.isDemo) continue;
    const cur = (out[a.system] ??= { answered: 0, correct: 0, unsure: 0, accuracy: 0 });
    cur.answered++;
    if (a.heard === "target") cur.correct++;
    if (a.heard === "unsure") cur.unsure++;
  }
  for (const v of Object.values(out)) v.accuracy = v.correct / v.answered;
  return out;
}
