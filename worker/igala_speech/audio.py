"""Audio helpers: 16 kHz mono float32 in, FLAC bytes out."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 16000


def to_16k_mono(path: str | Path) -> np.ndarray:
    audio, rate = sf.read(str(path), dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    if rate == RATE:
        return mono.astype(np.float32)
    try:  # the Modal image has torchaudio; local tests fall back to interpolation
        import torch
        import torchaudio

        out = torchaudio.functional.resample(torch.from_numpy(mono), rate, RATE)
        return out.numpy().astype(np.float32)
    except ImportError:
        n = round(len(mono) * RATE / rate)
        return np.interp(np.linspace(0, len(mono) - 1, n), np.arange(len(mono)), mono).astype(np.float32)


def flac_bytes(audio: np.ndarray, rate: int = RATE) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, rate, format="FLAC")
    return buf.getvalue()


def wav_bytes(audio: np.ndarray, rate: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()
