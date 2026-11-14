/**
 * The numbers behind the record screen's level feedback, in ONE place: the
 * live bar, the room check and the take feedback all read them from here.
 * Client-safe (no server imports).
 *
 * The numbers belong to the speech-model work, not to this screen: they are
 * the ones in the recording spec of 2026-11-13 (section 3, "Thresholds for
 * the record screen"). METER uses the same key names and values as the
 * `meter` block of quality-gates.json on branch speech/first-model (PR #100),
 * plus the two room-check keys that spec asks to be added there
 * (roomQuietDbfs, roomNoisyDbfs). When that file is on main, add those two
 * keys to it and replace the literal below with
 *   import { QUALITY_GATES } from "./quality-gates";
 *   export const METER = QUALITY_GATES.meter;
 * Nothing else here needs to change. The values are a research synthesis and
 * are not calibrated on Igala phone audio yet.
 */
export const METER = {
  /** The green band of the bar: the loudest moments should land in it. */
  greenMinDbfs: -12,
  greenMaxDbfs: -3,
  /** Peaks under this earn the quiet hint on the bar. */
  quietWarnDbfs: -20,
  veryQuietDbfs: -30,
  /** Peaks at or above this are red: too loud, close to clipping. */
  clipDbfs: -1,
  /** Voice level (RMS over speech frames) that reads as a good take. */
  speechLevelGoodMinDbfs: -28,
  speechLevelGoodMaxDbfs: -16,
  /** Voice level under this: "A little quiet". */
  speechLevelQuietDbfs: -30,
  /** Voice level over this: "Too loud". */
  speechLevelLoudDbfs: -14,
  /** Noise closer to the voice than this many dB: "Noisy room". */
  noisyRoomSnrDb: 20,
  /** Room check: a room under this level is quiet; over the next, noisy. */
  roomQuietDbfs: -50,
  roomNoisyDbfs: -40,
} as const;

/** The few numbers only this screen uses. */
export const RECORD_LEVELS = {
  /** At or under this voice level the stronger "Too quiet" line shows. */
  veryQuietSpeechDbfs: -40,
  /** How long the room check listens, and how much of the start it ignores. */
  roomCheckMs: 3000,
  roomSettleMs: 300,
} as const;

// ---- The live bar ---------------------------------------------------------

export type MeterZone = "quiet" | "low" | "good" | "hot" | "clip";

/**
 * Where a peak level sits on the meter. "good" is the green band; "low" is
 * usable but under it; "quiet" earns the quiet hint; "hot" is above the band
 * but not clipping; "clip" is red. Same rule as meterZone in quality-gates.ts.
 */
export function meterZone(peakDbfs: number): MeterZone {
  if (peakDbfs >= METER.clipDbfs) return "clip";
  if (peakDbfs > METER.greenMaxDbfs) return "hot";
  if (peakDbfs >= METER.greenMinDbfs) return "good";
  if (peakDbfs >= METER.quietWarnDbfs) return "low";
  return "quiet";
}

/** The three words under the bar. */
export type BarWord = "quiet" | "good" | "too loud";
export function barWord(peakDbfs: number): BarWord {
  const zone = meterZone(peakDbfs);
  if (zone === "good") return "good";
  return zone === "hot" || zone === "clip" ? "too loud" : "quiet";
}

/**
 * Where a level sits along the bar, 0 to 1. The bar is linear in amplitude,
 * not in dB, so the green band is wide: -12 dBFS is a quarter of the bar and
 * -3 dBFS is about seven tenths of it. Silence is 0, full scale is 1.
 */
export function barPosition(dbfs: number): number {
  if (!Number.isFinite(dbfs)) return dbfs > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, 10 ** (dbfs / 20)));
}

/** The bar's zone edges, as positions along it. */
export const BAR_EDGES = {
  greenFrom: barPosition(METER.greenMinDbfs),
  greenTo: barPosition(METER.greenMaxDbfs),
  redFrom: barPosition(METER.clipDbfs),
} as const;

// ---- The room check -------------------------------------------------------

export type RoomVerdict = "quiet" | "some_noise" | "noisy";

/** What the room check stores, and what rides along with each clip saved after it. */
export interface RoomReading {
  /** RMS level of the room with nobody speaking, in dBFS. */
  noiseDbfs: number;
  verdict: RoomVerdict;
  /** When the check ran (ISO time). */
  at: string;
}

/**
 * Quiet under -50 dBFS, noisy over -40, some noise between. A voice at the
 * usual level of about -23 dBFS stands 27 dB over a -50 room and 17 dB over a
 * -40 room, which is where the 20 dB "Noisy room" rule starts to fire.
 */
export function roomVerdict(noiseDbfs: number): RoomVerdict {
  if (noiseDbfs < METER.roomQuietDbfs) return "quiet";
  if (noiseDbfs > METER.roomNoisyDbfs) return "noisy";
  return "some_noise";
}

export const ROOM_MESSAGE: Record<RoomVerdict, string> = {
  quiet: "Your room is quiet. Good.",
  some_noise:
    "There is some noise. It is fine to go on. A quieter place is better.",
  noisy:
    "Your room is noisy. Close the window or turn off the fan, then try again.",
};

/** RMS of a block of samples, in dBFS (-120 for silence). */
export function rmsDbfs(sumSquares: number, count: number): number {
  if (count <= 0 || sumSquares <= 0) return -120;
  return Math.max(10 * Math.log10(sumSquares / count), -120);
}

const ROOM_KEY = "speech:room-check";

/**
 * The room reading of this sitting, or null when the check has not run. Kept
 * in session storage, so it lasts for the tab and is gone when it closes.
 * Any storage failure reads as "not checked".
 */
export function readRoomReading(): RoomReading | null {
  try {
    const raw = window.sessionStorage.getItem(ROOM_KEY);
    if (!raw) return null;
    return sanitizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeRoomReading(reading: RoomReading | null): void {
  try {
    if (reading) {
      window.sessionStorage.setItem(ROOM_KEY, JSON.stringify(reading));
    } else {
      window.sessionStorage.removeItem(ROOM_KEY);
    }
  } catch {
    /* the check still shows its answer; it is just not remembered */
  }
}

/** Keep only a well-formed room reading from whatever was stored or sent. */
export function sanitizeRoom(raw: unknown): RoomReading | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.noiseDbfs !== "number" || !Number.isFinite(r.noiseDbfs)) {
    return null;
  }
  if (r.verdict !== "quiet" && r.verdict !== "some_noise" && r.verdict !== "noisy") {
    return null;
  }
  const at =
    typeof r.at === "string" && !Number.isNaN(Date.parse(r.at))
      ? new Date(r.at).toISOString()
      : null;
  if (!at) return null;
  return {
    noiseDbfs: Math.round(Math.min(Math.max(r.noiseDbfs, -120), 6) * 10) / 10,
    verdict: r.verdict,
    at,
  };
}

// ---- The guide ------------------------------------------------------------

export const GOOD_CLIP_TITLE = "How to get a good clip";
export const GOOD_CLIP_STEPS = [
  "Find a quiet room. Close the door and the window. Turn off the fan, the TV and the radio.",
  "Hold the phone, or sit at the laptop, about one hand away from your mouth.",
  "Speak as you would to a person across a small table. Do not whisper. Do not shout.",
  "Watch the bar while you speak. Keep it in the green.",
  "If the bar touches the red, move back a little and try again.",
] as const;
export const GOOD_CLIP_CLOSING =
  "You do not need to be perfect. A quiet clip is fine. A noisy clip is hard to use.";
