import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAR_EDGES,
  GOOD_CLIP_CLOSING,
  GOOD_CLIP_STEPS,
  GOOD_CLIP_TITLE,
  METER,
  RECORD_LEVELS,
  ROOM_MESSAGE,
  barPosition,
  barWord,
  meterZone,
  rmsDbfs,
  roomVerdict,
  sanitizeRoom,
} from "./record-levels";
import {
  THRESHOLDS,
  analyseSamples,
  sanitizeQuality,
  verdicts,
  type QualityMetrics,
} from "./analyse";

/**
 * Story C3: the level targets live in ONE file and the bar, the take
 * feedback and the room check all read them from it. Synthetic buffers at
 * the levels in spec section 7.3.
 */

const SR = 16000;
const amp = (dbfsRms: number) => Math.SQRT2 * 10 ** (dbfsRms / 20);

/**
 * Synthetic take: `lead` seconds of room noise, `speech` seconds of a 220 Hz
 * tone at `voiceDbfs` RMS over the same noise, `trail` seconds of noise.
 * The noise is a quiet 50 Hz hum at `noiseDbfs` RMS (null: digital silence).
 */
function take(
  voiceDbfs: number,
  noiseDbfs: number | null,
  { lead = 0.5, speech = 2, trail = 0.6 } = {},
): Float32Array {
  const n = Math.round((lead + speech + trail) * SR);
  const out = new Float32Array(n);
  const from = Math.round(lead * SR);
  const to = from + Math.round(speech * SR);
  for (let i = 0; i < n; i++) {
    const noise =
      noiseDbfs === null
        ? 0
        : amp(noiseDbfs) * Math.sin((2 * Math.PI * 50 * i) / SR);
    const voice =
      i >= from && i < to
        ? amp(voiceDbfs) * Math.sin((2 * Math.PI * 220 * i) / SR)
        : 0;
    out[i] = voice + noise;
  }
  return out;
}
const keysOf = (samples: Float32Array) =>
  verdicts(analyseSamples(samples, SR)).map((v) => v.key);
const messagesOf = (samples: Float32Array) =>
  verdicts(analyseSamples(samples, SR)).map((v) => v.message);

describe("the level numbers", () => {
  it("are the recording spec's, with the meter block's key names (speech/first-model, PR #100)", () => {
    expect(METER).toEqual({
      greenMinDbfs: -12,
      greenMaxDbfs: -3,
      quietWarnDbfs: -20,
      veryQuietDbfs: -30,
      clipDbfs: -1,
      speechLevelGoodMinDbfs: -28,
      speechLevelGoodMaxDbfs: -16,
      speechLevelQuietDbfs: -30,
      speechLevelLoudDbfs: -14,
      noisyRoomSnrDb: 20,
      // The two keys the recording spec asks to be added for the room check.
      roomQuietDbfs: -50,
      roomNoisyDbfs: -40,
    });
  });

  it("the take feedback reads its level and noise thresholds from that one file", () => {
    expect(THRESHOLDS.aLittleQuietDbfs).toBe(METER.speechLevelQuietDbfs);
    expect(THRESHOLDS.tooLoudDbfs).toBe(METER.speechLevelLoudDbfs);
    expect(THRESHOLDS.tooLoudPeakDbfs).toBe(METER.clipDbfs);
    expect(THRESHOLDS.aLittleQuietPeakDbfs).toBe(METER.quietWarnDbfs);
    expect(THRESHOLDS.tooQuietPeakDbfs).toBe(METER.veryQuietDbfs);
    expect(THRESHOLDS.noisyRoomSnrDb).toBe(METER.noisyRoomSnrDb);
    expect(THRESHOLDS.tooQuietDbfs).toBe(RECORD_LEVELS.veryQuietSpeechDbfs);
    // No level number is written a second time in analyse.ts.
    const src = readFileSync(join(__dirname, "analyse.ts"), "utf8");
    const block = src.slice(
      src.indexOf("export const THRESHOLDS"),
      src.indexOf("} as const;", src.indexOf("export const THRESHOLDS")),
    );
    for (const key of [
      "tooQuietDbfs",
      "aLittleQuietDbfs",
      "tooLoudDbfs",
      "tooLoudPeakDbfs",
      "aLittleQuietPeakDbfs",
      "tooQuietPeakDbfs",
      "noisyRoomSnrDb",
    ]) {
      expect(block, key).toMatch(new RegExp(`${key}: (METER|RECORD_LEVELS)\\.`));
    }
  });
});

describe("the take feedback at the levels in the spec", () => {
  it("a take at -22 dBFS voice level in a quiet room is a good take", () => {
    const m = analyseSamples(take(-22, -70), SR);
    expect(m.rmsDbfs).toBeGreaterThan(-23);
    expect(m.rmsDbfs).toBeLessThan(-21);
    expect(keysOf(take(-22, -70))).toEqual(["good"]);
    expect(messagesOf(take(-22, -70))[0]).toContain("Good take");
  });

  it("a take at -32 dBFS shows A little quiet, in the softer words", () => {
    expect(keysOf(take(-32, null))).toContain("a_little_quiet");
    expect(messagesOf(take(-32, null))).toContain(
      "A little quiet: move a little closer to the microphone.",
    );
    expect(keysOf(take(-32, null))).not.toContain("too_quiet");
    expect(keysOf(take(-32, null))).not.toContain("good");
  });

  it("the stronger line stays for very quiet takes", () => {
    expect(keysOf(take(-45, null))).toContain("too_quiet");
    expect(messagesOf(take(-45, null))).toContain(
      "Too quiet: hold the phone closer and try again",
    );
    expect(keysOf(take(-45, null))).not.toContain("a_little_quiet");
  });

  it("-29 is fine and -31 is a little quiet: the line is at -30", () => {
    // Metrics, not a tone: a tone's loudest point is only 3 dB over its
    // level, so it would trip the loudest-point rule first.
    const at = (rmsDbfs: number): QualityMetrics => ({
      durationMs: 5000,
      leadingSilenceMs: 300,
      trailingSilenceMs: 600,
      speechShare: 0.8,
      rmsDbfs,
      peakDbfs: -14,
      clippingShare: 0,
      syllables: null,
      syllablesPerSecond: null,
    });
    const keys = (rms: number) => verdicts(at(rms)).map((v) => v.key);
    expect(keys(-29)).toEqual(["good"]);
    expect(keys(-30)).toEqual(["good"]);
    expect(keys(-31)).toEqual(["a_little_quiet"]);
    expect(keys(-39.9)).toEqual(["a_little_quiet"]);
    expect(keys(-40)).toEqual(["too_quiet"]);
  });

  it("a loudest point above -1 dBFS shows Clipped or the too loud line", () => {
    // Peak about -0.5 dBFS, not clipped (under 0.99 of full scale).
    const hot = take(-3.5, null);
    const m = analyseSamples(hot, SR);
    expect(m.peakDbfs).toBeGreaterThan(-1);
    const keys = keysOf(hot);
    expect(keys.includes("too_loud") || keys.includes("clipped")).toBe(true);
    // A calm voice level with one spike over -1 still gets the advice.
    const good: QualityMetrics = {
      durationMs: 5000,
      leadingSilenceMs: 300,
      trailingSilenceMs: 600,
      speechShare: 0.8,
      rmsDbfs: -22,
      peakDbfs: -0.6,
      clippingShare: 0,
      syllables: null,
      syllablesPerSecond: null,
    };
    expect(verdicts(good).map((v) => v.key)).toEqual(["too_loud"]);
    // "At or above -1": the edge itself is too loud, just under it is not.
    expect(verdicts({ ...good, peakDbfs: -1 }).map((v) => v.key)).toEqual([
      "too_loud",
    ]);
    expect(verdicts({ ...good, peakDbfs: -1.5 }).map((v) => v.key)).toEqual([
      "good",
    ]);
    // Truly clipped: the existing Clipped line, not both.
    expect(
      verdicts({ ...good, peakDbfs: 0, clippingShare: 0.05 }).map((v) => v.key),
    ).toEqual(["clipped"]);
  });

  it("a loudest point under -20 is a little quiet, and under -30 too quiet, whatever the voice level says", () => {
    const base: QualityMetrics = {
      durationMs: 5000,
      leadingSilenceMs: 300,
      trailingSilenceMs: 600,
      speechShare: 0.8,
      rmsDbfs: -27,
      peakDbfs: -15,
      clippingShare: 0,
      syllables: null,
      syllablesPerSecond: null,
    };
    const keys = (peakDbfs: number) =>
      verdicts({ ...base, peakDbfs }).map((v) => v.key);
    expect(keys(-15)).toEqual(["good"]);
    expect(keys(-20)).toEqual(["good"]);
    expect(keys(-20.5)).toEqual(["a_little_quiet"]);
    expect(keys(-30)).toEqual(["a_little_quiet"]);
    expect(keys(-30.5)).toEqual(["too_quiet"]);
  });

  it("a voice level over the loud line is too loud", () => {
    expect(keysOf(take(-12, null))).toContain("too_loud");
    expect(keysOf(take(-16, null))).not.toContain("too_loud");
  });

  it("noise 12 dB under the voice shows Noisy room; 25 dB under does not", () => {
    const noisy = take(-22, -34);
    expect(analyseSamples(noisy, SR).snrDb).toBeLessThan(20);
    expect(keysOf(noisy)).toContain("noisy_room");
    expect(messagesOf(noisy)).toContain(
      "Noisy room: we can hear noise behind your voice. Try a quieter place.",
    );
    const fine = take(-22, -47);
    expect(analyseSamples(fine, SR).snrDb).toBeGreaterThan(20);
    expect(keysOf(fine)).not.toContain("noisy_room");
  });

  it("measures the noise floor from the quietest frames, and the gap to the voice", () => {
    const m = analyseSamples(take(-22, -50), SR);
    expect(m.noiseFloorDbfs).toBeGreaterThan(-51);
    expect(m.noiseFloorDbfs).toBeLessThan(-49);
    expect(m.snrDb).toBeGreaterThan(26);
    expect(m.snrDb).toBeLessThan(30);
    // Digital silence around the voice: a floor at the bottom, a huge gap.
    const clean = analyseSamples(take(-22, null), SR);
    expect(clean.noiseFloorDbfs).toBe(-120);
    expect(clean.snrDb).toBeGreaterThan(90);
  });

  it("a clip too short to tell, or with no speech, has no noise verdict", () => {
    const tiny = analyseSamples(new Float32Array(Math.round(0.1 * SR)), SR);
    expect(tiny.noiseFloorDbfs).toBeNull();
    expect(tiny.snrDb).toBeNull();
    const silent = analyseSamples(new Float32Array(SR), SR);
    expect(silent.snrDb).toBeNull();
    expect(verdicts(silent).map((v) => v.key)).toEqual(["no_speech"]);
  });

  it("older clips (no noise numbers stored) never read as noisy", () => {
    const old: QualityMetrics = {
      durationMs: 5000,
      leadingSilenceMs: 300,
      trailingSilenceMs: 600,
      speechShare: 0.8,
      rmsDbfs: -22,
      peakDbfs: -5,
      clippingShare: 0,
      syllables: null,
      syllablesPerSecond: null,
    };
    expect(verdicts(old).map((v) => v.key)).toEqual(["good"]);
    expect(verdicts({ ...old, snrDb: null }).map((v) => v.key)).toEqual(["good"]);
  });

  it("no warning ever blocks: every new verdict is a line on the card, nothing else", () => {
    for (const s of [take(-32, null), take(-22, -34), take(-3.5, null)]) {
      for (const v of verdicts(analyseSamples(s, SR))) {
        expect(["good", "warn", "info"]).toContain(v.tone);
      }
    }
  });
});

describe("the bar", () => {
  it("meterZone follows the band edges", () => {
    expect(meterZone(-40)).toBe("quiet");
    expect(meterZone(-20)).toBe("low");
    expect(meterZone(-12.1)).toBe("low");
    expect(meterZone(-12)).toBe("good");
    expect(meterZone(-3)).toBe("good");
    expect(meterZone(-2.9)).toBe("hot");
    expect(meterZone(-1)).toBe("clip");
    expect(meterZone(0)).toBe("clip");
  });

  it("says one of three words", () => {
    expect(barWord(-40)).toBe("quiet");
    expect(barWord(-15)).toBe("quiet");
    expect(barWord(-8)).toBe("good");
    expect(barWord(-2)).toBe("too loud");
    expect(barWord(0)).toBe("too loud");
    expect(barWord(-Infinity)).toBe("quiet");
  });

  it("is linear in loudness, so the green zone is wide", () => {
    expect(barPosition(-Infinity)).toBe(0);
    expect(barPosition(0)).toBe(1);
    expect(barPosition(6)).toBe(1);
    expect(barPosition(-12)).toBeCloseTo(0.251, 3); // a quarter of the bar
    expect(barPosition(-6)).toBeCloseTo(0.501, 3); // half of it
    expect(BAR_EDGES.greenFrom).toBeCloseTo(0.251, 3);
    expect(BAR_EDGES.greenTo).toBeCloseTo(0.708, 3);
    expect(BAR_EDGES.redFrom).toBeCloseTo(0.891, 3);
    // The green zone is the widest of the three.
    const green = BAR_EDGES.greenTo - BAR_EDGES.greenFrom;
    expect(green).toBeGreaterThan(BAR_EDGES.greenFrom);
    expect(green).toBeGreaterThan(1 - BAR_EDGES.greenTo);
  });
});

describe("the room check's three answers", () => {
  it("quiet under -50 dBFS, noisy over -40, some noise between (recording spec)", () => {
    expect(roomVerdict(-69)).toBe("quiet");
    expect(roomVerdict(-50.1)).toBe("quiet");
    expect(roomVerdict(-50)).toBe("some_noise");
    expect(roomVerdict(-45)).toBe("some_noise");
    expect(roomVerdict(-40)).toBe("some_noise");
    expect(roomVerdict(-39.9)).toBe("noisy");
    expect(roomVerdict(-20)).toBe("noisy");
    expect(roomVerdict(-120)).toBe("quiet");
  });

  it("answers in the spec's words", () => {
    expect(ROOM_MESSAGE).toEqual({
      quiet: "Your room is quiet. Good.",
      some_noise:
        "There is some noise. It is fine to go on. A quieter place is better.",
      noisy:
        "Your room is noisy. Close the window or turn off the fan, then try again.",
    });
  });

  it("rmsDbfs: full-scale sine is about -3, silence is the floor", () => {
    const n = 4800;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.sin((2 * Math.PI * i) / 48) ** 2;
    expect(rmsDbfs(sum, n)).toBeCloseTo(-3.01, 1);
    expect(rmsDbfs(0, n)).toBe(-120);
    expect(rmsDbfs(1, 0)).toBe(-120);
  });

  it("sanitizeRoom keeps a well-formed reading and nothing else", () => {
    const at = "2026-11-13T09:00:00.000Z";
    expect(sanitizeRoom({ noiseDbfs: -52.34, verdict: "quiet", at })).toEqual({
      noiseDbfs: -52.3,
      verdict: "quiet",
      at,
    });
    for (const bad of [
      null,
      "x",
      [],
      { noiseDbfs: "loud", verdict: "quiet", at },
      { noiseDbfs: -50, verdict: "silent", at },
      { noiseDbfs: -50, verdict: "quiet", at: "yesterday" },
      { noiseDbfs: -50, verdict: "quiet" },
    ]) {
      expect(sanitizeRoom(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(
      sanitizeRoom({ noiseDbfs: -500, verdict: "quiet", at })?.noiseDbfs,
    ).toBe(-120);
  });
});

describe("what is stored with each clip", () => {
  const base = {
    durationMs: 4000,
    speechShare: 0.7,
    rmsDbfs: -22,
    peakDbfs: -6,
  };
  const capture = {
    requested: "raw",
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
    channelCount: 1,
    userAgent: "TestBrowser/1.0",
  };
  const room = {
    noiseDbfs: -55,
    verdict: "quiet",
    at: "2026-11-13T09:00:00.000Z",
  };

  it("keeps the noise numbers, the capture settings and the room reading", () => {
    const q = sanitizeQuality({
      ...base,
      noiseFloorDbfs: -58.2,
      snrDb: 36.2,
      capture,
      room,
    });
    expect(q?.noiseFloorDbfs).toBe(-58.2);
    expect(q?.snrDb).toBe(36.2);
    expect(q?.capture).toEqual(capture);
    expect(q?.room).toEqual(room);
  });

  it("drops a malformed capture or room record and keeps the metrics", () => {
    const q = sanitizeQuality({
      ...base,
      capture: { requested: "loud" },
      room: { noiseDbfs: "x" },
      snrDb: null,
    });
    expect(q).not.toBeNull();
    expect(q && "capture" in q).toBe(false);
    expect(q && "room" in q).toBe(false);
    expect(q?.snrDb).toBeNull();
  });

  it("an older client that sends neither is saved exactly as before", () => {
    const q = sanitizeQuality(base);
    expect(q).toEqual({
      ...base,
      leadingSilenceMs: 0,
      trailingSilenceMs: 0,
      clippingShare: 0,
      syllables: null,
      syllablesPerSecond: null,
    });
  });
});

describe("the guide", () => {
  it("is the note in the spec, word for word", () => {
    expect(GOOD_CLIP_TITLE).toBe("How to get a good clip");
    expect(GOOD_CLIP_STEPS).toEqual([
      "Find a quiet room. Close the door and the window. Turn off the fan, the TV and the radio.",
      "Hold the phone, or sit at the laptop, about one hand away from your mouth.",
      "Speak as you would to a person across a small table. Do not whisper. Do not shout.",
      "Watch the bar while you speak. Keep it in the green.",
      "If the bar touches the red, move back a little and try again.",
    ]);
    expect(GOOD_CLIP_CLOSING).toBe(
      "You do not need to be perfect. A quiet clip is fine. A noisy clip is hard to use.",
    );
  });
});
