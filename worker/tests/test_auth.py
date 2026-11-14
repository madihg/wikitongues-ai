
from igala_speech.jobs import ENDPOINT_KINDS, check_secret


def test_secret_must_match_exactly():
    assert check_secret("abc", "abc")
    assert not check_secret("abd", "abc")
    assert not check_secret(None, "abc")
    assert not check_secret("", "abc")
    assert not check_secret("abc", "")


def test_non_ascii_header_is_a_no_not_a_crash():
    assert not check_secret("é", "abc")


def test_endpoints_map_to_kinds():
    assert ENDPOINT_KINDS == {
        "transcribe": "transcribe",
        "train-asr": "train_asr",
        "evaluate": "evaluate",
        "train-tts": "train_tts",
        "synthesize": "synthesize",
    }
