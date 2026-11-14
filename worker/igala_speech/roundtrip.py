"""Round-trip scoring of a synthetic voice against people's clips.

The frozen recogniser already misreads part of human Igala, so a raw CER on
synthetic speech means little. Each system is scored on the same sentences as
the human clips, through the same recogniser, and the number that matters is
the gap (system CER minus human CER) with a paired bootstrap interval over
sentences. The gate (quality_gates.passes_round_trip_gate) reads the two CERs.
"""

from __future__ import annotations

import numpy as np

from .quality_gates import GATES, passes_round_trip_gate

BOOTSTRAP_RESAMPLES = 1000
BOOTSTRAP_SEED = 13


def paired_gap(human: list[float], system: list[float]) -> dict:
    """Mean CER of each side on the same sentences, the gap, and its 95 percent
    interval from resampling sentences (paired, fixed seed)."""
    if len(human) != len(system):
        raise ValueError("human and system must score the same sentences")
    n = len(human)
    if n == 0:
        return {"n": 0, "humanCer": None, "systemCer": None, "gap": None, "lo": None, "hi": None,
                "ratio": None, "passesGate": False}
    h, s = np.asarray(human, dtype=np.float64), np.asarray(system, dtype=np.float64)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    idx = rng.integers(0, n, size=(BOOTSTRAP_RESAMPLES, n))
    gaps = s[idx].mean(axis=1) - h[idx].mean(axis=1)
    human_cer, system_cer = float(h.mean()), float(s.mean())
    return {
        "n": n,
        "humanCer": round(human_cer, 4),
        "systemCer": round(system_cer, 4),
        "gap": round(system_cer - human_cer, 4),
        "lo": round(float(np.percentile(gaps, 2.5)), 4),
        "hi": round(float(np.percentile(gaps, 97.5)), 4),
        "ratio": round(system_cer / human_cer, 3) if human_cer > 0 else None,
        "maxRatio": GATES["roundTrip"]["maxCerRatioToHuman"],
        "passesGate": passes_round_trip_gate(system_cer, human_cer),
        "resampledBy": "sentence",
    }
