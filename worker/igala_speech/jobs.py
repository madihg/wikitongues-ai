"""Job bodies the Modal endpoints accept, validated with pydantic.

A manifest line is the app's TrainingLine (web/src/lib/speech/training-manifest.ts).
"""

from __future__ import annotations

import hmac
from typing import Literal

from pydantic import BaseModel, Field

ENDPOINT_KINDS = {
    "transcribe": "transcribe",
    "train-asr": "train_asr",
    "evaluate": "evaluate",
    "train-tts": "train_tts",
    "synthesize": "synthesize",
}


def check_secret(given: str | None, expected: str) -> bool:
    """Constant-time, on bytes: a non-ASCII header is a no, not a crash."""
    if not given or not expected:
        return False
    return hmac.compare_digest(given.encode("utf-8", "surrogateescape"), expected.encode())


class Line(BaseModel):
    id: str
    url: str
    durationMs: int = Field(ge=0)
    language: Literal["igala", "english"]
    transcript: str
    transcriptStripped: str = ""
    speakerPseudonym: str
    dialect: str | None = None
    tier: str = "community_only"


class Sentence(BaseModel):
    id: str
    text: str


class TrainConfig(BaseModel):
    numSteps: int = Field(default=5000, gt=0)
    lr: float = Field(default=1e-5, gt=0)


class TranscribeJob(BaseModel):
    jobId: str = Field(min_length=1)
    manifest: list[Line] = Field(min_length=1)
    modelRef: str = "base"


class TrainAsrJob(BaseModel):
    jobId: str = Field(min_length=1)
    manifest: list[Line] = Field(min_length=1)
    devManifest: list[Line] = []
    baseModel: str = "omniASR_CTC_300M_v2"
    config: TrainConfig = TrainConfig()


class EvaluateJob(BaseModel):
    jobId: str = Field(min_length=1)
    manifest: list[Line] = Field(min_length=1)
    modelRef: str = "base"
    manifestVersion: str = ""


class TrainTtsJob(BaseModel):
    jobId: str = Field(min_length=1)
    manifest: list[Line] = Field(min_length=1)
    baseModel: str = "everyvoice-fastspeech2"
    config: TrainConfig = TrainConfig(numSteps=100000, lr=1e-4)


class SynthesizeJob(BaseModel):
    jobId: str = Field(min_length=1)
    modelRef: str = Field(min_length=1)
    sentences: list[Sentence] = Field(min_length=1)


MODELS = {
    "transcribe": TranscribeJob,
    "train_asr": TrainAsrJob,
    "evaluate": EvaluateJob,
    "train_tts": TrainTtsJob,
    "synthesize": SynthesizeJob,
}


def parse_job(kind: str, raw: dict):
    """KeyError for an unknown kind, pydantic ValidationError for a bad body."""
    return MODELS[kind].model_validate(raw)
