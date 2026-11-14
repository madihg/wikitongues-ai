"""Round-trip gap and gate."""

import pytest

from igala_speech.roundtrip import paired_gap


def test_gap_and_gate():
    got = paired_gap([0.2, 0.3, 0.25, 0.4], [0.5, 0.6, 0.7, 0.9])
    assert got["n"] == 4
    assert got["humanCer"] == pytest.approx(0.2875)
    assert got["systemCer"] == pytest.approx(0.675)
    assert got["gap"] == pytest.approx(0.3875)
    assert got["lo"] <= got["gap"] <= got["hi"]
    assert got["ratio"] == pytest.approx(2.348, abs=0.001)
    assert got["passesGate"] is False
    assert got["resampledBy"] == "sentence"


def test_a_system_within_twice_the_human_cer_passes():
    assert paired_gap([0.2, 0.3], [0.3, 0.5])["passesGate"] is True
    assert paired_gap([0.2, 0.3], [0.5, 0.5])["passesGate"] is True
    assert paired_gap([0.2, 0.3], [0.5, 0.51])["passesGate"] is False


def test_the_interval_is_reproducible():
    a = paired_gap([0.1, 0.5, 0.3, 0.2, 0.4], [0.2, 0.9, 0.3, 0.6, 0.5])
    b = paired_gap([0.1, 0.5, 0.3, 0.2, 0.4], [0.2, 0.9, 0.3, 0.6, 0.5])
    assert a == b and a["lo"] < a["hi"]


def test_edges():
    assert paired_gap([], [])["passesGate"] is False
    assert paired_gap([0.0], [0.0])["ratio"] is None
    with pytest.raises(ValueError):
        paired_gap([0.1], [0.1, 0.2])
