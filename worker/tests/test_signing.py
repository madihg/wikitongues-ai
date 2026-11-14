import json
from pathlib import Path

from igala_speech.signing import is_fresh, sign, verify

VECTOR = json.loads((Path(__file__).parent / "fixtures" / "hmac.json").read_text())


def test_matches_the_shared_vector():
    got = sign(VECTOR["secret"], VECTOR["timestamp"], VECTOR["body"])
    assert got == VECTOR["signature"]


def test_verify_accepts_and_rejects():
    args = (VECTOR["secret"], VECTOR["timestamp"], VECTOR["body"])
    assert verify(*args, VECTOR["signature"])
    assert not verify(VECTOR["secret"], VECTOR["timestamp"], VECTOR["body"] + " ", VECTOR["signature"])
    assert not verify("other", VECTOR["timestamp"], VECTOR["body"], VECTOR["signature"])
    assert not verify(*args, "")


def test_freshness_window_is_300_seconds():
    assert is_fresh("1000", now=1300)
    assert not is_fresh("1000", now=1301)
    assert not is_fresh("not-a-number", now=1000)
