/**
 * What a good clip measures, for the Target column of the levels table.
 *
 * The numbers are the speech work's (out/speech/recording-spec.md, Nov 13,
 * which wins over earlier figures by decision). In code they live in
 * web/src/lib/speech/quality-gates.json once that branch is on main; until
 * then they are repeated here, in this one file. Change them there first.
 */
export const LEVEL_TARGETS = {
  peak: { asRecorded: "-12 to -3 dBFS", afterCleaning: "at most -1 dBFS" },
  speech: { asRecorded: "-28 to -16 dBFS", afterCleaning: "about -23" },
  noise: { asRecorded: "as low as the room allows", afterCleaning: null },
  snr: { asRecorded: "20 dB or more", afterCleaning: null },
  clipped: { asRecorded: "0", afterCleaning: null },
  rejected: { asRecorded: "0", afterCleaning: null },
} as const;
