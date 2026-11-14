"""The cleaning derivative. The raw upload is never touched.

One clip in, at its recorded rate, mono:

1. Denoise with DeepFilterNet3 (discriminative, MIT or Apache-2.0). No
   generative restoration: it is language dependent and can change words.
2. Pitch check (f0.py): the F0 track before and after, on frames voiced in
   both. If the correlation is low or the median shift is large, the clip
   keeps its RAW audio for the next steps, and the log says why.
3. Loudness: to the target (-23 LUFS) with the true peak under the ceiling
   (-1 dBFS). Plain gain, no limiter, no compressor: when the ceiling binds,
   the clip lands under the target and the log says so.
4. Copies at 24 kHz (synthesis) and 16 kHz (recognition).

Every derivative carries a log: tool, version and parameters, the pitch check,
the gain, and the measurements before and after. Thresholds come from
quality_gates.GATES["clean"].
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from .f0 import pitch_check
from .quality import integrated_lufs, measure, sample_peak_dbfs, true_peak_dbfs
from .quality_gates import GATES, GATES_VERSION, gate_verdict, loudness_gain_db

CLEAN_VERSION = "clean-v1"
DENOISER = "DeepFilterNet3"

Denoise = Callable[[np.ndarray, int], np.ndarray]
Vad = Callable[[np.ndarray, int], np.ndarray]


def resample(x: np.ndarray, rate: int, target: int) -> np.ndarray:
    """Band-limited resampling: torchaudio in the Modal image, FFT otherwise."""
    if rate == target:
        return np.asarray(x, dtype=np.float32)
    try:
        import torch
        import torchaudio

        out = torchaudio.functional.resample(
            torch.from_numpy(np.asarray(x, dtype=np.float32)), rate, target
        )
        return out.numpy().astype(np.float32)
    except ImportError:
        n = round(len(x) * target / rate)
        spec = np.fft.rfft(np.asarray(x, dtype=np.float64))
        keep = n // 2 + 1
        cut = np.zeros(keep, dtype=complex)
        m = min(keep, len(spec))
        cut[:m] = spec[:m]
        return (np.fft.irfft(cut, n) * (n / len(x))).astype(np.float32)


def normalise_loudness(x: np.ndarray, rate: int) -> tuple[np.ndarray, dict]:
    """Gain to the target loudness under the true-peak ceiling. Returns the
    audio and what was done; silence (no loudness) is returned unchanged."""
    lufs = integrated_lufs(x, rate)
    peak = true_peak_dbfs(x)
    info = {
        "targetLufs": GATES["clean"]["targetLufs"],
        "truePeakCeilingDbfs": GATES["clean"]["truePeakCeilingDbfs"],
        "lufsIn": None if lufs is None else round(lufs, 2),
        "truePeakIn": round(peak, 2),
        "gainDb": 0.0,
        "limitedByPeak": False,
    }
    if lufs is None:
        info["skipped"] = "no_loudness"
        return np.asarray(x, dtype=np.float32), info
    gain, limited = loudness_gain_db(lufs, peak)
    info["gainDb"] = round(gain, 2)
    info["limitedByPeak"] = limited
    return (np.asarray(x, dtype=np.float64) * 10 ** (gain / 20)).astype(np.float32), info


def _fit_ceiling(x: np.ndarray) -> tuple[np.ndarray, float]:
    """Resampling can lift a peak by a fraction of a dB: pull a copy back under
    the ceiling. Returns the copy and the trim in dB (0 when none was needed)."""
    ceiling = GATES["clean"]["truePeakCeilingDbfs"]
    over = max(true_peak_dbfs(x), sample_peak_dbfs(x)) - ceiling
    if over <= 0:
        return x, 0.0
    return (x * 10 ** (-over / 20)).astype(np.float32), round(-over, 2)


def make_derivative(
    raw: np.ndarray,
    rate: int,
    denoise: Denoise | None,
    *,
    denoiser_version: str = "unknown",
    denoiser_params: dict | None = None,
    vad: Vad | None = None,
    vad_name: str = "energy-v1",
) -> dict:
    """Clean one clip. Returns {"copies": {rate: samples}, "log": {...}}.

    `denoise` maps (samples, rate) to samples of the same length and rate; None
    skips the denoiser (the log says so), which leaves loudness and resampling.
    """
    raw = np.asarray(raw, dtype=np.float32)
    c = GATES["clean"]
    before = measure(raw, rate, vad, vad_name)
    log: dict = {
        "cleanVersion": CLEAN_VERSION,
        "gatesVersion": GATES_VERSION,
        "denoiser": {
            "tool": DENOISER if denoise else None,
            "version": denoiser_version if denoise else None,
            "params": (denoiser_params or {}) if denoise else None,
        },
        "before": {**before, "gate": gate_verdict(before)},
    }

    source = raw
    used_denoised = False
    if denoise is not None:
        cleaned = np.asarray(denoise(raw, rate), dtype=np.float32)[: len(raw)]
        if len(cleaned) < len(raw):
            cleaned = np.concatenate([cleaned, np.zeros(len(raw) - len(cleaned), np.float32)])
        check = pitch_check(
            raw,
            cleaned,
            rate,
            min_correlation=c["f0CorrelationMin"],
            max_median_shift_cents=c["f0MedianShiftCentsMax"],
            max_octave_jump_share=c["f0OctaveJumpShareMax"],
        )
        log["pitchCheck"] = check
        if check["ok"]:
            source, used_denoised = cleaned, True
        else:
            log["keptRawBecause"] = check["reason"]
    else:
        log["pitchCheck"] = None
        log["keptRawBecause"] = "no_denoiser"
    log["usedDenoised"] = used_denoised

    normalised, loud = normalise_loudness(source, rate)
    log["loudness"] = loud
    copies: dict[int, np.ndarray] = {}
    trims: dict[str, float] = {}
    for target in c["sampleRates"]:
        copy, trim = _fit_ceiling(resample(normalised, rate, target))
        copies[target] = copy
        if trim:
            trims[str(target)] = trim
    log["resample"] = {"rates": list(c["sampleRates"]), "ceilingTrimDb": trims}
    main_rate = c["sampleRates"][0]
    after = measure(copies[main_rate], main_rate, vad, vad_name)
    log["after"] = {**after, "gate": gate_verdict(after)}
    return {"copies": copies, "log": log}


def deepfilternet() -> tuple[Denoise, str, dict]:
    """The DeepFilterNet3 denoiser as (function, version, parameters).

    Imports torch and df lazily: they exist only in the Modal cleaning image.
    DeepFilterNet works at 48 kHz; other rates are resampled in and back out.
    """
    import df
    import torch
    from df.enhance import enhance, init_df

    model, state, _ = init_df()  # the default model is DeepFilterNet3
    df_rate = state.sr()
    params = {"model": DENOISER, "postFilter": False, "attenLimDb": None, "rate": df_rate}

    def run(x: np.ndarray, rate: int) -> np.ndarray:
        y = resample(x, rate, df_rate)
        out = enhance(model, state, torch.from_numpy(y)[None, :])
        return resample(out.squeeze(0).cpu().numpy(), df_rate, rate)

    return run, getattr(df, "__version__", "unknown"), params
