"""The callback signature, shared with web/src/lib/speech/job-signing.ts.

x-signature = hex HMAC-SHA256(secret, timestamp + "." + raw body), timestamp in
Unix seconds. worker/tests/fixtures/hmac.json is the vector both sides test.
"""

from __future__ import annotations

import hashlib
import hmac
import time

MAX_SKEW_SECONDS = 300


def sign(secret: str, timestamp: str, body: str) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def verify(secret: str, timestamp: str, body: str, signature: str) -> bool:
    return hmac.compare_digest(sign(secret, timestamp, body).encode(), signature.encode())


def is_fresh(timestamp: str, now: float | None = None) -> bool:
    try:
        sent = int(timestamp)
    except ValueError:
        return False
    return abs((time.time() if now is None else now) - sent) <= MAX_SKEW_SECONDS
