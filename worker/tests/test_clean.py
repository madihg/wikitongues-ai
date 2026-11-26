"""The cleaning derivative: loudness maths, the pitch guard, the two copies."""

import numpy as np
import pytest

from igala_speech.clean import make_derivative, normalise_loudness, resample
from igala_speech.quality import integrated_lufs, true_peak_dbfs

RATE = 48000
T = np.arange(RATE * 3) / RATE
GLIDE = 150 + 100 * T / 3


def voice(peak: float = 0.3, freq=GLIDE) -> np.ndarray:
    """A gliding tone with harmonics: enough of a voice for loudness and pitch."""
    phase = 2 * np.pi * np.cumsum(np.broadcast_to(freq, T.shape)) / RATE
    x = np.sin(phase) + 0.5 * np.sin(2 * phase) + 0.25 * np.sin(3 * phase)
    return (peak * x / np.max(np.abs(x))).astype(np.float32)


def test_normalise_reaches_the_target():
    out, info = normalise_loudness(voice(0.05), RATE)
    assert integrated_lufs(out, RATE) == pytest.approx(-23, abs=0.1)
    assert info["limitedByPeak"] is False and info["gainDb"] > 0


def test_normalise_turns_a_loud_clip_down():
    out, info = normalise_loudness(voice(0.9), RATE)
    assert integrated_lufs(out, RATE) == pytest.approx(-23, abs=0.1)
    assert info["gainDb"] < 0


def test_the_peak_ceiling_wins_over_the_target():
    # One loud click in a quiet clip: the gain stops where the click reaches -1 dBFS.
    x = voice(0.02)
    x[RATE] = 0.5
    out, info = normalise_loudness(x, RATE)
    assert info["limitedByPeak"] is True
    assert true_peak_dbfs(out) == pytest.approx(-1, abs=0.05)
    assert integrated_lufs(out, RATE) < -23


def test_silence_is_left_alone():
    out, info = normalise_loudness(np.zeros(RATE, np.float32), RATE)
    assert info["skipped"] == "no_loudness" and not out.any()


def test_resample_keeps_the_tone():
    x = voice()
    y = resample(x, RATE, 16000)
    assert len(y) == 48000
    assert integrated_lufs(y, 16000) == pytest.approx(integrated_lufs(x, RATE), abs=0.2)


def test_derivative_with_a_harmless_denoiser():
    raw = voice(0.05)
    before = raw.copy()
    got = make_derivative(raw, RATE, lambda x, r: x.copy(), denoiser_version="test", denoiser_params={"a": 1})
    log = got["log"]
    assert np.array_equal(raw, before)  # the raw clip is never changed in place
    assert log["usedDenoised"] is True and "keptRawBecause" not in log
    assert log["denoiser"] == {"tool": "DeepFilterNet3", "version": "test", "params": {"a": 1}}
    assert log["pitchCheck"]["ok"] is True
    assert sorted(got["copies"]) == [16000, 24000]
    assert len(got["copies"][24000]) == 72000 and len(got["copies"][16000]) == 48000
    assert log["after"]["lufs"] == pytest.approx(-23, abs=0.2)
    assert log["after"]["truePeakDbfs"] <= -1.0
    assert log["before"]["lufs"] < -30
    assert log["cleanVersion"] == "clean-v1" and log["gatesVersion"]


def test_derivative_keeps_raw_when_the_denoiser_bends_pitch():
    raw = voice(0.3)
    bent = voice(0.3, GLIDE * 2 ** (2 / 12))
    got = make_derivative(raw, RATE, lambda x, r: bent)
    log = got["log"]
    assert log["usedDenoised"] is False
    assert log["keptRawBecause"] == "median_shift"
    # What was normalised is the raw clip: same pitch as the input.
    from igala_speech.f0 import pitch_check

    assert pitch_check(raw, resample(got["copies"][24000], 24000, RATE), RATE)["ok"] is True


def test_derivative_without_a_denoiser_still_normalises():
    got = make_derivative(voice(0.05), RATE, None)
    assert got["log"]["keptRawBecause"] == "no_denoiser"
    assert got["log"]["denoiser"]["tool"] is None
    assert got["log"]["after"]["lufs"] == pytest.approx(-23, abs=0.2)


def test_every_copy_stays_under_the_ceiling():
    x = voice(0.02)
    x[RATE] = 0.9
    got = make_derivative(x, RATE, None)
    for rate, copy in got["copies"].items():
        assert true_peak_dbfs(copy) <= -0.99, rate


def test_the_log_names_the_denoiser_it_was_given():
    got = make_derivative(voice(0.05), RATE, lambda x, r: x.copy(), denoiser_name="Other")
    assert got["log"]["denoiser"]["tool"] == "Other"


def test_inworld_adapter_has_the_denoiser_shape(monkeypatch):
    """The package is not installed here: a stand-in with its documented calls."""
    import sys
    import types

    from igala_speech.clean import INWORLD_DENOISER, inworld_voice_isolator

    seen = {}

    class VoiceIsolator:
        device, precision, sample_rate = "cpu", "fp32", 48000

        def __init__(self, repo, device=None):
            seen["repo"] = repo

        def isolate(self, audio, sample_rate):
            seen["rate"] = sample_rate
            return audio * 0.5

    inworld = types.ModuleType("inworld")
    inworld.voice_isolation = types.SimpleNamespace(
        VoiceIsolator=VoiceIsolator, __version__="9.9"
    )
    monkeypatch.setitem(sys.modules, "inworld", inworld)
    run, version, params = inworld_voice_isolator()
    x = voice(0.2)
    out = run(x, RATE)
    assert seen == {"repo": "inworld/voice-isolator", "rate": RATE}
    assert out.dtype == np.float32 and out.shape == x.shape
    assert version == "9.9" and params["model"] == INWORLD_DENOISER
    got = make_derivative(
        x, RATE, run, denoiser_version=version, denoiser_params=params,
        denoiser_name=INWORLD_DENOISER,
    )
    assert got["log"]["denoiser"]["tool"] == "InworldVoiceIsolatorV1"
    assert got["log"]["usedDenoised"] is True
