import {
  defaultVersion,
  latestEval,
  recognitionVersions,
  voiceVersions,
} from "./auto";
import type { SpeechMeasureData } from "./data";
import { EMPTY } from "./copy";
import { preference, roundsAgainstHuman, systemsAgainstHuman } from "./human";
import { examTier, type ExamTier, type HumanTier } from "./tiers";

/**
 * The two lines of the Speech tile on Today, built from the same data and the
 * same functions as the Speech model view, for the version that view opens
 * on. So the tile and the page cannot show two different numbers.
 */
export interface SpeechHeadline {
  /** Null until a recogniser has been scored on the exam. */
  recognition: {
    modelRef: string;
    /** Letters wrong out of 100, one decimal. */
    lettersWrongPer100: number;
    examClips: number;
    tier: ExamTier;
  } | null;
  /** Null until a listener has compared a model with a person. */
  listeners: {
    modelRef: string;
    chosen: number;
    rounds: number;
    tier: HumanTier;
  } | null;
  held: { clips: number; minutes: number };
  /** The sentence to show when both halves are null. */
  empty: string;
}

export function speechHeadline(data: SpeechMeasureData): SpeechHeadline {
  const asr = defaultVersion(recognitionVersions(data));
  const scored = asr ? latestEval(data.evals, asr) : null;

  const heard = systemsAgainstHuman(data.listen);
  const voice = defaultVersion(voiceVersions(data, heard));
  const pref = voice
    ? preference(roundsAgainstHuman(data.listen, voice))
    : null;

  return {
    recognition: scored
      ? {
          modelRef: scored.modelRef,
          lettersWrongPer100: Math.round(scored.cer * 1000) / 10,
          examClips: scored.nClips,
          tier: examTier(scored.nClips, scored.speakers),
        }
      : null,
    listeners:
      voice && pref && pref.rounds > 0
        ? {
            modelRef: voice,
            chosen: pref.model,
            rounds: pref.rounds,
            tier: pref.tier,
          }
        : null,
    held: { clips: data.held.clips, minutes: data.held.minutes },
    empty: EMPTY.noModel,
  };
}
