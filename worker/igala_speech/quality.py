"""Per-clip quality measurement. Measure only: nothing here changes the audio.

Every number is computed from mono float samples in [-1, 1]:

- peakDbfs: highest absolute sample.
- truePeakDbfs: the same after 4x oversampling (inter-sample peaks).
- lufs: integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks,
  75 percent overlap, absolute gate -70 LUFS, relative gate -10 LU).
- wadaSnrDb: blind SNR estimate, Kim and Stern 2008 (WADA-SNR).
- clippedShare: share of samples at or above CLIP_LEVEL.
- speechShare, speechRmsDbfs, noiseFloorDbfs, snrDb: from a voice-activity
  split. The default split is the same energy rule the browser uses
  (web/src/lib/speech/analyse.ts); the Modal image passes Silero VAD instead.

The gates that read these numbers live in quality_gates.py.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np

DBFS_SILENT = -120.0
CLIP_LEVEL = 0.99
FRAME_MS = 20
SPEECH_WINDOW_DB = 28.0
SPEECH_FLOOR_DBFS = -55.0
MEASURE_VERSION = "quality-v1"


def to_db(x: float) -> float:
    return max(20 * math.log10(x), DBFS_SILENT) if x > 0 else DBFS_SILENT


def _r(x: float | None, places: int = 2) -> float | None:
    return None if x is None else round(float(x), places)


# ------------------------------------------------------------------ peaks

def sample_peak_dbfs(x: np.ndarray) -> float:
    return to_db(float(np.max(np.abs(x)))) if len(x) else DBFS_SILENT


def upsample_fft(x: np.ndarray, factor: int) -> np.ndarray:
    """Band-limited upsampling by zero-padding the spectrum."""
    n = len(x)
    if n == 0:
        return x
    spec = np.fft.rfft(x.astype(np.float64))
    out = np.fft.irfft(spec, n * factor) * factor
    return out


def true_peak_dbfs(x: np.ndarray, oversample: int = 4) -> float:
    if len(x) == 0:
        return DBFS_SILENT
    return to_db(float(np.max(np.abs(upsample_fft(x, oversample)))))


def clipped_share(x: np.ndarray) -> float:
    return float(np.mean(np.abs(x) >= CLIP_LEVEL)) if len(x) else 0.0


# --------------------------------------------------------------- loudness

def k_weighting(rate: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """The two BS.1770 biquads for any sample rate (the libebur128 derivation).
    At 48 kHz these are the coefficients printed in the recommendation."""
    f0, gain_db, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / rate)
    vh = 10 ** (gain_db / 20)
    vb = vh**0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf_b = np.array(
        [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    )
    shelf_a = np.array([1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0])

    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    hp_b = np.array([1.0, -2.0, 1.0])
    hp_a = np.array([1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0])
    return [(shelf_b, shelf_a), (hp_b, hp_a)]


def _biquad(b: np.ndarray, a: np.ndarray, x: np.ndarray) -> np.ndarray:
    try:  # the Modal image has scipy; local tests use the loop
        from scipy.signal import lfilter

        return lfilter(b, a, x)
    except ImportError:
        y = np.empty(len(x), dtype=np.float64)
        b0, b1, b2 = (float(v) for v in b)
        a1, a2 = float(a[1]), float(a[2])
        z1 = z2 = 0.0
        for i, v in enumerate(x.tolist()):
            out = b0 * v + z1
            z1 = b1 * v - a1 * out + z2
            z2 = b2 * v - a2 * out
            y[i] = out
        return y


def integrated_lufs(x: np.ndarray, rate: int) -> float | None:
    """Integrated loudness in LUFS, or None when nothing passes the gates."""
    if len(x) == 0:
        return None
    y = x.astype(np.float64)
    for b, a in k_weighting(rate):
        y = _biquad(b, a, y)
    block = round(0.4 * rate)
    step = round(0.1 * rate)
    if len(y) < block:  # shorter than one block: ungated loudness of the whole clip
        z = np.array([float(np.mean(y * y))])
    else:
        sq = np.concatenate([[0.0], np.cumsum(y * y)])
        starts = np.arange(0, len(y) - block + 1, step)
        z = (sq[starts + block] - sq[starts]) / block
    z = z[z > 0]
    if len(z) == 0:
        return None
    loud = -0.691 + 10 * np.log10(z)
    z = z[loud > -70.0]
    if len(z) == 0:
        return None
    relative = -0.691 + 10 * math.log10(float(np.mean(z))) - 10.0
    loud = -0.691 + 10 * np.log10(z)
    z = z[loud > relative]
    if len(z) == 0:
        return None
    return -0.691 + 10 * math.log10(float(np.mean(z)))


# --------------------------------------------------------------- WADA-SNR

# The G table of Kim and Stern (Interspeech 2008): G(snr) for snr = -20..100 dB,
# for speech amplitude modelled as a gamma distribution with shape 0.4.
_WADA_DB = np.arange(-20, 101)
_WADA_G = np.array([
    0.40974774, 0.40986926, 0.40998566, 0.40969089, 0.40986186, 0.40999006,
    0.41027138, 0.41052627, 0.41101024, 0.41143264, 0.41231718, 0.41337272,
    0.41526426, 0.4178192, 0.42077252, 0.42452799, 0.42918886, 0.43510373,
    0.44234195, 0.45161485, 0.46221153, 0.47491647, 0.48883809, 0.50509236,
    0.52353709, 0.54372088, 0.56532427, 0.58847532, 0.61346212, 0.63954496,
    0.66750818, 0.69583724, 0.72454762, 0.75414799, 0.78323148, 0.81240985,
    0.84219775, 0.87166406, 0.90030504, 0.92880418, 0.95655449, 0.9835349,
    1.01047155, 1.0362095, 1.06136425, 1.08579312, 1.1094819, 1.13277995,
    1.15472826, 1.17627308, 1.19703503, 1.21671694, 1.23535898, 1.25364313,
    1.27103891, 1.28718029, 1.30302865, 1.31839527, 1.33294817, 1.34700935,
    1.3605727, 1.37345513, 1.38577122, 1.39733504, 1.40856397, 1.41959619,
    1.42983624, 1.43958467, 1.44902176, 1.45804831, 1.46669568, 1.47486938,
    1.48269965, 1.49034339, 1.49748214, 1.50435106, 1.51076426, 1.51698915,
    1.5229097, 1.528578, 1.53389835, 1.5391211, 1.5439065, 1.54858517,
    1.55310776, 1.55744391, 1.56164927, 1.56566348, 1.56938671, 1.57307767,
    1.57654764, 1.57980083, 1.58304129, 1.58602496, 1.58880681, 1.59162477,
    1.5941969, 1.59693155, 1.599446, 1.60185011, 1.60408668, 1.60627134,
    1.60826199, 1.61004547, 1.61192472, 1.61369656, 1.61534074, 1.61688905,
    1.61838916, 1.61985374, 1.62135878, 1.62268119, 1.62390423, 1.62513143,
    1.62632463, 1.6274027, 1.62842767, 1.62945532, 1.6303307, 1.63128026,
    1.63204102,
])


def wada_snr_db(x: np.ndarray) -> float | None:
    """Blind SNR in dB, clamped to the table's range (-20 to 100)."""
    if len(x) == 0:
        return None
    peak = float(np.max(np.abs(x)))
    if peak <= 0:
        return None
    mag = np.maximum(np.abs(x.astype(np.float64)) / peak, 1e-10)
    v3 = math.log(max(1e-10, float(np.mean(mag)))) - float(np.mean(np.log(mag)))
    below = np.where(_WADA_G < v3)[0]
    if len(below) == 0:
        return float(_WADA_DB[0])
    i = int(below.max())
    if i == len(_WADA_DB) - 1:
        return float(_WADA_DB[-1])
    frac = (v3 - _WADA_G[i]) / (_WADA_G[i + 1] - _WADA_G[i])
    return float(_WADA_DB[i] + frac * (_WADA_DB[i + 1] - _WADA_DB[i]))


# -------------------------------------------------------------------- VAD

def energy_vad(x: np.ndarray, rate: int) -> np.ndarray:
    """One boolean per 20 ms frame: the browser's rule (analyse.ts)."""
    frame = max(1, round(rate * FRAME_MS / 1000))
    n = math.ceil(len(x) / frame)
    if n == 0:
        return np.zeros(0, dtype=bool)
    pad = np.zeros(n * frame, dtype=np.float64)
    pad[: len(x)] = x
    counts = np.full(n, frame, dtype=np.float64)
    counts[-1] = len(x) - (n - 1) * frame
    rms = np.sqrt(np.sum(pad.reshape(n, frame) ** 2, axis=1) / counts)
    level = np.array([to_db(float(v)) for v in rms])
    threshold = max(SPEECH_FLOOR_DBFS, float(level.max()) - SPEECH_WINDOW_DB)
    return (level > threshold) & (level > SPEECH_FLOOR_DBFS)


def _split_stats(x: np.ndarray, rate: int, speech: np.ndarray) -> dict:
    frame = max(1, round(rate * FRAME_MS / 1000))
    mask = np.repeat(speech, frame)[: len(x)]
    if len(mask) < len(x):
        mask = np.concatenate([mask, np.zeros(len(x) - len(mask), dtype=bool)])
    y = x.astype(np.float64)
    sp, ns = y[mask], y[~mask]
    speech_rms = to_db(float(np.sqrt(np.mean(sp * sp)))) if len(sp) else None
    # A noise floor needs at least 100 ms of non-speech to mean anything.
    noise = to_db(float(np.sqrt(np.mean(ns * ns)))) if len(ns) >= rate // 10 else None
    idx = np.flatnonzero(speech)
    duration_ms = round(len(x) / rate * 1000)
    lead = int(idx[0]) * FRAME_MS if len(idx) else duration_ms
    trail = max(0, duration_ms - (int(idx[-1]) + 1) * FRAME_MS) if len(idx) else duration_ms
    return {
        "speechShare": _r(float(np.mean(speech)) if len(speech) else 0.0, 3),
        "speechRmsDbfs": _r(speech_rms, 1),
        "noiseFloorDbfs": _r(noise, 1),
        "snrDb": _r(speech_rms - noise, 1) if speech_rms is not None and noise is not None else None,
        "leadingSilenceMs": lead,
        "trailingSilenceMs": trail,
    }


def measure(
    x: np.ndarray,
    rate: int,
    vad: Callable[[np.ndarray, int], np.ndarray] | None = None,
    vad_name: str = "energy-v1",
) -> dict:
    """Every quality number for one clip. `vad` returns one boolean per 20 ms."""
    x = np.asarray(x, dtype=np.float32)
    speech = (vad or energy_vad)(x, rate)
    return {
        "measureVersion": MEASURE_VERSION,
        "durationMs": round(len(x) / rate * 1000) if rate else 0,
        "sampleRate": rate,
        "peakDbfs": _r(sample_peak_dbfs(x), 1),
        "truePeakDbfs": _r(true_peak_dbfs(x), 1),
        "lufs": _r(integrated_lufs(x, rate), 1),
        "wadaSnrDb": _r(wada_snr_db(x), 1),
        "clippedShare": _r(clipped_share(x), 5),
        "vad": vad_name,
        **_split_stats(x, rate, speech),
    }
