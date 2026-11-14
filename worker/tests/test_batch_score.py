"""Scoring a set three ways (invented words only)."""

import pytest

from igala_speech.batch_score import score_set
from igala_speech.metrics import ter, ter_counts

REFS = {"a": "táva lime", "b": "sura mota", "c": "tàva limé sura"}
HYPS = {"a": "tava lime", "b": "sura mota", "c": "tàva lime sura"}
META = {"a": {"speaker": "s1", "dialect": "d1"}, "b": {"speaker": "s1"}, "c": {"speaker": "s2", "dialect": "d1"}}


def test_three_ways_per_clip_and_in_aggregate():
    got = score_set(REFS, HYPS, META)
    assert got["nClips"] == 3
    a = got["perClip"]["a"]
    assert a["cer"] == 0 and a["werStripped"] == 0  # tone marks stripped: identical
    assert a["cerRetained"] == pytest.approx(1 / 9, abs=1e-4) and a["werRetained"] == 0.5
    assert a["ter"] == 1.0
    assert got["perClip"]["b"] == {"cer": 0, "werStripped": 0, "werRetained": 0, "ter": 0, "cerRetained": 0}
    assert got["aggregate"]["cer"] == 0
    assert got["aggregate"]["ter"] == pytest.approx((1 + 0 + 0.5) / 3, abs=1e-4)
    lo, hi = got["interval95"]["ter"]
    assert lo <= got["aggregate"]["ter"] <= hi


def test_tone_figures_are_also_given_on_the_marked_clips_only():
    got = score_set(REFS, HYPS, META)
    assert got["toneMarkedClips"]["nClips"] == 2
    assert got["toneMarkedClips"]["ter"] == 0.75
    assert got["pooled"]["markedVowels"] == 3
    assert got["pooled"]["ter"] == pytest.approx(2 / 3, abs=1e-4)
    assert got["pooled"]["cer"] == 0
    assert got["pooled"]["cerRetained"] == pytest.approx(2 / 32, abs=1e-4)


def test_groups_and_missing_transcripts():
    got = score_set(REFS, {"a": "tava lime", "c": ""}, META)
    assert got["nClips"] == 2
    assert got["perClip"]["c"]["cer"] == 1
    assert got["perSpeaker"]["s1"]["nClips"] == 1 and got["perSpeaker"]["s2"]["nClips"] == 1
    assert got["perDialect"]["d1"]["nClips"] == 2
    assert got["perSpeaker"]["s1"]["markedVowels"] == 1 and got["perSpeaker"]["s1"]["terPooled"] == 1.0
    assert got["perSpeaker"]["s2"]["markedVowels"] == 2 and got["perSpeaker"]["s2"]["terPooled"] == 1.0
    with pytest.raises(ValueError):
        score_set(REFS, {})


def test_ter_counts_agree_with_ter():
    assert ter_counts("táva limé", "tava limé") == (1, 2)
    assert ter("táva limé", "tava limé") == 0.5
    assert ter_counts("tava", "táva") == (0, 0)
