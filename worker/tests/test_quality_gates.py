"""Gate parity: the constants and the fixture the TypeScript tests read.

web/src/lib/speech/quality-gates.json is the one place the thresholds live.
The worker image cannot read it, so quality_gates.GATES repeats the values;
this test fails the moment the two differ. The fixture cases are the same file
quality-gates.test.ts runs, so a verdict in the app is a verdict on the worker.
"""

import json
from pathlib import Path

import pytest

from igala_speech.quality_gates import (
    GATES,
    gate_verdict,
    loudness_gain_db,
    meter_zone,
    passes_round_trip_gate,
)

SPEECH = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "speech"
SHARED = json.loads((SPEECH / "quality-gates.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((SPEECH / "quality-gates.fixtures.json").read_text(encoding="utf-8"))


def test_python_constants_equal_the_shared_file():
    shared = {k: v for k, v in SHARED.items() if not k.startswith("_")}
    assert GATES == shared


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[c["id"] for c in FIXTURE["cases"]])
def test_verdict(case):
    assert gate_verdict(case["measure"]) == {
        "verdict": case["verdict"],
        "reasons": case["reasons"],
    }


@pytest.mark.parametrize("case", FIXTURE["loudness"])
def test_loudness_gain(case):
    gain, limited = loudness_gain_db(case["lufs"], case["truePeakDbfs"])
    assert round(gain, 1) + 0 == case["gainDb"]
    assert limited is case["limited"]


@pytest.mark.parametrize("case", FIXTURE["meter"])
def test_meter_zone(case):
    assert meter_zone(case["peakDbfs"]) == case["zone"]


@pytest.mark.parametrize("case", FIXTURE["roundTrip"])
def test_round_trip_gate(case):
    assert passes_round_trip_gate(case["systemCer"], case["humanCer"]) is case["passes"]


def test_a_boolean_is_not_a_measurement():
    assert gate_verdict({"peakDbfs": True, "clippedShare": False}) == {
        "verdict": "accept",
        "reasons": [],
    }
