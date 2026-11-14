"""Writes the three mock-mode WAVs. Sine bursts, invented words, no real audio.

Run once: python tests/fixtures/make_fixtures.py  (the outputs are committed).
"""

from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).parent
RATE = 16000


def burst(freq: float, seconds: float) -> np.ndarray:
    t = np.arange(int(RATE * seconds)) / RATE
    return (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


for name, freq, seconds in [("fx-1", 220, 1.0), ("fx-2", 330, 1.2), ("fx-3", 440, 0.8)]:
    sf.write(HERE / f"{name}.wav", burst(freq, seconds), RATE, subtype="PCM_16")
