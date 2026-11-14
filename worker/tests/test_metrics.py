"""Metrics parity: the same fixture file the TypeScript tests read.

The fixture lives at web/src/lib/speech/metrics.fixtures.json (invented words
only). Every number must match to 4 decimals, so a score computed in the app
and a score computed on the GPU worker are the same score.
"""

import json
from pathlib import Path

import pytest

from igala_speech.metrics import cer, score_all, ter, wer, wer_tone_retained
from igala_speech.normalise import normalise_for_scoring, tone_strip

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = REPO_ROOT / "web" / "src" / "lib" / "speech" / "metrics.fixtures.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_fixture_has_enough_cases():
    assert len(CASES) >= 12


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_fixture_case(case):
    ref, hyp = case["ref"], case["hyp"]
    assert round(cer(ref, hyp), 4) == case["cer"]
    assert round(wer(ref, hyp), 4) == case["werStripped"]
    assert round(wer_tone_retained(ref, hyp), 4) == case["werRetained"]
    assert round(ter(ref, hyp), 4) == case["ter"]
    got = score_all(ref, hyp)
    assert round(got["cer"], 4) == case["cer"]
    assert round(got["werStripped"], 4) == case["werStripped"]
    assert round(got["werRetained"], 4) == case["werRetained"]
    assert round(got["ter"], 4) == case["ter"]


def test_score_all_keys():
    assert sorted(score_all("tava", "tava")) == [
        "cer",
        "ter",
        "werRetained",
        "werStripped",
    ]


def test_tone_strip_keeps_dot_below_and_tilde_on_n():
    assert tone_strip("ẹ́") == "ẹ"
    assert tone_strip("ñã") == "ña"


def test_normalise_matches_typescript_rules():
    assert normalise_for_scoring("Táva,  M’ola!") == "táva m'ola"
    assert normalise_for_scoring("Táva", tones="strip") == "tava"
    assert normalise_for_scoring("-a- 'b'") == "a b"
