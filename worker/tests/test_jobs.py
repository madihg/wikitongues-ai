import pytest
from pydantic import ValidationError

from igala_speech.jobs import parse_job


def test_transcribe_job_parses_a_manifest(mock_lines):
    job = parse_job("transcribe", {"jobId": "j1", "manifest": mock_lines})
    assert job.jobId == "j1"
    assert [m.id for m in job.manifest] == ["fx-1", "fx-2", "fx-3"]
    assert job.modelRef == "base"


def test_train_asr_defaults_follow_the_brief(mock_lines):
    job = parse_job("train_asr", {"jobId": "j2", "manifest": mock_lines})
    assert job.config.numSteps == 5000
    assert job.config.lr == 1e-5
    assert job.baseModel == "omniASR_CTC_300M_v2"


def test_empty_manifest_and_missing_job_id_are_rejected(mock_lines):
    with pytest.raises(ValidationError):
        parse_job("transcribe", {"jobId": "j1", "manifest": []})
    with pytest.raises(ValidationError):
        parse_job("transcribe", {"manifest": mock_lines})


def test_line_needs_a_url_and_a_language(mock_lines):
    bad = [{**mock_lines[0], "language": "french"}]
    with pytest.raises(ValidationError):
        parse_job("transcribe", {"jobId": "j", "manifest": bad})


def test_synthesize_takes_sentences():
    job = parse_job("synthesize", {"jobId": "j", "modelRef": "tts-1", "sentences": [{"id": "p1", "text": "hello"}]})
    assert job.sentences[0].id == "p1"


def test_unknown_kind_is_a_key_error():
    with pytest.raises(KeyError):
        parse_job("nope", {})
