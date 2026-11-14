"""Quality measurement on synthetic signals with known answers."""

import math

import numpy as np
import pytest

from igala_speech.quality import (
    _WADA_DB,
    _WADA_G,
    clipped_share,
    energy_vad,
    integrated_lufs,
    k_weighting,
    measure,
    sample_peak_dbfs,
    true_peak_dbfs,
    wada_snr_db,
)

RATE = 48000


def sine(freq: float, peak_db: float, seconds: float = 3.0, rate: int = RATE, phase: float = 0.0):
    t = np.arange(int(rate * seconds)) / rate
    return (10 ** (peak_db / 20) * np.sin(2 * np.pi * freq * t + phase)).astype(np.float32)


def test_k_weighting_at_48k_is_the_published_filter():
    (shelf_b, shelf_a), (hp_b, hp_a) = k_weighting(48000)
    assert shelf_b == pytest.approx([1.53512485958697, -2.69169618940638, 1.19839281085285], abs=1e-9)
    assert shelf_a == pytest.approx([1.0, -1.69065929318241, 0.73248077421585], abs=1e-9)
    assert hp_b == pytest.approx([1.0, -2.0, 1.0])
    assert hp_a == pytest.approx([1.0, -1.99004745483398, 0.99007225036621], abs=1e-9)


@pytest.mark.parametrize("rate", [16000, 24000, 48000])
@pytest.mark.parametrize("peak_db", [-23.0, -6.0])
def test_loudness_of_a_997_hz_sine(rate, peak_db):
    # BS.1770: a full-scale 997 Hz sine in one channel reads -3.01 LKFS.
    got = integrated_lufs(sine(997, peak_db, rate=rate), rate)
    assert got == pytest.approx(peak_db - 3.01, abs=0.1)


def test_loudness_ignores_silence_around_the_speech():
    tone = sine(997, -20, seconds=10)
    padded = np.concatenate([np.zeros(RATE * 2, np.float32), tone, np.zeros(RATE * 2, np.float32)])
    assert integrated_lufs(padded, RATE) == pytest.approx(integrated_lufs(tone, RATE), abs=0.3)


def test_silence_has_no_loudness():
    assert integrated_lufs(np.zeros(RATE, np.float32), RATE) is None
    assert integrated_lufs(np.zeros(0, np.float32), RATE) is None


def test_sample_peak_and_clipping():
    x = sine(440, -6)
    assert sample_peak_dbfs(x) == pytest.approx(-6, abs=0.01)
    assert clipped_share(x) == 0
    hot = np.clip(sine(440, 6), -1, 1)
    assert clipped_share(hot) > 0.3
    assert sample_peak_dbfs(np.zeros(10, np.float32)) == -120


def test_true_peak_sees_between_the_samples():
    # A sine at a quarter of the rate, sampled 45 degrees off its crests:
    # every sample is 0.707, the wave itself reaches 1.0.
    x = sine(RATE / 4, 0, seconds=1, phase=math.pi / 4)
    assert sample_peak_dbfs(x) == pytest.approx(-3.01, abs=0.02)
    assert true_peak_dbfs(x) == pytest.approx(0.0, abs=0.1)


def test_wada_table_is_complete_and_rising():
    assert len(_WADA_G) == len(_WADA_DB) == 121
    assert np.all(np.diff(_WADA_G[3:]) > 0)


def test_wada_snr_rises_with_the_true_snr():
    rng = np.random.default_rng(0)
    n = RATE * 3
    burst = (np.sin(2 * np.pi * 3 * np.arange(n) / RATE) > 0).astype(float)
    speech = rng.gamma(0.4, 1.0, n) * rng.choice([-1, 1], n) * burst
    got = []
    for snr in (0, 10, 20):
        noise = rng.normal(0, 1, n)
        noise *= math.sqrt(np.mean(speech**2) / np.mean(noise**2)) / 10 ** (snr / 20)
        got.append(wada_snr_db(speech + noise))
    assert got[0] < got[1] < got[2]
    assert wada_snr_db(np.zeros(100)) is None


def test_energy_vad_splits_tone_from_silence():
    x = np.concatenate([np.zeros(RATE, np.float32), sine(200, -20, seconds=1), np.zeros(RATE, np.float32)])
    speech = energy_vad(x, RATE)
    assert len(speech) == 150
    assert speech.mean() == pytest.approx(1 / 3, abs=0.02)
    assert not energy_vad(np.zeros(RATE, np.float32), RATE).any()


def test_measure_reports_levels_and_noise():
    rng = np.random.default_rng(1)
    noise = (10 ** (-60 / 20) * rng.normal(0, 1, RATE * 3)).astype(np.float32)
    x = noise.copy()
    x[RATE : 2 * RATE] += sine(200, -20, seconds=1)
    m = measure(x, RATE)
    assert m["durationMs"] == 3000 and m["sampleRate"] == RATE
    assert m["peakDbfs"] == pytest.approx(-20, abs=0.5)
    assert m["speechRmsDbfs"] == pytest.approx(-23, abs=0.5)
    assert m["noiseFloorDbfs"] == pytest.approx(-60, abs=1)
    assert m["snrDb"] == pytest.approx(37, abs=1.5)
    assert m["speechShare"] == pytest.approx(0.333, abs=0.02)
    assert m["leadingSilenceMs"] == pytest.approx(1000, abs=40)
    assert m["clippedShare"] == 0 and m["vad"] == "energy-v1"


def test_measure_takes_another_vad():
    x = sine(200, -20, seconds=1)
    m = measure(x, RATE, vad=lambda s, r: np.ones(50, dtype=bool), vad_name="all")
    assert m["speechShare"] == 1 and m["noiseFloorDbfs"] is None and m["snrDb"] is None
    assert m["vad"] == "all"
