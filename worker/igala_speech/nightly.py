"""The 02:00 trigger: ask the app to run tonight's loop. No audio, no clip text."""

from __future__ import annotations

import os
from collections.abc import Mapping

import httpx


def trigger(env: Mapping[str, str] | None = None, *, transport: httpx.BaseTransport | None = None) -> str:
    """POST APP_BASE_URL/api/speech/nightly with the shared secret. Returns a one-line status.

    404 means the app's SPEECH_LOOP_ENABLED is off: that is a normal "not yet",
    so it returns instead of raising. Any other failure raises, so Modal marks
    the scheduled run failed and Halim sees it in the dashboard.
    """
    env = os.environ if env is None else env
    secret = env.get("SPEECH_WORKER_SECRET")
    base = env.get("APP_BASE_URL")
    if not secret or not base:
        raise RuntimeError("SPEECH_WORKER_SECRET and APP_BASE_URL must be set to trigger the nightly run")
    url = f"{base.rstrip('/')}/api/speech/nightly"
    with httpx.Client(transport=transport, timeout=290) as client:
        res = client.post(url, headers={"x-shared-secret": secret})
    if res.status_code == 404:
        return "loop is off (HTTP 404): nothing to do"
    if res.status_code != 200:
        # Status only: the app's error body is never echoed into logs.
        raise RuntimeError(f"nightly trigger failed: HTTP {res.status_code}")
    data = res.json()
    run = data.get("run", {})
    return f"nightly {run.get('runDate')}: {run.get('outcome')} (created={data.get('created')})"
