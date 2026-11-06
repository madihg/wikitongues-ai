"""The five jobs. Mock mode (SPEECH_WORKER_MOCK=1) needs no network, no GPU, no models.

Each job function takes a validated job and returns a dict:
{gpu, gpuSeconds, modelRef?, metrics? | transcripts? | outputs?}. run_job wraps
one in the callback and never logs transcripts, only ids and numbers.

The real branches (everything after `if mock():`) import torch, omnilingual_asr,
pyarrow and everyvoice lazily; they exist only in the Modal image, and they have
not been run yet. The first real transcribe is their smoke test (worker/README.md).
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
import time
from collections import defaultdict
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

from .audio import RATE, to_16k_mono, wav_bytes
from .callback import build_body, callback
from .jobs import (
    EvaluateJob,
    Line,
    SynthesizeJob,
    TrainAsrJob,
    TrainTtsJob,
    TranscribeJob,
    parse_job,
)
from .metrics import score_all

HERE = Path(__file__).parent
MODELS_DIR = "/models"
CHECKPOINTS_DIR = "/checkpoints"
BASE_ASR = "omniASR_CTC_300M_v2"
ASR_LANG = "igl_Latn"
TTS_RATE = 22050
BUCKET = "igala-speech"
# The Omnilingual ctc-finetune recipe, as an argv. One place to fix at the first real run.
ASR_RECIPE = ["python", "-m", "workflows.recipes.wav2vec2.asr"]

GPU_FOR = {
    "transcribe": "A10G",
    "evaluate": "A10G",
    "train_asr": "A100-80GB",
    "train_tts": "A10G",
    "synthesize": "A10G",
}
METRIC_KEYS = ("cer", "werStripped", "werRetained", "ter")


def mock() -> bool:
    return os.environ.get("SPEECH_WORKER_MOCK") == "1"


def _mock_sleep() -> None:
    time.sleep(float(os.environ.get("SPEECH_MOCK_SLEEP", "1")))


def _mock_fixtures() -> dict[str, str]:
    path = HERE.parent / "tests" / "fixtures" / "mock.json"
    return {r["id"]: r["hypothesis"] for r in json.loads(path.read_text())["lines"]}


def _seconds(start: float) -> int:
    return max(1, math.ceil(time.monotonic() - start))


# ---------------------------------------------------------------- audio in

def _download(lines: list[Line], tmp: Path) -> dict[str, np.ndarray]:
    clips: dict[str, np.ndarray] = {}
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for line in lines:
            raw = tmp / f"{line.id}.src"
            with client.stream("GET", line.url) as res:
                res.raise_for_status()
                raw.write_bytes(b"".join(res.iter_bytes()))
            clips[line.id] = to_16k_mono(raw)
    return clips


def _asr_pipeline(model_ref: str):
    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline

    if model_ref == "base":
        return ASRInferencePipeline(model_card=BASE_ASR)
    # A fine-tuned checkpoint: register a fairseq2 asset card that points at it.
    cards = Path.home() / ".config" / "fairseq2" / "assets"
    cards.mkdir(parents=True, exist_ok=True)
    name = "wt_" + Path(model_ref).name
    (cards / f"{name}.yaml").write_text(
        f"name: {name}\nbase: {BASE_ASR}\ncheckpoint: file://{model_ref}\n"
    )
    return ASRInferencePipeline(model_card=name)


def _transcribe_lines(lines: list[Line], model_ref: str) -> dict[str, str]:
    if mock():
        fx = _mock_fixtures()
        return {l.id: fx.get(l.id, "") for l in lines}
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        clips = _download(lines, tmp)
        paths = []
        for l in lines:
            p = tmp / f"{l.id}.wav"
            sf.write(p, clips[l.id], RATE)
            paths.append(str(p))
        pipe = _asr_pipeline(model_ref)
        texts = pipe.transcribe(paths, lang=[ASR_LANG] * len(paths), batch_size=8)
    return dict(zip([l.id for l in lines], texts))


# ------------------------------------------------------------------- jobs

def transcribe(job: TranscribeJob) -> dict:
    start = time.monotonic()
    by_id = _transcribe_lines(job.manifest, job.modelRef)
    if mock():
        _mock_sleep()
    return {
        "gpu": GPU_FOR["transcribe"],
        "gpuSeconds": _seconds(start),
        "modelRef": job.modelRef,
        "transcripts": [{"id": l.id, "text": by_id[l.id]} for l in job.manifest],
    }


def _mean(rows: list[dict]) -> dict:
    out = {k: sum(r[k] for r in rows) / len(rows) for k in METRIC_KEYS}
    out["nClips"] = len(rows)
    return out


def evaluate(job: EvaluateJob) -> dict:
    start = time.monotonic()
    hyp = _transcribe_lines(job.manifest, job.modelRef)
    per_clip = {l.id: score_all(l.transcript, hyp[l.id]) for l in job.manifest}
    by_speaker: dict[str, list[dict]] = defaultdict(list)
    by_dialect: dict[str, list[dict]] = defaultdict(list)
    for l in job.manifest:
        by_speaker[l.speakerPseudonym].append(per_clip[l.id])
        by_dialect[l.dialect or "unknown"].append(per_clip[l.id])
    aggregate = _mean(list(per_clip.values()))
    metrics = {
        "manifestVersion": job.manifestVersion,
        "nClips": len(per_clip),
        "aggregate": {k: aggregate[k] for k in METRIC_KEYS},
        "perSpeaker": {k: _mean(v) for k, v in sorted(by_speaker.items())},
        "perDialect": {k: _mean(v) for k, v in sorted(by_dialect.items())},
    }
    if mock():
        _mock_sleep()
    return {
        "gpu": GPU_FOR["evaluate"],
        "gpuSeconds": _seconds(start),
        "modelRef": job.modelRef,
        "metrics": metrics,
    }


def train_asr(job: TrainAsrJob) -> dict:
    start = time.monotonic()
    out_dir = f"{CHECKPOINTS_DIR}/asr/{job.jobId}"
    if mock():
        _mock_sleep()
    else:
        from .parquet import partition_dir, recipe_rows, write_parquet

        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "data"
            for split, lines in (("train", job.manifest), ("dev", job.devManifest)):
                if lines:
                    clips = _download(lines, Path(d))
                    write_parquet(recipe_rows(lines, clips, split), partition_dir(root, split) / "part-0.parquet")
            cfg = Path(d) / "config.yaml"
            cfg.write_text(
                f"model:\n  name: {job.baseModel}\ndataset:\n  path: {root}\n"
                f"regime:\n  lr: {job.config.lr}\n  num_steps: {job.config.numSteps}\n"
            )
            subprocess.run([*ASR_RECIPE, out_dir, "--config-file", str(cfg)], check=True)
    return {"gpu": GPU_FOR["train_asr"], "gpuSeconds": _seconds(start), "modelRef": out_dir}


def train_tts(job: TrainTtsJob) -> dict:
    start = time.monotonic()
    out_dir = f"{CHECKPOINTS_DIR}/tts/{job.jobId}"
    if mock():
        _mock_sleep()
    else:
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            clips = _download(job.manifest, tmp)
            wavs = tmp / "wavs"
            wavs.mkdir()
            rows = []
            for l in job.manifest:
                sf.write(wavs / f"{l.id}.wav", clips[l.id], RATE)
                rows.append(f"{l.id}|{l.transcript}|{l.speakerPseudonym}|igl")
            (tmp / "filelist.psv").write_text("basename|text|speaker|language\n" + "\n".join(rows) + "\n")
            # EveryVoice reads its project config from the working directory.
            subprocess.run(["everyvoice", "preprocess", "config/everyvoice-text-to-spec.yaml"], cwd=tmp, check=True)
            subprocess.run(
                ["everyvoice", "train", "text-to-spec", "config/everyvoice-text-to-spec.yaml",
                 "--config-args", f"training.max_steps={job.config.numSteps}", "--config-args", f"training.logger.save_dir={out_dir}"],
                cwd=tmp, check=True,
            )
    return {"gpu": GPU_FOR["train_tts"], "gpuSeconds": _seconds(start), "modelRef": out_dir}


def _upload(key: str, data: bytes) -> None:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    token = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    res = httpx.post(
        f"{url}/storage/v1/object/{BUCKET}/{key}",
        content=data,
        headers={"authorization": f"Bearer {token}", "content-type": "audio/wav", "x-upsert": "false"},
        timeout=60,
    )
    res.raise_for_status()


def synthesize(job: SynthesizeJob) -> dict:
    start = time.monotonic()
    outputs = []
    for s in job.sentences:
        key = f"tts/{job.jobId}/{s.id}.wav"
        if mock():
            t = np.arange(int(TTS_RATE * 0.5)) / TTS_RATE
            audio = (0.2 * np.sin(2 * np.pi * 240 * t)).astype(np.float32)
        else:
            with tempfile.TemporaryDirectory() as d:
                subprocess.run(
                    ["everyvoice", "synthesize", "from-text", job.modelRef, "--text", s.text,
                     "--output-dir", d, "--filelist-format", "wav"],
                    check=True,
                )
                audio, rate = sf.read(next(Path(d).glob("*.wav")), dtype="float32")
                assert rate == TTS_RATE, f"unexpected sample rate {rate}"
            _upload(key, wav_bytes(audio, TTS_RATE))
        outputs.append({"sentenceId": s.id, "key": key, "durationMs": int(len(audio) * 1000 / TTS_RATE), "sampleRate": TTS_RATE})
    if mock():
        _mock_sleep()
    return {"gpu": GPU_FOR["synthesize"], "gpuSeconds": _seconds(start), "modelRef": job.modelRef, "outputs": outputs}


def run_job(kind: str, raw: dict) -> None:
    """Run one job and end with the callback. Failures are reported, not raised."""
    job_id = str(raw.get("jobId", ""))
    start = time.monotonic()
    try:
        job = parse_job(kind, raw)
        result = globals()[kind](job)
        body = build_body(
            job.jobId, kind, "succeeded", result["gpuSeconds"], result["gpu"],
            model_ref=result.get("modelRef"), metrics=result.get("metrics"),
            transcripts=result.get("transcripts"), outputs=result.get("outputs"),
        )
        print(f"job {job_id} {kind} succeeded gpuSeconds={result['gpuSeconds']}")
    except Exception as exc:  # noqa: BLE001  report every failure, never transcripts
        seconds = _seconds(start)
        gpu = GPU_FOR.get(kind, "A10G")
        body = build_body(job_id, kind, "failed", seconds, gpu, error=f"{type(exc).__name__}: {str(exc)[:300]}")
        print(f"job {job_id} {kind} failed {type(exc).__name__}")
    callback(body)
