import json

import pytest

from igala_speech import pipeline
from igala_speech.jobs import parse_job


def test_transcribe_returns_fixture_transcripts(mock_lines):
    job = parse_job("transcribe", {"jobId": "j1", "manifest": mock_lines})
    out = pipeline.transcribe(job)
    assert out["transcripts"] == [
        {"id": "fx-1", "text": "the red boat sails"},
        {"id": "fx-2", "text": "abeka"},
        {"id": "fx-3", "text": "two small lamps"},
    ]
    assert out["modelRef"] == "base"
    assert out["gpu"] == "A10G" and out["gpuSeconds"] > 0


def test_evaluate_returns_known_numbers(mock_lines):
    job = parse_job("evaluate", {"jobId": "j2", "manifest": mock_lines, "manifestVersion": "v-test"})
    m = pipeline.evaluate(job)["metrics"]
    assert m["manifestVersion"] == "v-test" and m["nClips"] == 3
    assert m["aggregate"]["cer"] == pytest.approx(0.2 / 3)
    assert m["aggregate"]["werStripped"] == pytest.approx(1 / 3)
    assert m["perSpeaker"]["spk-a"]["cer"] == pytest.approx(0.1)
    assert m["perSpeaker"]["spk-a"]["nClips"] == 2
    assert m["perSpeaker"]["spk-b"]["cer"] == 0.0
    assert set(m["perDialect"]) == {"north", "south"}


def test_train_asr_and_tts_return_a_fake_model_ref(mock_lines):
    asr = pipeline.train_asr(parse_job("train_asr", {"jobId": "j3", "manifest": mock_lines}))
    assert asr["modelRef"] == "/checkpoints/asr/j3" and asr["gpu"] == "A100-80GB"
    tts = pipeline.train_tts(parse_job("train_tts", {"jobId": "j4", "manifest": mock_lines}))
    assert tts["modelRef"] == "/checkpoints/tts/j4" and tts["gpu"] == "A10G"


def test_synthesize_returns_keys_under_tts_job_id():
    job = parse_job("synthesize", {"jobId": "j5", "modelRef": "tts-1", "sentences": [{"id": "p1", "text": "hello"}, {"id": "p2", "text": "bye"}]})
    out = pipeline.synthesize(job)
    assert [o["key"] for o in out["outputs"]] == ["tts/j5/p1.wav", "tts/j5/p2.wav"]
    assert all(o["sampleRate"] == 22050 and o["durationMs"] > 0 for o in out["outputs"])


def test_run_job_posts_one_callback_and_logs_no_text(mock_lines, monkeypatch, capsys):
    monkeypatch.setenv("SPEECH_WORKER_SECRET", "s")
    monkeypatch.setenv("APP_BASE_URL", "https://app.invalid")
    sent = []
    monkeypatch.setattr(pipeline, "callback", lambda body, **kw: sent.append(json.loads(body)))
    pipeline.run_job("transcribe", {"jobId": "j6", "manifest": mock_lines})
    assert len(sent) == 1 and sent[0]["status"] == "succeeded" and sent[0]["kind"] == "transcribe"
    log = capsys.readouterr().out
    assert "j6" in log and "abeka" not in log and "red boat" not in log


def test_run_job_reports_failure_in_the_callback(mock_lines, monkeypatch):
    sent = []
    monkeypatch.setattr(pipeline, "callback", lambda body, **kw: sent.append(json.loads(body)))
    monkeypatch.setattr(pipeline, "transcribe", lambda job: (_ for _ in ()).throw(ValueError("boom")))
    pipeline.run_job("transcribe", {"jobId": "j7", "manifest": mock_lines})
    assert sent[0]["status"] == "failed" and "boom" in sent[0]["error"]
