"""Wikitongues Igala speech worker on Modal: transcribe, train, score, synthesise.

Follows Halim's Modal conventions (ai-college-workshop/modal/studio.py): one app,
one ASGI app with an x-shared-secret header, one secret, named volumes. The
worker holds no database credentials. Every job ends with a signed callback to
the app (igala_speech/callback.py); the app writes the rows.

    modal secret create wikitongues-speech SPEECH_WORKER_SECRET=... APP_BASE_URL=... \
        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
    modal deploy worker/speech.py

Endpoints (x-shared-secret on all but /health), each answers {callId, jobId}:
    GET  /health
    POST /transcribe  {jobId, manifest, modelRef?}
    POST /train-asr   {jobId, manifest, devManifest?, baseModel?, config?}
    POST /evaluate    {jobId, manifest, modelRef?, manifestVersion}
    POST /train-tts   {jobId, manifest, baseModel?, config?}
    POST /synthesize  {jobId, modelRef, sentences: [{id, text}]}
    GET  /status/{callId}   queued|running|done|failed

Schedule: nightly_trigger runs at 02:00 UTC (modal.Cron) and POSTs
APP_BASE_URL/api/speech/nightly with the shared secret. It exists once Halim
runs `modal deploy`; the app ignores it until SPEECH_LOOP_ENABLED=1.

Local, no GPU, no Modal account: SPEECH_WORKER_MOCK=1 and
`python -m igala_speech.selftest` (or `pytest`).
"""

import sys
from pathlib import Path

import modal

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

APP_NAME = "wikitongues-speech"
MODELS_DIR = "/models"
CHECKPOINTS_DIR = "/checkpoints"

app = modal.App(APP_NAME)
secret = modal.Secret.from_name(
    "wikitongues-speech",
    required_keys=["SPEECH_WORKER_SECRET", "APP_BASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
)
models_volume = modal.Volume.from_name("wikitongues-speech-models", create_if_missing=True)
checkpoints_volume = modal.Volume.from_name("wikitongues-speech-checkpoints", create_if_missing=True)
volumes = {MODELS_DIR: models_volume, CHECKPOINTS_DIR: checkpoints_volume}

# Shared packages for every image. Versions are unpinned until the first green
# run; pin them from that run (see worker/README.md).
COMMON = ["jiwer", "soundfile", "httpx", "pydantic", "numpy"]


def _image(*pip: str) -> modal.Image:
    return (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install("libsndfile1", "ffmpeg")
        .pip_install(*COMMON, *pip)
        .env({"HF_HOME": f"{MODELS_DIR}/hf", "FAIRSEQ2_CACHE_DIR": f"{MODELS_DIR}/fairseq2"})
        .add_local_dir(HERE / "igala_speech", "/root/igala_speech")
    )


asr_image = _image("torch", "torchaudio", "omnilingual-asr", "pyarrow")
tts_image = _image("torch", "torchaudio", "everyvoice")
web_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "pydantic", "httpx", "numpy", "soundfile", "jiwer")
    .add_local_dir(HERE / "igala_speech", "/root/igala_speech")
)


def _run(kind: str, body: dict) -> None:
    from igala_speech.pipeline import run_job

    run_job(kind, body)
    if kind in ("train_asr", "train_tts"):
        checkpoints_volume.commit()


@app.function(image=asr_image, gpu="A10G", secrets=[secret], volumes=volumes, timeout=60 * 60)
def transcribe(body: dict) -> None:
    _run("transcribe", body)


@app.function(image=asr_image, gpu="A100-80GB", secrets=[secret], volumes=volumes, timeout=12 * 3600)
def train_asr(body: dict) -> None:
    _run("train_asr", body)


@app.function(image=asr_image, gpu="A10G", secrets=[secret], volumes=volumes, timeout=60 * 60)
def evaluate(body: dict) -> None:
    _run("evaluate", body)


@app.function(image=tts_image, gpu="A10G", secrets=[secret], volumes=volumes, timeout=24 * 3600)
def train_tts(body: dict) -> None:
    _run("train_tts", body)


@app.function(image=tts_image, gpu="A10G", secrets=[secret], volumes=volumes, timeout=60 * 60)
def synthesize(body: dict) -> None:
    _run("synthesize", body)


SPAWN = {
    "transcribe": transcribe,
    "train_asr": train_asr,
    "evaluate": evaluate,
    "train_tts": train_tts,
    "synthesize": synthesize,
}


@app.function(image=web_image, secrets=[secret])
@modal.asgi_app()
def speech_web():
    import os

    from fastapi import FastAPI, Header, HTTPException, Request
    from pydantic import ValidationError

    from igala_speech.jobs import ENDPOINT_KINDS, check_secret, parse_job

    api = FastAPI(title=APP_NAME, docs_url=None, redoc_url=None)

    def require_secret(value: str | None) -> None:
        if not check_secret(value, os.environ["SPEECH_WORKER_SECRET"]):
            raise HTTPException(status_code=401, detail="bad shared secret")

    @api.get("/health")
    def health():
        return {"ok": True, "app": APP_NAME}

    def make(path: str, kind: str):
        @api.post(f"/{path}")
        async def start(request: Request, x_shared_secret: str | None = Header(default=None)):
            require_secret(x_shared_secret)
            try:
                raw = await request.json()
                job = parse_job(kind, raw)
            except ValidationError as exc:
                raise HTTPException(status_code=400, detail=f"invalid {kind} body: {exc.error_count()} errors")
            except ValueError:
                raise HTTPException(status_code=400, detail="body must be JSON")
            call = await SPAWN[kind].spawn.aio(raw)
            return {"callId": call.object_id, "jobId": job.jobId}

    for path, kind in ENDPOINT_KINDS.items():
        make(path, kind)

    @api.get("/status/{call_id}")
    async def status(call_id: str, x_shared_secret: str | None = Header(default=None)):
        require_secret(x_shared_secret)
        call = modal.FunctionCall.from_id(call_id)
        try:
            await call.get.aio(timeout=0)
        except TimeoutError:
            return {"callId": call_id, "status": "running"}
        except Exception:  # noqa: BLE001  any error from the call means it failed
            return {"callId": call_id, "status": "failed"}
        return {"callId": call_id, "status": "done"}

    return api


@app.function(image=web_image, secrets=[secret], schedule=modal.Cron("0 2 * * *"))
def nightly_trigger() -> None:
    from igala_speech.nightly import trigger

    print(trigger())


@app.local_entrypoint()
def selftest():
    from igala_speech.selftest import run

    raise SystemExit(run())
