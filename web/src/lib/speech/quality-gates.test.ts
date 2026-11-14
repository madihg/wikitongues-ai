import { describe, it, expect } from "vitest";
import fixture from "./quality-gates.fixtures.json";
import gates from "./quality-gates.json";
import {
  QUALITY_GATES_VERSION,
  gateVerdict,
  loudnessGainDb,
  meterZone,
  passesRoundTripGate,
  type ClipMeasure,
} from "./quality-gates";

const round1 = (n: number) => Math.round(n * 10) / 10 + 0;

describe("quality gates fixture (shared with worker/tests/test_quality_gates.py)", () => {
  it("has enough cases to cover every reason", () => {
    const seen = new Set(fixture.cases.flatMap((c) => c.reasons));
    expect([...seen].sort()).toEqual([
      "clipped",
      "clipping_some",
      "dnsmos_low",
      "noise_close",
      "peak_hot",
      "peak_quiet",
      "peak_very_quiet",
      "snr_low",
      "snr_marginal",
      "speech_share_low",
    ]);
  });

  for (const c of fixture.cases) {
    it(`verdict ${c.id}`, () => {
      expect(gateVerdict(c.measure as ClipMeasure)).toEqual({
        verdict: c.verdict,
        reasons: c.reasons,
      });
    });
  }

  for (const c of fixture.loudness) {
    it(`loudness gain from ${c.lufs} LUFS, peak ${c.truePeakDbfs}`, () => {
      const got = loudnessGainDb(c.lufs, c.truePeakDbfs);
      expect(round1(got.gainDb)).toBe(c.gainDb);
      expect(got.limited).toBe(c.limited);
    });
  }

  for (const c of fixture.meter) {
    it(`meter zone at ${c.peakDbfs} dBFS`, () => {
      expect(meterZone(c.peakDbfs)).toBe(c.zone);
    });
  }

  for (const c of fixture.roundTrip) {
    it(`round trip ${c.systemCer} against ${c.humanCer}`, () => {
      expect(passesRoundTripGate(c.systemCer, c.humanCer)).toBe(c.passes);
    });
  }
});

describe("quality gates constants", () => {
  it("carries a version and says it is not calibrated yet", () => {
    expect(QUALITY_GATES_VERSION).toBe(gates.version);
    expect(gates.calibrated).toBe(false);
  });

  it("the bands are ordered, so no level falls between two zones", () => {
    const m = gates.meter;
    expect(m.veryQuietDbfs).toBeLessThan(m.quietWarnDbfs);
    expect(m.quietWarnDbfs).toBeLessThan(m.greenMinDbfs);
    expect(m.greenMinDbfs).toBeLessThan(m.greenMaxDbfs);
    expect(m.greenMaxDbfs).toBeLessThan(m.clipDbfs);
    expect(gates.reject.wadaSnrDbBelow).toBeLessThan(gates.accept.wadaSnrDbMin);
    expect(gates.accept.peakDbfsMin).toBeLessThan(gates.accept.peakDbfsMax);
  });

  it("cleaning aims at -23 LUFS under a -1 dBFS true peak, at 24 and 16 kHz", () => {
    expect(gates.clean.targetLufs).toBe(-23);
    expect(gates.clean.truePeakCeilingDbfs).toBe(-1);
    expect(gates.clean.sampleRates).toEqual([24000, 16000]);
  });
});
