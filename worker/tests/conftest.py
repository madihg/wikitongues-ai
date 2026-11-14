import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setenv("SPEECH_WORKER_MOCK", "1")
    monkeypatch.setenv("SPEECH_MOCK_SLEEP", "0")


@pytest.fixture
def mock_lines():
    data = json.loads((FIXTURES / "mock.json").read_text())["lines"]
    return [
        {
            "id": r["id"],
            "url": f"https://signed.invalid/{r['id']}",
            "durationMs": r["durationMs"],
            "language": r["language"],
            "transcript": r["reference"],
            "transcriptStripped": r["reference"],
            "speakerPseudonym": r["speakerPseudonym"],
            "dialect": r["dialect"],
            "tier": "community_only",
        }
        for r in data
    ]
