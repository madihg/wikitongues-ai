"""The pitch check on synthetic tones: what passes, what keeps the raw audio."""

import numpy as np
import pytest

from igala_speech.f0 import pitch_check, track_f0

RATE = 48000
T = np.arange(RATE * 3) / RATE


def tone(freq_hz: np.ndarray | float) -> np.ndarray:
    freq = np.broadcast_to(np.asarray(freq_hz, dtype=np.float64), T.shape)
    return (0.3 * np.sin(2 * np.pi * np.cumsum(freq) / RATE)).astype(np.float32)


GLIDE = 150 + 100 * T / 3  # 150 Hz rising to 250 Hz


def vibrato(sign: int) -> np.ndarray:
    return tone(200 * 2 ** (sign * 60 / 1200 * np.sin(2 * np.pi * 2 * T)))


@pytest.mark.parametrize("freq", [90.0, 180.0, 320.0])
def test_tracker_reads_a_steady_tone(freq):
    f0 = track_f0(tone(freq), RATE)
    voiced = f0[f0 > 0]
    assert len(voiced) > 250
    assert np.median(voiced) == pytest.approx(freq, rel=0.01)


def test_tracker_follows_a_glide_and_ignores_silence():
    voiced = track_f0(tone(GLIDE), RATE)
    assert voiced[5] == pytest.approx(152, abs=3)
    assert voiced[-5] == pytest.approx(248, abs=3)
    assert not track_f0(np.zeros(RATE, np.float32), RATE).any()


def test_identical_audio_passes():
    got = pitch_check(tone(GLIDE), tone(GLIDE), RATE)
    assert got["ok"] is True and got["reason"] is None
    assert got["correlation"] == pytest.approx(1.0, abs=1e-6)
    assert got["medianShiftCents"] == pytest.approx(0, abs=0.01)


def test_a_small_drift_under_the_threshold_passes():
    got = pitch_check(tone(GLIDE), tone(GLIDE * 2 ** (20 / 1200)), RATE)
    assert got["ok"] is True
    assert got["medianShiftCents"] == pytest.approx(20, abs=2)


def test_a_semitone_shift_keeps_the_raw_audio():
    got = pitch_check(tone(GLIDE), tone(GLIDE * 2 ** (1 / 12)), RATE)
    assert got["ok"] is False and got["reason"] == "median_shift"
    assert got["medianShiftCents"] == pytest.approx(100, abs=3)


def test_a_changed_contour_keeps_the_raw_audio():
    got = pitch_check(vibrato(1), vibrato(-1), RATE)
    assert got["ok"] is False and got["reason"] == "low_correlation"
    assert got["correlation"] < 0
    assert abs(got["medianShiftCents"]) < 10


def test_an_octave_slip_keeps_the_raw_audio():
    got = pitch_check(tone(GLIDE), tone(GLIDE * 2), RATE)
    assert got["ok"] is False and got["reason"] == "octave_jumps"


def test_a_flat_tone_is_judged_on_the_difference_not_the_correlation():
    assert pitch_check(tone(200.0), tone(200.0), RATE)["ok"] is True
    got = pitch_check(tone(200.0), tone(200.0 * 2 ** (80 / 1200)), RATE)
    assert got["ok"] is False and got["reason"] == "median_shift"


def test_nothing_voiced_cannot_be_checked():
    got = pitch_check(tone(GLIDE), np.zeros_like(T, dtype=np.float32), RATE)
    assert got["ok"] is False and got["reason"] == "too_few_voiced_frames"


def test_thresholds_are_arguments():
    strict = pitch_check(tone(GLIDE), tone(GLIDE * 2 ** (20 / 1200)), RATE, max_median_shift_cents=10)
    assert strict["reason"] == "median_shift"
