import gates from "@/lib/speech/quality-gates.json";

/**
 * What a good clip measures, for the "Aim for" column of the levels table.
 * The numbers are the speech work's and live in one file, quality-gates.json
 * (the record screen's meter and the cleaning step read the same file). This
 * module only words them.
 */
const m = gates.meter;

export const LEVEL_TARGETS = {
  peak: `${m.greenMinDbfs} to ${m.greenMaxDbfs} dBFS`,
  speech: `${m.speechLevelGoodMinDbfs} to ${m.speechLevelGoodMaxDbfs} dBFS`,
  noise: "as low as the room allows",
  snr: `${gates.warn.speechOverNoiseDbBelow} dB or more`,
  clipped: "0",
  rejected: "not a target: the check is not calibrated",
} as const;

/** True once the worker's quality rules have been tuned on Igala phone audio. */
export const QUALITY_GATES_CALIBRATED: boolean = gates.calibrated;
