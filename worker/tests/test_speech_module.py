"""speech.py needs the Modal SDK, which is not installed locally: import it against a stub."""

import importlib
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def speech(monkeypatch):
    stub = MagicMock()
    stub.App.return_value.function.side_effect = lambda *a, **k: (lambda fn: fn)
    stub.asgi_app.side_effect = lambda *a, **k: (lambda fn: fn)
    stub.App.return_value.local_entrypoint.side_effect = lambda *a, **k: (lambda fn: fn)
    monkeypatch.setitem(sys.modules, "modal", stub)
    monkeypatch.syspath_prepend(str(Path(__file__).parent.parent))
    sys.modules.pop("speech", None)
    return importlib.import_module("speech"), stub


def test_app_secret_and_volumes_are_named_as_documented(speech):
    _, stub = speech
    stub.App.assert_called_once_with("wikitongues-speech")
    args, kwargs = stub.Secret.from_name.call_args
    assert args == ("wikitongues-speech",)
    assert kwargs["required_keys"] == [
        "SPEECH_WORKER_SECRET", "APP_BASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    ]
    names = [c.args[0] for c in stub.Volume.from_name.call_args_list]
    assert names == ["wikitongues-speech-models", "wikitongues-speech-checkpoints"]


def test_every_endpoint_kind_has_a_function(speech):
    mod, _ = speech
    from igala_speech.jobs import ENDPOINT_KINDS

    assert set(mod.SPAWN) == set(ENDPOINT_KINDS.values())
