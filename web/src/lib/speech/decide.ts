/**
 * Should tonight's run train? Pure: a snapshot of the world in, a verdict and
 * the reasons out. No clock, no database. Every threshold lives in
 * DECIDE_CONFIG so the dashboard can show them and a test can pin them.
 *
 * At most one ASR and one TTS job per night is built into the shape of the
 * answer (one verdict per system) and into the "already ran today" rule.
 * Nothing launches when the loop is paused or the month's spend has reached
 * the cap, whatever the minutes say.
 */

export const DECIDE_CONFIG = {
  /** New kept minutes since the last ASR run needed to train ASR (PRD: 30). */
  asrMinNewMinutes: 30,
  /** New studio minutes since the last TTS run needed to train TTS (PRD: 30). */
  ttsMinNewStudioMinutes: 30,
  /** Total studio hours needed before TTS trains at all (PRD: 5). */
  ttsMinStudioHours: 5,
} as const;

export type DecideConfig = typeof DECIDE_CONFIG;

export interface DecideState {
  newAsrMinutes: number;
  newStudioMinutes: number;
  studioTotalHours: number;
  lastAsrRunAt: Date | null;
  lastTtsRunAt: Date | null;
  paused: boolean;
  monthSpendUsd: number;
  monthlyCapUsd: number;
  now: Date;
}

export interface Decision {
  asr: "train" | "skip";
  tts: "train" | "skip";
  reasons: string[];
}

const sameUtcDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

const n1 = (x: number) => x.toFixed(1);
const n2 = (x: number) => x.toFixed(2);

export function decide(
  s: DecideState,
  config: DecideConfig = DECIDE_CONFIG,
): Decision {
  if (s.paused) {
    return { asr: "skip", tts: "skip", reasons: ["paused: the loop is paused"] };
  }
  if (s.monthSpendUsd >= s.monthlyCapUsd) {
    return {
      asr: "skip",
      tts: "skip",
      reasons: [
        `cap: month spend ${n2(s.monthSpendUsd)} has reached the cap ${n2(s.monthlyCapUsd)}`,
      ],
    };
  }

  const reasons: string[] = [];

  let asr: Decision["asr"] = "skip";
  if (s.lastAsrRunAt && sameUtcDay(s.lastAsrRunAt, s.now)) {
    reasons.push("asr: already ran today");
  } else if (s.newAsrMinutes < config.asrMinNewMinutes) {
    reasons.push(
      `asr: ${n1(s.newAsrMinutes)} new minutes, below ${config.asrMinNewMinutes}`,
    );
  } else {
    asr = "train";
    reasons.push(
      `asr: ${n1(s.newAsrMinutes)} new minutes, at or above ${config.asrMinNewMinutes}`,
    );
  }

  let tts: Decision["tts"] = "skip";
  if (s.lastTtsRunAt && sameUtcDay(s.lastTtsRunAt, s.now)) {
    reasons.push("tts: already ran today");
  } else if (s.newStudioMinutes < config.ttsMinNewStudioMinutes) {
    reasons.push(
      `tts: ${n1(s.newStudioMinutes)} new studio minutes, below ${config.ttsMinNewStudioMinutes}`,
    );
  } else if (s.studioTotalHours < config.ttsMinStudioHours) {
    reasons.push(
      `tts: ${n1(s.studioTotalHours)} studio hours in total, below ${config.ttsMinStudioHours}`,
    );
  } else {
    tts = "train";
    reasons.push(
      `tts: ${n1(s.newStudioMinutes)} new studio minutes and ${n1(s.studioTotalHours)} studio hours in total`,
    );
  }

  return { asr, tts, reasons };
}
