import { createHash } from "node:crypto";
import { canTrain, type TrainRefusal } from "./can-train";
import { VOICE_TRAIN_MAX_MS } from "./limits";
import {
  buildTrainingManifest,
  type LoopRow,
  type TrainingLine,
} from "./training-manifest";

/**
 * The training plan for a first, internal voice model (worker/first_model.py,
 * stage tts-finetune). Pure: rows in, a plan out.
 *
 * It adds nothing to the rule and removes nothing from it: every line comes
 * from buildTrainingManifest with purpose "cloning", so a clip trains a voice
 * only if canTrain says so (a Check verdict of keep, consent, an upload, the
 * clip's own voice-cloning opt-in, not a test or demo clip, not on a frozen
 * prompt). On top of that it narrows, never widens:
 *
 *  - Igala clips only, and one voice only (a VITS model has one speaker);
 *  - clips longer than VOICE_TRAIN_MAX_MS (25 s) are left out and counted:
 *    the trainer would drop them without a word. Since 2026-11-24 a take can
 *    run five minutes, so a long answer is kept whole and waits to be cut
 *    into pieces;
 *  - clips on a HELD tier are left out. The default holds "open": the clips
 *    marked Open during the November test count as not yet chosen until the
 *    speaker answers (orchestrator decision 8 of Nov 13);
 *  - about a third of the sentences are held out of training, by a hash of
 *    the text, so the same sentence never sits on both sides.
 *
 * The worker refuses a plan whose `guard` is not FIRST_MODEL_GUARD.
 */

export const FIRST_MODEL_GUARD = "canTrain:internal:cloning";
export const DEFAULT_HELD_TIERS: readonly string[] = ["open"];

export interface FirstModelPlan {
  guard: typeof FIRST_MODEL_GUARD;
  /** sha256 of the training ids, as the manifest builder versions them. */
  manifestVersion: string;
  /** The one voice trained (a speaker pseudonym), or null when none qualifies. */
  voice: string | null;
  train: TrainingLine[];
  heldOut: TrainingLine[];
  counts: {
    rows: number;
    /** Rows canTrain refused for voice cloning, by reason. */
    refused: Partial<Record<TrainRefusal, number>>;
    /** Passed the guard, then left out: on a held tier. */
    heldTier: number;
    /** Passed the guard, then left out: not Igala. */
    notIgala: number;
    /** Passed the guard, then left out: another speaker's voice. */
    otherVoice: number;
    /**
     * Passed the guard, then left out: longer than the trainer takes
     * (VOICE_TRAIN_MAX_MS). Kept whole; waits to be cut into pieces.
     */
    tooLong: number;
  };
}

const sentenceKey = (l: TrainingLine) =>
  createHash("sha256").update(l.transcript).digest("hex");

export function buildFirstModelPlan(
  rows: LoopRow[],
  opts: {
    signedUrl: (key: string) => string;
    heldTiers?: readonly string[];
    /** Train this speaker pseudonym; default: the voice with the most audio. */
    voice?: string;
    /** Share of sentences held out of training; default one third. */
    holdOutShare?: number;
  },
): FirstModelPlan {
  const ctx = { scope: "internal", purpose: "cloning" } as const;
  const held = opts.heldTiers ?? DEFAULT_HELD_TIERS;
  const refused: Partial<Record<TrainRefusal, number>> = {};
  for (const r of rows) {
    const v = canTrain(r, ctx);
    if (!v.ok) refused[v.reason] = (refused[v.reason] ?? 0) + 1;
  }

  const passed = buildTrainingManifest(rows, { ...ctx, signedUrl: opts.signedUrl }).lines;
  const chosenTier = passed.filter((l) => !held.includes(l.tier));
  const igala = chosenTier.filter((l) => l.language === "igala");
  const fits = igala.filter((l) => l.durationMs <= VOICE_TRAIN_MAX_MS);

  const seconds = new Map<string, number>();
  for (const l of fits) {
    seconds.set(l.speakerPseudonym, (seconds.get(l.speakerPseudonym) ?? 0) + l.durationMs);
  }
  const voice =
    opts.voice ??
    [...seconds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;
  const mine = fits.filter((l) => l.speakerPseudonym === voice);

  const keys = [...new Set(mine.map(sentenceKey))].sort();
  const share = opts.holdOutShare ?? 1 / 3;
  const nHeld = keys.length >= 3 ? Math.round(keys.length * share) : 0;
  const heldKeys = new Set(keys.slice(0, nHeld));
  const train = mine.filter((l) => !heldKeys.has(sentenceKey(l)));
  const heldOut = mine.filter((l) => heldKeys.has(sentenceKey(l)));

  const ids = train.map((l) => l.id).sort();
  return {
    guard: FIRST_MODEL_GUARD,
    manifestVersion: createHash("sha256").update(ids.join("\n")).digest("hex"),
    voice,
    train,
    heldOut,
    counts: {
      rows: rows.length,
      refused,
      heldTier: passed.length - chosenTier.length,
      notIgala: chosenTier.length - igala.length,
      tooLong: igala.length - fits.length,
      otherVoice: fits.length - mine.length,
    },
  };
}
