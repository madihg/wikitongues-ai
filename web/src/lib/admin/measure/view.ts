import {
  defaultComparison,
  defaultVersion,
  latestEval,
  levelsBlock,
  recognitionBlock,
  recognitionVersions,
  voiceBlock,
  voiceVersions,
  type LevelsBlock,
  type RecognitionBlock,
  type VersionOption,
  type VoiceBlock,
} from "./auto";
import type { Held, SpeechMeasureData } from "./data";
import {
  HUMAN_SYSTEM,
  checkTable,
  humanHalf,
  preference,
  roundsAgainstHuman,
  splitRepeats,
  systemsAgainstHuman,
  tonePairs,
  type CheckColumn,
  type HumanHalf,
  type TonePairs,
} from "./human";
import { examTier, type ExamTier, type HumanTier } from "./tiers";

/**
 * Everything the Measure page draws, for one choice of system and version.
 * Pure: the page loads the data once, calls this, and hands each half its
 * part. An empty database gives a complete view with nothing in it, so the
 * page never has a state it cannot draw.
 */

export type System = "asr" | "tts";

export interface VersionSummary {
  system: System;
  modelRef: string;
  label: string;
  promoted: boolean;
  regressed: boolean;
  retrainRequired: boolean;
  scoredAt: string | null;
  /** First eight characters of the clip set's id: two rows compare only when it matches. */
  exam: string | null;
  examTier: ExamTier | null;
  lettersWrong: number | null;
  tonesWrong: number | null;
  roundTripGapPoints: number | null;
  listeners: {
    chosen: number;
    decided: number;
    rounds: number;
    tier: HumanTier;
  } | null;
}

export interface MeasureView {
  system: System;
  held: Held;
  autoTableReady: boolean;
  recognition: {
    options: VersionOption[];
    selected: string | null;
    compare: string | null;
    block: RecognitionBlock | null;
  };
  voice: {
    options: VersionOption[];
    selected: string | null;
    block: VoiceBlock | null;
  };
  levels: LevelsBlock;
  human: HumanHalf;
  checks: { person: CheckColumn; model: CheckColumn };
  tone: { person: TonePairs; model: TonePairs | null };
  versions: VersionSummary[];
}

export interface MeasureParams {
  system?: string;
  /** The version on screen. */
  v?: string;
  /** The version it is compared with. "none" turns the comparison off. */
  vs?: string;
}

const known = (options: VersionOption[], ref: string | undefined) =>
  ref && options.some((o) => o.modelRef === ref) ? ref : null;

export function buildMeasureView(
  data: SpeechMeasureData,
  params: MeasureParams = {},
): MeasureView {
  const system: System = params.system === "tts" ? "tts" : "asr";

  const asrOptions = recognitionVersions(data);
  const asr =
    (system === "asr" ? known(asrOptions, params.v) : null) ??
    defaultVersion(asrOptions);
  const compare =
    system === "asr" && params.vs === "none"
      ? null
      : ((system === "asr" ? known(asrOptions, params.vs) : null) ??
        defaultComparison(asrOptions, asr));

  const heard = systemsAgainstHuman(data.listen);
  const ttsOptions = voiceVersions(data, heard);
  const tts =
    (system === "tts" ? known(ttsOptions, params.v) : null) ??
    defaultVersion(ttsOptions);

  const summaries: VersionSummary[] = [
    ...asrOptions.map((o): VersionSummary => {
      const e = latestEval(data.evals, o.modelRef);
      const row = data.versions.find(
        (v) => v.system === "asr" && v.modelRef === o.modelRef,
      );
      const block = recognitionBlock(data, o.modelRef, null);
      return {
        system: "asr",
        modelRef: o.modelRef,
        label: o.label,
        promoted: o.promoted,
        regressed: row?.regressed ?? false,
        retrainRequired: row?.retrainRequired ?? false,
        scoredAt: e?.createdAt ?? null,
        exam: e ? e.manifestVersion.slice(0, 8) : null,
        examTier: e ? examTier(e.nClips, e.speakers, e.onLockedExam) : null,
        lettersWrong: e?.cer ?? null,
        tonesWrong: block?.numbers.find((n) => n.key === "ter")?.value ?? null,
        roundTripGapPoints: null,
        listeners: null,
      };
    }),
    ...ttsOptions.map((o): VersionSummary => {
      const row = data.versions.find(
        (v) => v.system === "tts" && v.modelRef === o.modelRef,
      );
      const trip = voiceBlock(data, o.modelRef);
      const pref = preference(
        splitRepeats(roundsAgainstHuman(data.listen, o.modelRef)).first,
      );
      return {
        system: "tts",
        modelRef: o.modelRef,
        label: o.label,
        promoted: o.promoted,
        regressed: row?.regressed ?? false,
        retrainRequired: row?.retrainRequired ?? false,
        scoredAt: trip?.scoredAt ?? null,
        exam: null,
        examTier: null,
        lettersWrong: null,
        tonesWrong: null,
        roundTripGapPoints: trip?.letters?.gapPoints ?? null,
        listeners:
          pref.rounds > 0
            ? {
                chosen: pref.model,
                decided: pref.model + pref.person,
                rounds: pref.rounds,
                tier: pref.tier,
              }
            : null,
      };
    }),
  ];

  return {
    system,
    held: data.held,
    autoTableReady: data.autoTableReady,
    recognition: {
      options: asrOptions,
      selected: asr,
      compare,
      block: asr ? recognitionBlock(data, asr, compare) : null,
    },
    voice: {
      options: ttsOptions,
      selected: tts,
      block: tts ? voiceBlock(data, tts) : null,
    },
    levels: levelsBlock(data),
    // Listeners judge the voice. The human half is always about a voice
    // version: the one chosen, or the one the view opens on.
    human: humanHalf(data.listen, tts),
    checks: checkTable(data.checks, tts),
    tone: {
      person: tonePairs(data.toneAnswers, HUMAN_SYSTEM),
      model: tts ? tonePairs(data.toneAnswers, tts) : null,
    },
    versions: summaries,
  };
}
