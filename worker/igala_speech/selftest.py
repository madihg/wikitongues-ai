"""Scoring self-test: `python -m igala_speech.selftest` or `modal run worker/speech.py::selftest`."""

from .metrics import cer


def run() -> int:
    same = cer("abaka", "abaka")
    off = cer("abaka", "abeka")
    print(f"identical CER {same}")
    print(f"corrupted CER {off}")
    return 0 if same == 0.0 and abs(off - 0.2) < 1e-9 else 1


if __name__ == "__main__":
    raise SystemExit(run())
