import json

import httpx
import pytest

from igala_speech.callback import build_body, callback
from igala_speech.signing import is_fresh, verify


def _env(monkeypatch):
    monkeypatch.setenv("SPEECH_WORKER_SECRET", "s3cret")
    monkeypatch.setenv("APP_BASE_URL", "https://app.invalid")


def test_body_has_the_agreed_fields():
    body = json.loads(build_body("j1", "evaluate", "succeeded", 100, "A10G", metrics={"x": 1}))
    assert body["jobId"] == "j1" and body["kind"] == "evaluate"
    assert body["gpuSeconds"] == 100 and body["costUsd"] == 0.0306
    assert body["metrics"] == {"x": 1} and body["error"] is None


def test_callback_signs_and_posts(monkeypatch):
    _env(monkeypatch)
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["h"] = dict(request.headers)
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"ok": True})

    body = build_body("j1", "transcribe", "succeeded", 5, "A10G", transcripts=[{"id": "a", "text": "t"}])
    callback(body, transport=httpx.MockTransport(handler), sleep=lambda s: None)
    assert seen["url"] == "https://app.invalid/api/speech/jobs/callback"
    assert seen["h"]["x-shared-secret"] == "s3cret"
    assert is_fresh(seen["h"]["x-timestamp"])
    assert verify("s3cret", seen["h"]["x-timestamp"], seen["body"], seen["h"]["x-signature"])


def test_callback_retries_three_times_with_backoff(monkeypatch):
    _env(monkeypatch)
    calls, sleeps = [], []

    def handler(request):
        calls.append(1)
        return httpx.Response(500) if len(calls) < 3 else httpx.Response(200)

    callback("{}", transport=httpx.MockTransport(handler), sleep=sleeps.append)
    assert len(calls) == 3 and sleeps == [1, 2]


def test_callback_gives_up_after_three_attempts(monkeypatch):
    _env(monkeypatch)
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503)

    with pytest.raises(RuntimeError):
        callback("{}", transport=httpx.MockTransport(handler), sleep=lambda s: None)
    assert len(calls) == 3


def test_callback_refuses_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SPEECH_WORKER_SECRET", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    with pytest.raises(RuntimeError):
        callback("{}", sleep=lambda s: None)
