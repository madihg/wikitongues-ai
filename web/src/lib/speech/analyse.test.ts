import { describe, it, expect } from "vitest";
import {
  THRESHOLDS,
  analyseSamples,
  countSyllables,
  hasWarning,
  sanitizeQuality,
  sessionLine,
  verdicts,
  type QualityMetrics,
} from "./analyse";

const SR = 16000;

/** Synthetic audio: silence, then a 220 Hz tone at `amp`, then silence. */
function tone(
  leadS: number,
  speechS: number,
  trailS: number,
  amp: number,
): Float32Array {
  const n = Math.round((leadS + speechS + trailS) * SR);
  const out = new Float32Array(n);
  const from = Math.round(leadS * SR);
  const to = from + Math.round(speechS * SR);
  for (let i = from; i < to; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR);
  }
  return out;
}

const keys = (m: QualityMetrics) => verdicts(m).map((v) => v.key);

describe("countSyllables", () => {
  it("counts every vowel letter in Igala, dotted vowels and tone marks included", () => {
    expect(countSyllables("ọla")).toBe(2); // o with dot below, a
    expect(countSyllables("ẹjẹ")).toBe(2);
    expect(countSyllables("àbáẹ̀")).toBe(3); // tone marks do not add or hide letters
    expect(countSyllables("ABỌ")).toBe(2);
    expect(countSyllables("ụ̀sẹ̀")).toBe(2);
    expect(countSyllables("ai")).toBe(2); // adjacent vowels are separate syllables
  });
  it("handles precomposed and decomposed forms alike", () => {
    expect(countSyllables("ọ")).toBe(1);
    expect(countSyllables("ọ")).toBe(1);
  });
  it("returns 0 for text with no vowel letter", () => {
    expect(countSyllables("")).toBe(0);
    expect(countSyllables("mm nn")).toBe(0);
  });
  it("English counts vowel groups once per word, at least one per word", () => {
    expect(countSyllables("the market opens at dawn", "english")).toBe(7);
    expect(countSyllables("rhythm", "english")).toBe(1);
    expect(countSyllables("beautiful", "english")).toBe(3);
  });
});

describe("analyseSamples", () => {
  const m = analyseSamples(tone(0.5, 3, 1, 0.1), SR, "ọla ẹjẹ ọba ada");

  it("measures duration and the silence on either side", () => {
    expect(m.durationMs).toBe(4500);
    expect(m.leadingSilenceMs).toBeGreaterThanOrEqual(480);
    expect(m.leadingSilenceMs).toBeLessThanOrEqual(520);
    expect(m.trailingSilenceMs).toBeGreaterThanOrEqual(980);
    expect(m.trailingSilenceMs).toBeLessThanOrEqual(1020);
  });

  it("measures speech share, level, peak and no clipping for a clean tone", () => {
    expect(m.speechShare).toBeGreaterThan(0.6);
    expect(m.speechShare).toBeLessThan(0.75);
    // 0.1 amplitude sine: RMS 0.0707 = -23.0 dBFS, peak -20 dBFS.
    expect(m.rmsDbfs).toBeGreaterThan(-24);
    expect(m.rmsDbfs).toBeLessThan(-22);
    expect(m.peakDbfs).toBeCloseTo(-20, 0);
    expect(m.clippingShare).toBe(0);
  });

  it("estimates syllables from the text and pace over the speaking span", () => {
    expect(m.syllables).toBe(8); // ọ a ẹ ẹ ọ a a a
    expect(m.syllablesPerSecond).toBeGreaterThan(2);
    expect(m.syllablesPerSecond).toBeLessThan(3);
  });

  it("reports null syllables and pace when no text is given", () => {
    const n = analyseSamples(tone(0.2, 1, 0.5, 0.1), SR);
    expect(n.syllables).toBeNull();
    expect(n.syllablesPerSecond).toBeNull();
  });

  it("sees full-scale samples as clipping", () => {
    const loud = tone(0.2, 1, 0.5, 1.2).map((x) => Math.max(-1, Math.min(1, x)));
    const c = analyseSamples(loud, SR);
    expect(c.clippingShare).toBeGreaterThan(0.05);
    expect(c.peakDbfs).toBeGreaterThanOrEqual(-0.1);
  });

  it("finds no speech in digital silence or a very faint hiss", () => {
    const s = analyseSamples(new Float32Array(SR), SR);
    expect(s.speechShare).toBe(0);
    expect(s.leadingSilenceMs).toBe(1000);
    const hiss = new Float32Array(SR).map((_, i) => 0.0002 * Math.sin(i));
    expect(analyseSamples(hiss, SR).speechShare).toBe(0);
  });

  it("is deterministic and survives an empty buffer", () => {
    const a = analyseSamples(tone(0.2, 1, 0.5, 0.1), SR, "ọla");
    const b = analyseSamples(tone(0.2, 1, 0.5, 0.1), SR, "ọla");
    expect(a).toEqual(b);
    const e = analyseSamples(new Float32Array(0), SR);
    expect(e.durationMs).toBe(0);
    expect(Number.isFinite(e.rmsDbfs)).toBe(true);
  });
});

describe("verdicts", () => {
  const good: QualityMetrics = {
    durationMs: 5000,
    leadingSilenceMs: 300,
    trailingSilenceMs: 600,
    speechShare: 0.8,
    rmsDbfs: -22,
    peakDbfs: -5,
    clippingShare: 0,
    syllables: 9,
    syllablesPerSecond: 2.2,
  };

  it("a clean take gets one good line with the span and syllable count", () => {
    const v = verdicts(good);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ key: "good", tone: "good" });
    expect(v[0].message).toBe("Good take: clear level, 4.1 s for 9 syllables");
    expect(hasWarning(good)).toBe(false);
  });

  it("says the span without a syllable count when there was no text", () => {
    const v = verdicts({ ...good, syllables: null, syllablesPerSecond: null });
    expect(v[0].message).toBe("Good take: clear level, 4.1 s of speech");
  });

  it("too quiet, with the instruction", () => {
    const v = verdicts({ ...good, rmsDbfs: THRESHOLDS.tooQuietDbfs - 1 });
    expect(keys({ ...good, rmsDbfs: -40 })).toContain("too_quiet");
    expect(v.find((x) => x.key === "too_quiet")?.message).toBe(
      "Too quiet: hold the phone closer and try again",
    );
    expect(keys(good)).not.toContain("too_quiet");
  });

  it("too loud", () => {
    expect(keys({ ...good, rmsDbfs: -5 })).toContain("too_loud");
  });

  it("clipped, by share or by peak", () => {
    const byShare = verdicts({ ...good, clippingShare: 0.02 });
    expect(byShare.find((x) => x.key === "clipped")?.message).toBe(
      "Clipped: speak a little further from the microphone",
    );
    expect(keys({ ...good, peakDbfs: -0.05 })).toContain("clipped");
  });

  it("cut short when the clip ends while still speaking", () => {
    const v = verdicts({ ...good, trailingSilenceMs: 20 });
    expect(v.find((x) => x.key === "cut_short")?.message).toBe(
      "Cut short: the clip ends while you are still speaking",
    );
    expect(keys({ ...good, trailingSilenceMs: 400 })).not.toContain("cut_short");
  });

  it("long pauses are notes, not failures, and do not say they are trimmed", () => {
    const v = verdicts({ ...good, leadingSilenceMs: 2400 });
    const pause = v.find((x) => x.key === "long_pause_start")!;
    expect(pause.tone).toBe("info");
    expect(pause.message).toMatch(/Long pause at the start \(2\.4 s\)/);
    expect(pause.message).not.toMatch(/trimmed when saved/);
    // Only notes: it is still a good take.
    expect(v.map((x) => x.key)).toEqual(["good", "long_pause_start"]);
    expect(keys({ ...good, trailingSilenceMs: 3000 })).toContain("long_pause_end");
  });

  it("pace: fast is a warning with the figure, slow a note", () => {
    const fast = verdicts({ ...good, syllablesPerSecond: 8.4 });
    expect(fast.find((x) => x.key === "too_fast")?.message).toMatch(/8\.4 syllables/);
    expect(keys({ ...good, syllablesPerSecond: 1 })).toContain("too_slow");
    expect(keys({ ...good, syllablesPerSecond: null })).toEqual(["good"]);
  });

  it("no speech stops at one clear line", () => {
    const v = verdicts({ ...good, speechShare: 0.01, rmsDbfs: -120 });
    expect(v.map((x) => x.key)).toEqual(["no_speech"]);
  });

  it("very short takes are flagged", () => {
    expect(keys({ ...good, durationMs: 400 })).toContain("too_short");
  });

  it("warnings never also say good", () => {
    const k = keys({ ...good, rmsDbfs: -45, clippingShare: 0.1 });
    expect(k).not.toContain("good");
    expect(hasWarning({ ...good, rmsDbfs: -45 })).toBe(true);
  });
});

describe("sanitizeQuality", () => {
  const ok = {
    durationMs: 4100,
    leadingSilenceMs: 100,
    trailingSilenceMs: 300,
    speechShare: 0.7,
    rmsDbfs: -20,
    peakDbfs: -3,
    clippingShare: 0,
    syllables: 9,
    syllablesPerSecond: 2.4,
    retakes: 2,
  };
  it("keeps the known metrics and drops everything else", () => {
    const q = sanitizeQuality({ ...ok, extra: "x", nested: { a: 1 } })!;
    expect(q).toMatchObject(ok);
    expect(q).not.toHaveProperty("extra");
    expect(q).not.toHaveProperty("nested");
  });
  it("clamps out-of-range numbers", () => {
    const q = sanitizeQuality({ ...ok, speechShare: 7, rmsDbfs: -999, retakes: -3 })!;
    expect(q.speechShare).toBe(1);
    expect(q.rmsDbfs).toBe(-120);
    expect(q.retakes).toBe(0);
  });
  it("returns null for junk or when a core metric is missing", () => {
    for (const bad of [null, undefined, "x", 3, [1], {}, { ...ok, durationMs: "4" }]) {
      expect(sanitizeQuality(bad), JSON.stringify(bad)).toBeNull();
    }
    const { rmsDbfs: _drop, ...noRms } = ok;
    void _drop;
    expect(sanitizeQuality(noRms)).toBeNull();
  });
  it("rejects NaN and Infinity", () => {
    expect(sanitizeQuality({ ...ok, peakDbfs: NaN })).toBeNull();
    expect(sanitizeQuality({ ...ok, rmsDbfs: Infinity })).toBeNull();
  });
});

describe("sessionLine", () => {
  it("reads like the brief", () => {
    expect(
      sessionLine({ kept: 6, retakes: 2, communityOnly: 3, licensed: 3, open: 0 }),
    ).toBe("Today: 6 clips kept, 2 re-recorded, 3 community-only, 3 licensed");
  });
  it("singular, and open only when there is one", () => {
    expect(
      sessionLine({ kept: 1, retakes: 0, communityOnly: 0, licensed: 0, open: 1 }),
    ).toBe("Today: 1 clip kept, 0 re-recorded, 0 community-only, 0 licensed, 1 open");
  });
});
