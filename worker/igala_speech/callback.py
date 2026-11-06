"""Report a finished job to the app: signed POST with three attempts."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable

import httpx

from .rates import cost_usd
from .signing import sign

ATTEMPTS = 3


def build_body(
    job_id: str,
    kind: str,
    status: str,
    gpu_seconds: int,
    gpu: str,
    *,
    model_ref: str | None = None,
    metrics: dict | None = None,
    transcripts: list | None = None,
    outputs: list | None = None,
    error: str | None = None,
) -> str:
    body = {
        "jobId": job_id,
        "kind": kind,
        "status": status,
        "gpuSeconds": gpu_seconds,
        "costUsd": cost_usd(gpu, gpu_seconds),
        "modelRef": model_ref,
        "metrics": metrics,
        "transcripts": transcripts,
        "outputs": outputs,
        "error": error,
    }
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)


def callback(
    body: str,
    *,
    transport: httpx.BaseTransport | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    secret = os.environ.get("SPEECH_WORKER_SECRET")
    base = os.environ.get("APP_BASE_URL")
    if not secret or not base:
        raise RuntimeError("SPEECH_WORKER_SECRET and APP_BASE_URL must be set to call back")
    url = f"{base.rstrip('/')}/api/speech/jobs/callback"
    last = "no attempt"
    with httpx.Client(transport=transport, timeout=30) as client:
        for attempt in range(ATTEMPTS):
            ts = str(int(time.time()))  # re-signed per attempt: stays inside the 300 s window
            headers = {
                "content-type": "application/json",
                "x-shared-secret": secret,
                "x-timestamp": ts,
                "x-signature": sign(secret, ts, body),
            }
            try:
                res = client.post(url, content=body.encode(), headers=headers)
                if res.status_code < 300:
                    return
                last = f"status {res.status_code}"
            except httpx.HTTPError as exc:
                last = type(exc).__name__
            if attempt < ATTEMPTS - 1:
                sleep(2**attempt)
    raise RuntimeError(f"callback failed after {ATTEMPTS} attempts: {last}")
