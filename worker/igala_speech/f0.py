"""A pitch track and the check that cleaning did not move it.

Igala is tonal: a denoiser that bends pitch changes the word. No published
study measures what any enhancer does to tone, so every cleaned clip is
checked against its own raw audio: the F0 track of both, on the frames voiced
in both. A clip that fails keeps its raw audio (clean.py).

The tracker is a normalised cross-correlation with an octave guard (numpy
only, so the test runs without a GPU image). It is a comparison instrument, not a tone score:
both sides go through the same tracker with the same settings.
"""

from __future__ import annotations

import math

import numpy as np

F0_RATE = 16000
FRAME_MS = 50
HOP_MS = 10
FMIN = 75.0
FMAX = 500.0
VOICED_CORR = 0.6
VOICED_FLOOR_DB = 30.0  # a frame this far under the loudest frame is unvoiced
PEAK_SHARE = 0.85  # a candidate peak is within this share of the frame's best
OCTAVE_JUMP_CENTS = 500.0
FLAT_CENTS = 25.0  # a raw track flatter than this has no contour to correlate
MIN_VOICED_FRAMES = 10
TRACKER = "nccf-v2"


def _to_rate(x: np.ndarray, rate: int, target: int) -> np.ndarray:
    if rate == target:
        return x.astype(np.float64)
    n = round(len(x) * target / rate)
    spec = np.fft.rfft(x.astype(np.float64))
    keep = n // 2 + 1
    cut = np.zeros(keep, dtype=complex)
    m = min(keep, len(spec))
    cut[:m] = spec[:m]
    return np.fft.irfft(cut, n) * (n / len(x))


def _nccf(frames: np.ndarray, lag_lo: int, lag_hi: int) -> np.ndarray:
    """Normalised cross-correlation of each frame with itself, one column per
    lag in lag_lo..lag_hi. Bounded by 1, with no bias toward long lags."""
    width = frames.shape[1] - lag_hi
    head = frames[:, :width]
    head_energy = np.sum(head * head, axis=1)
    sq = np.concatenate(
        [np.zeros((frames.shape[0], 1)), np.cumsum(frames * frames, axis=1)], axis=1
    )
    out = np.empty((frames.shape[0], lag_hi - lag_lo + 1))
    for k, lag in enumerate(range(lag_lo, lag_hi + 1)):
        num = np.einsum("ij,ij->i", head, frames[:, lag : lag + width])
        energy = sq[:, lag + width] - sq[:, lag]
        out[:, k] = num / np.sqrt(np.maximum(head_energy * energy, 1e-18))
    return out


def track_f0(x: np.ndarray, rate: int) -> np.ndarray:
    """F0 in Hz every 10 ms; 0 where the frame is unvoiced.

    Two passes. The first picks, per frame, the shortest lag whose peak is
    close to the best one. The second re-picks among each frame's strong peaks
    the one nearest the clip's median pitch, which removes octave slips: speech
    stays within an octave of its median inside one short clip.
    """
    y = _to_rate(np.asarray(x), rate, F0_RATE)
    size = F0_RATE * FRAME_MS // 1000
    hop = F0_RATE * HOP_MS // 1000
    if len(y) < size:
        return np.zeros(0)
    n = 1 + (len(y) - size) // hop
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    frames = y[idx]
    frames = frames - frames.mean(axis=1, keepdims=True)
    energy = np.sum(frames * frames, axis=1)
    lag_lo = int(F0_RATE / FMAX)
    lag_hi = int(F0_RATE / FMIN)
    # One spare lag each side, so every pick has two neighbours.
    c = _nccf(frames, lag_lo - 1, lag_hi + 1)
    inner = c[:, 1:-1]
    is_peak = (inner >= c[:, :-2]) & (inner > c[:, 2:])
    best = np.where(is_peak, inner, -1.0).max(axis=1)
    strong = is_peak & (inner >= PEAK_SHARE * best[:, None]) & (best[:, None] > 0)
    has_peak = strong.any(axis=1)
    level = 10 * np.log10(np.maximum(energy, 1e-12))
    loud = level > level.max() - VOICED_FLOOR_DB
    lags = np.arange(lag_lo, lag_hi + 1)

    first = np.argmax(strong, axis=1)
    rows = np.arange(n)
    voiced = has_peak & loud & (inner[rows, first] >= VOICED_CORR)
    if not voiced.any():
        return np.zeros(n)
    median = float(np.median(F0_RATE / lags[first[voiced]]))
    cost = np.where(strong, np.abs(np.log2(F0_RATE / lags[None, :] / median)), np.inf)
    pick = np.argmin(cost, axis=1)
    voiced = has_peak & loud & (inner[rows, pick] >= VOICED_CORR)

    a, b, d = c[rows, pick], c[rows, pick + 1], c[rows, pick + 2]
    denom = a - 2 * b + d
    safe = np.abs(denom) > 1e-12
    shift = np.divide(0.5 * (a - d), denom, out=np.zeros_like(denom), where=safe)
    f0 = F0_RATE / (lags[pick] + np.clip(shift, -1, 1))
    return _median3(np.where(voiced, f0, 0.0))


def _median3(f0: np.ndarray) -> np.ndarray:
    """A 3-point median over voiced neighbours: removes single-frame glitches."""
    if len(f0) < 3:
        return f0
    out = f0.copy()
    stack = np.stack([f0[:-2], f0[1:-1], f0[2:]])
    all_voiced = (stack > 0).all(axis=0)
    out[1:-1] = np.where(all_voiced, np.median(stack, axis=0), f0[1:-1])
    return out


def pitch_check(
    raw: np.ndarray,
    cleaned: np.ndarray,
    rate: int,
    min_correlation: float = 0.9,
    max_median_shift_cents: float = 50.0,
    max_octave_jump_share: float = 0.05,
) -> dict:
    """Compare the F0 of a clip before and after cleaning.

    ok is False, with a reason, when the cleaned track cannot be trusted:
    too_few_voiced_frames, octave_jumps, median_shift or low_correlation.
    """
    a, b = track_f0(raw, rate), track_f0(cleaned, rate)
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    both = (a > 0) & (b > 0)
    out = {
        "tracker": TRACKER,
        "voicedFramesRaw": int((a > 0).sum()),
        "voicedFramesCleaned": int((b > 0).sum()),
        "voicedFramesBoth": int(both.sum()),
        "correlation": None,
        "medianShiftCents": None,
        "rmseCents": None,
        "octaveJumpShare": None,
        "ok": False,
        "reason": None,
    }
    if both.sum() < MIN_VOICED_FRAMES:
        out["reason"] = "too_few_voiced_frames"
        return out
    cents = 1200 * np.log2(b[both] / a[both])
    jumps = np.abs(cents) > OCTAVE_JUMP_CENTS
    out["octaveJumpShare"] = round(float(jumps.mean()), 4)
    if jumps.mean() > max_octave_jump_share:
        out["reason"] = "octave_jumps"
        return out
    keep = ~jumps
    cents = cents[keep]
    ra = 1200 * np.log2(a[both][keep])
    rb = 1200 * np.log2(b[both][keep])
    out["medianShiftCents"] = round(float(np.median(cents)), 2)
    out["rmseCents"] = round(float(math.sqrt(np.mean(cents * cents))), 2)
    flat = float(np.std(ra)) < FLAT_CENTS
    if not flat and float(np.std(rb)) > 0:
        out["correlation"] = round(float(np.corrcoef(ra, rb)[0, 1]), 4)
    if abs(out["medianShiftCents"]) > max_median_shift_cents:
        out["reason"] = "median_shift"
        return out
    if flat:
        # No contour to correlate: the spread of the difference decides.
        if out["rmseCents"] > max_median_shift_cents:
            out["reason"] = "low_correlation"
            return out
    elif out["correlation"] is None or out["correlation"] < min_correlation:
        out["reason"] = "low_correlation"
        return out
    out["ok"] = True
    return out
