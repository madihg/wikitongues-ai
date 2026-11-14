"""The clip quality gates: the Python mirror of web/src/lib/speech/quality-gates.ts.

The thresholds live in web/src/lib/speech/quality-gates.json. The deployed
worker image carries only this package, so the same values are written out
below; tests/test_quality_gates.py fails when GATES and the JSON file differ,
and both test suites read quality-gates.fixtures.json. Change the JSON, this
dict and (if a rule changes) both gate functions together.

Measure only: a verdict is reported beside the clip and never blocks anything.
"""

from __future__ import annotations

import math

GATES: dict = {
    "version": "2026-11-13-v1",
    "calibrated": False,
    "accept": {
        "wadaSnrDbMin": 25,
        "peakDbfsMin": -20,
        "peakDbfsMax": -1,
        "clippedShareMax": 0,
        "dnsmosOvrlMin": 3.0,
    },
    "warn": {"peakVeryQuietDbfs": -30, "speechOverNoiseDbBelow": 20},
    "reject": {
        "wadaSnrDbBelow": 15,
        "clippedShareAbove": 0.001,
        "speechShareBelow": 0.5,
    },
    "clean": {
        "targetLufs": -23,
        "truePeakCeilingDbfs": -1,
        "f0CorrelationMin": 0.9,
        "f0MedianShiftCentsMax": 50,
        "f0OctaveJumpShareMax": 0.05,
        "sampleRates": [24000, 16000],
    },
    "meter": {
        "greenMinDbfs": -12,
        "greenMaxDbfs": -3,
        "quietWarnDbfs": -20,
        "veryQuietDbfs": -30,
        "clipDbfs": -1,
        "speechLevelGoodMinDbfs": -28,
        "speechLevelGoodMaxDbfs": -16,
        "speechLevelQuietDbfs": -30,
        "speechLevelLoudDbfs": -14,
        "noisyRoomSnrDb": 20,
    },
    "roundTrip": {"maxCerRatioToHuman": 2},
}
GATES_VERSION: str = GATES["version"]

REJECT_REASONS = ("snr_low", "clipped", "speech_share_low")


def _has(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def gate_verdict(m: dict) -> dict:
    """{"verdict": accept|warn|reject, "reasons": [...]}, reject reasons first."""
    accept, warn, reject = GATES["accept"], GATES["warn"], GATES["reject"]
    reasons: list[str] = []
    snr, peak, clipped = m.get("wadaSnrDb"), m.get("peakDbfs"), m.get("clippedShare")
    share, dnsmos, over_noise = m.get("speechShare"), m.get("dnsmosOvrl"), m.get("snrDb")

    if _has(snr) and snr < reject["wadaSnrDbBelow"]:
        reasons.append("snr_low")
    if _has(clipped) and clipped > reject["clippedShareAbove"]:
        reasons.append("clipped")
    if _has(share) and share < reject["speechShareBelow"]:
        reasons.append("speech_share_low")

    if _has(snr) and reject["wadaSnrDbBelow"] <= snr < accept["wadaSnrDbMin"]:
        reasons.append("snr_marginal")
    if _has(peak) and peak < warn["peakVeryQuietDbfs"]:
        reasons.append("peak_very_quiet")
    elif _has(peak) and peak < accept["peakDbfsMin"]:
        reasons.append("peak_quiet")
    if _has(peak) and peak > accept["peakDbfsMax"]:
        reasons.append("peak_hot")
    if _has(clipped) and accept["clippedShareMax"] < clipped <= reject["clippedShareAbove"]:
        reasons.append("clipping_some")
    if _has(dnsmos) and dnsmos < accept["dnsmosOvrlMin"]:
        reasons.append("dnsmos_low")
    if _has(over_noise) and over_noise < warn["speechOverNoiseDbBelow"]:
        reasons.append("noise_close")

    if any(r in REJECT_REASONS for r in reasons):
        verdict = "reject"
    elif reasons:
        verdict = "warn"
    else:
        verdict = "accept"
    return {"verdict": verdict, "reasons": reasons}


def loudness_gain_db(lufs: float, true_peak_dbfs: float) -> tuple[float, bool]:
    """(gain in dB, limited). limited: the peak ceiling, not the target, set it."""
    wanted = GATES["clean"]["targetLufs"] - lufs
    room = GATES["clean"]["truePeakCeilingDbfs"] - true_peak_dbfs
    return (room, True) if wanted > room else (wanted, False)


def passes_round_trip_gate(system_cer: float, human_cer: float) -> bool:
    return system_cer <= GATES["roundTrip"]["maxCerRatioToHuman"] * human_cer


def meter_zone(peak_dbfs: float) -> str:
    m = GATES["meter"]
    if peak_dbfs >= m["clipDbfs"]:
        return "clip"
    if peak_dbfs > m["greenMaxDbfs"]:
        return "hot"
    if peak_dbfs >= m["greenMinDbfs"]:
        return "good"
    if peak_dbfs >= m["quietWarnDbfs"]:
        return "low"
    return "quiet"
