import numpy as np
import soundfile as sf

from igala_speech.audio import to_16k_mono


def test_resamples_stereo_44k_to_16k_mono(tmp_path):
    rate = 44100
    t = np.arange(rate) / rate
    stereo = np.stack([np.sin(2 * np.pi * 220 * t), np.sin(2 * np.pi * 330 * t)], axis=1).astype(np.float32) * 0.3
    src = tmp_path / "in.wav"
    sf.write(src, stereo, rate)
    audio = to_16k_mono(src)
    assert audio.ndim == 1
    assert abs(len(audio) - 16000) <= 2
    assert audio.dtype == np.float32
