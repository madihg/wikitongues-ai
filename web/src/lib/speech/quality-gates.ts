import gates from "./quality-gates.json";

/**
 * The clip quality gates: accept, warn or reject, from the numbers the worker
 * measures on every clip (worker/igala_speech/quality.py). The thresholds live
 * in quality-gates.json and nowhere else; worker/igala_speech/quality_gates.py
 * is the Python mirror, and quality-gates.fixtures.json is read by both test
 * suites so the two cannot drift.
 *
 * Measure only. A verdict is stored beside the clip; it never blocks a save
 * and never changes the audio. The values are the Nov 13 research synthesis
 * and are not calibrated on Igala phone audio yet (QUALITY_GATES.calibrated).
 * Client-safe: no server imports.
 */

export const QUALITY_GATES = gates;
export const QUALITY_GATES_VERSION: string = gates.version;

/** What the worker measured for one clip. Missing numbers are skipped. */
export interface ClipMeasure {
  peakDbfs?: number | null;
  wadaSnrDb?: number | null;
  clippedShare?: number | null;
  speechShare?: number | null;
  dnsmosOvrl?: number | null;
  /** Speech level minus the noise floor, in dB (the worker's snrDb). */
  snrDb?: number | null;
}

export type GateVerdict = "accept" | "warn" | "reject";

export type GateReason =
  | "snr_low"
  | "clipped"
  | "speech_share_low"
  | "snr_marginal"
  | "peak_quiet"
  | "peak_very_quiet"
  | "peak_hot"
  | "clipping_some"
  | "dnsmos_low"
  | "noise_close";

const REJECT_REASONS: readonly GateReason[] = [
  "snr_low",
  "clipped",
  "speech_share_low",
];

const has = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * The verdict for one clip, with every reason that applies, reject reasons
 * first, in a fixed order. No reason means accept.
 */
export function gateVerdict(m: ClipMeasure): {
  verdict: GateVerdict;
  reasons: GateReason[];
} {
  const { accept, warn, reject } = gates;
  const reasons: GateReason[] = [];
  const snr = m.wadaSnrDb;
  const peak = m.peakDbfs;
  const clipped = m.clippedShare;

  if (has(snr) && snr < reject.wadaSnrDbBelow) reasons.push("snr_low");
  if (has(clipped) && clipped > reject.clippedShareAbove) reasons.push("clipped");
  if (has(m.speechShare) && m.speechShare < reject.speechShareBelow) {
    reasons.push("speech_share_low");
  }

  if (has(snr) && snr >= reject.wadaSnrDbBelow && snr < accept.wadaSnrDbMin) {
    reasons.push("snr_marginal");
  }
  if (has(peak) && peak < warn.peakVeryQuietDbfs) reasons.push("peak_very_quiet");
  else if (has(peak) && peak < accept.peakDbfsMin) reasons.push("peak_quiet");
  if (has(peak) && peak > accept.peakDbfsMax) reasons.push("peak_hot");
  if (
    has(clipped) &&
    clipped > accept.clippedShareMax &&
    clipped <= reject.clippedShareAbove
  ) {
    reasons.push("clipping_some");
  }
  if (has(m.dnsmosOvrl) && m.dnsmosOvrl < accept.dnsmosOvrlMin) {
    reasons.push("dnsmos_low");
  }
  if (has(m.snrDb) && m.snrDb < warn.speechOverNoiseDbBelow) {
    reasons.push("noise_close");
  }

  const verdict: GateVerdict = reasons.some((r) => REJECT_REASONS.includes(r))
    ? "reject"
    : reasons.length > 0
      ? "warn"
      : "accept";
  return { verdict, reasons };
}

/**
 * The gain, in dB, that brings a clip to the target loudness without its true
 * peak passing the ceiling. `limited` is true when the ceiling, not the
 * target, set the gain (the clip then lands under the target).
 */
export function loudnessGainDb(
  lufs: number,
  truePeakDbfs: number,
): { gainDb: number; limited: boolean } {
  const { targetLufs, truePeakCeilingDbfs } = gates.clean;
  const wanted = targetLufs - lufs;
  const room = truePeakCeilingDbfs - truePeakDbfs;
  return wanted > room
    ? { gainDb: room, limited: true }
    : { gainDb: wanted, limited: false };
}

/**
 * The round-trip gate for a synthetic voice: its CER through the frozen
 * recogniser may be at most `maxCerRatioToHuman` times the CER of people's
 * clips of the same sentences. A human CER of 0 admits only a system CER of 0.
 */
export function passesRoundTripGate(systemCer: number, humanCer: number): boolean {
  return systemCer <= gates.roundTrip.maxCerRatioToHuman * humanCer;
}

export type MeterZone = "quiet" | "low" | "good" | "hot" | "clip";

/**
 * Where a peak level sits on the record screen's meter. "good" is the green
 * band; "low" is usable but under it; "quiet" earns the quiet warning; "hot"
 * is above the band but not clipping; "clip" is red.
 */
export function meterZone(peakDbfs: number): MeterZone {
  const m = gates.meter;
  if (peakDbfs >= m.clipDbfs) return "clip";
  if (peakDbfs > m.greenMaxDbfs) return "hot";
  if (peakDbfs >= m.greenMinDbfs) return "good";
  if (peakDbfs >= m.quietWarnDbfs) return "low";
  return "quiet";
}
