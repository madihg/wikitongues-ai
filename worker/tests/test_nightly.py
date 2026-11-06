import httpx
import pytest

from igala_speech.nightly import trigger

ENV = {"SPEECH_WORKER_SECRET": "s3cret", "APP_BASE_URL": "https://app.invalid/"}


def _transport(status: int, payload: dict | None = None, seen: dict | None = None):
    def handler(request: httpx.Request):
        if seen is not None:
            seen["url"] = str(request.url)
            seen["secret"] = request.headers.get("x-shared-secret")
            seen["method"] = request.method
        return httpx.Response(status, json=payload or {})

    return httpx.MockTransport(handler)


def test_posts_to_the_nightly_route_with_the_shared_secret():
    seen: dict = {}
    payload = {"ok": True, "created": True, "run": {"runDate": "2026-11-07", "outcome": "trained"}}
    out = trigger(ENV, transport=_transport(200, payload, seen))
    assert seen == {"url": "https://app.invalid/api/speech/nightly", "secret": "s3cret", "method": "POST"}
    assert out == "nightly 2026-11-07: trained (created=True)"


def test_a_404_means_the_loop_is_off_and_is_not_an_error():
    assert "loop is off" in trigger(ENV, transport=_transport(404))


@pytest.mark.parametrize("status", [401, 500, 503])
def test_any_other_failure_raises_with_the_status_only(status):
    with pytest.raises(RuntimeError, match=f"HTTP {status}$"):
        trigger(ENV, transport=_transport(status, {"error": "do not echo me"}))


def test_missing_config_raises():
    with pytest.raises(RuntimeError, match="must be set"):
        trigger({"APP_BASE_URL": "https://app.invalid"})
