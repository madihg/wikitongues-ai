"""The Nov 13 first-model batch, as a Modal app you run by hand (never deployed).

    modal run worker/first_model.py --stage prepare    # measure + clean every clip
    modal run worker/first_model.py --stage tts-anchor --plan P.json    # unadapted mms-tts-yor
    modal run worker/first_model.py --stage tts-finetune --plan P.json  # prepared; needs a guarded plan
    modal run worker/first_model.py --stage asr --card C --name N --items I.json  # also the round trip

It reads /checkpoints/<BATCH>/manifest.json and /checkpoints/<BATCH>/clips/<id>.webm
(put there with `modal volume put`; the worker holds no database credentials)
and writes only to that folder on the checkpoints volume: derived audio under
derived/ and tts/, numbers under results/. Nothing here touches the app, the
database or the storage bucket, and it carries no data: the manifest and the
audio stay on the volume.

The TTS weights descend from facebook/mms-tts-yor (CC BY-NC 4.0). Everything
under tts/ is an INTERNAL PROTOTYPE, NOT FOR RELEASE, and each folder says so
in its PROTOTYPE.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

import modal

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

APP_NAME = "wikitongues-speech-first-model"
MODELS_DIR = "/models"
CHECKPOINTS_DIR = "/checkpoints"
BATCH = "batch-nov13"
ROOT = f"{CHECKPOINTS_DIR}/{BATCH}"
PROTOTYPE_NOTICE = "internal prototype, not for release"
TTS_BASE = "facebook/mms-tts-yor"
FINETUNE_REPO = "https://github.com/ylacombe/finetune-hf-vits"
ASR_LANG = "igl_Latn"

app = modal.App(APP_NAME)
models_volume = modal.Volume.from_name("wikitongues-speech-models", create_if_missing=True)
checkpoints_volume = modal.Volume.from_name("wikitongues-speech-checkpoints", create_if_missing=True)
volumes = {MODELS_DIR: models_volume, CHECKPOINTS_DIR: checkpoints_volume}
ENV = {
    "HF_HOME": f"{MODELS_DIR}/hf",
    "FAIRSEQ2_CACHE_DIR": f"{MODELS_DIR}/fairseq2",
    "WANDB_MODE": "disabled",
}


def _with_package(image: modal.Image) -> modal.Image:
    return image.env(ENV).add_local_dir(HERE / "igala_speech", "/root/igala_speech")


# DeepFilterNet 0.5.6 imports torchaudio.backend, which torchaudio 2.1 removed.
clean_image = _with_package(
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg", "git")
    .pip_install("torch==2.0.1", "torchaudio==2.0.2", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "numpy<2", "scipy", "soundfile", "jiwer", "pydantic", "httpx",
        "deepfilternet==0.5.6", "silero-vad==5.1.2", "onnxruntime",
    )
)
asr_image = _with_package(
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg")
    .pip_install("omnilingual-asr", "pyarrow==20.0.0", "soundfile", "jiwer")
    # fairseq2 pins torch; torchaudio must be the release built for that torch.
    .run_commands(
        "pip install \"torchaudio==$(python -c 'import torch; print(torch.__version__.split(\"+\")[0])')\""
    )
)
tts_image = _with_package(
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg", "git", "build-essential")
    .pip_install(
        "torch==2.1.2", "torchaudio==2.1.2", "transformers==4.36.2", "datasets[audio]==2.16.1",
        "accelerate==0.25.0", "numpy<2", "pyarrow==15.0.2", "pandas==2.1.4", "scipy", "soundfile", "librosa", "Cython",
        "tensorboard", "matplotlib", "wandb", "jiwer", "httpx",
    )
    .run_commands(
        f"git clone {FINETUNE_REPO} /opt/finetune-hf-vits",
        "cd /opt/finetune-hf-vits/monotonic_align && mkdir -p monotonic_align && python setup.py build_ext --inplace",
    )
)


def _manifest() -> list[dict]:
    import json

    return json.loads(Path(f"{ROOT}/manifest.json").read_text(encoding="utf-8"))


def _write_json(path: str, data) -> None:
    import json

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def _ledger(stage: str, gpu: str | None, seconds: float, note: str = "") -> dict:
    """One line of spend. GPU seconds times the Modal rate, plus CPU and memory."""
    import json
    import time

    from igala_speech.rates import RATES_PER_SECOND

    cpu_and_memory = 0.0000131 * 4 + 0.00000222 * 16  # 4 cores, 16 GiB, per second
    usd = seconds * ((RATES_PER_SECOND[gpu] if gpu else 0.0) + cpu_and_memory)
    line = {"stage": stage, "gpu": gpu, "seconds": round(seconds, 1), "usd": round(usd, 4),
            "note": note, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    p = Path(f"{ROOT}/results/ledger.jsonl")
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")
    return line


# ------------------------------------------------------------ stage: prepare

@app.function(image=clean_image, volumes=volumes, cpu=4, memory=16384, timeout=60 * 60)
def prepare(limit: int = 0) -> dict:
    """Measure every clip, make its cleaning derivative, keep the raw audio."""
    import subprocess
    import tempfile
    import time

    import numpy as np
    import soundfile as sf
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad

    from igala_speech.clean import deepfilternet, make_derivative, resample
    from igala_speech.quality import FRAME_MS

    start = time.monotonic()
    vad_model = load_silero_vad()

    def silero(x: np.ndarray, rate: int) -> np.ndarray:
        frame = max(1, round(rate * FRAME_MS / 1000))
        n = -(-len(x) // frame)
        mask = np.zeros(n, dtype=bool)
        y = torch.from_numpy(resample(x, rate, 16000))
        for seg in get_speech_timestamps(y, vad_model, sampling_rate=16000):
            lo = int(seg["start"] / 16000 * 1000 / FRAME_MS)
            hi = int(np.ceil(seg["end"] / 16000 * 1000 / FRAME_MS))
            mask[lo:hi] = True
        return mask

    denoise, version, params = deepfilternet()
    rows = _manifest()
    if limit:
        rows = rows[:limit]
    out: dict[str, dict] = {}
    for i, r in enumerate(rows):
        src = Path(f"{ROOT}/clips/{r['id']}.webm")
        with tempfile.TemporaryDirectory() as d:
            wav = Path(d) / "raw.wav"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "48000",
                 "-c:a", "pcm_f32le", str(wav)],
                check=True,
            )
            raw, rate = sf.read(str(wav), dtype="float32")
        result = make_derivative(
            raw, rate, denoise, denoiser_version=version, denoiser_params=params,
            vad=silero, vad_name="silero-vad-5.1.2",
        )
        folder = Path(f"{ROOT}/derived/{r['id']}")
        folder.mkdir(parents=True, exist_ok=True)
        keys = {}
        for target, audio in result["copies"].items():
            name = f"clean-v1-{target // 1000}k.flac"
            sf.write(str(folder / name), audio, target, format="FLAC")
            keys[str(target)] = f"derived/{r['id']}/{name}"
        # The raw audio at 16 kHz, untouched apart from the resample: what the
        # recogniser hears "before", so cleaning can be checked against it.
        sf.write(str(folder / "raw-16k.flac"), resample(raw, rate, 16000), 16000, format="FLAC")
        log = result["log"]
        log["derivativeKeys"] = keys
        log["rawKey"] = r.get("storageKey") or f"clips/{r['id']}.webm"
        out[r["id"]] = log
        if i % 20 == 0:
            print(f"prepare {i + 1}/{len(rows)}")
    _write_json(f"{ROOT}/results/quality.json", out)
    checkpoints_volume.commit()
    kept_raw = sum(1 for v in out.values() if not v["usedDenoised"])
    return {"clips": len(out), "keptRaw": kept_raw, **_ledger("prepare", None, time.monotonic() - start)}


# ---------------------------------------------------------------- stage: asr

MAX_ASR_SECONDS = 38  # the Omnilingual pipeline refuses audio over 40 s
ASR_CHUNK_SECONDS = 28


def _split_long(path: str, tmp: Path) -> list[str]:
    """A clip the recogniser accepts as it is, or its pieces: cut at the quietest
    100 ms within two seconds of each 28 s mark, so a word is rarely cut."""
    import numpy as np
    import soundfile as sf

    audio, rate = sf.read(path, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if len(audio) <= MAX_ASR_SECONDS * rate:
        return [path]
    cuts = [0]
    while len(audio) - cuts[-1] > MAX_ASR_SECONDS * rate:
        centre = cuts[-1] + ASR_CHUNK_SECONDS * rate
        lo, hi = centre - 2 * rate, min(centre + 2 * rate, len(audio) - rate // 10)
        win = rate // 10
        energy = np.convolve(audio[lo:hi] ** 2, np.ones(win) / win, mode="valid")
        cuts.append(lo + int(np.argmin(energy)) + win // 2)
    cuts.append(len(audio))
    out = []
    for i in range(len(cuts) - 1):
        piece = tmp / f"{Path(path).stem}.{i}.wav"
        sf.write(str(piece), audio[cuts[i] : cuts[i + 1]], rate, subtype="PCM_16")
        out.append(str(piece))
    return out


def _transcribe(card: str, paths: list[str], batch_size: int) -> tuple[list[str], dict]:
    import importlib.metadata as md
    import tempfile

    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline

    pipe = ASRInferencePipeline(model_card=card)
    with tempfile.TemporaryDirectory() as d:
        pieces = [_split_long(p, Path(d)) for p in paths]
        flat = [x for group in pieces for x in group]
        heard = list(pipe.transcribe(flat, lang=[ASR_LANG] * len(flat), batch_size=batch_size))
    texts, i = [], 0
    for group in pieces:
        texts.append(" ".join(t.strip() for t in heard[i : i + len(group)]))
        i += len(group)
    meta = {
        "card": card,
        "package": f"omnilingual-asr=={md.version('omnilingual-asr')}",
        "splitOverSeconds": MAX_ASR_SECONDS,
        "clipsSplit": sum(1 for g in pieces if len(g) > 1),
    }
    return texts, meta


@app.function(image=asr_image, gpu="A10G", volumes=volumes, cpu=4, memory=16384, timeout=2 * 3600)
def asr(card: str, name: str, items: list[dict], batch_size: int = 8) -> dict:
    """Transcribe items [{key, path}] (paths under the batch folder) with one model card."""
    import time

    start = time.monotonic()
    texts, meta = _transcribe(card, [f"{ROOT}/{it['path']}" for it in items], batch_size)
    result = {"model": meta, "lang": ASR_LANG, "transcripts": {it["key"]: t for it, t in zip(items, texts)}}
    _write_json(f"{ROOT}/results/asr-{name}.json", result)
    models_volume.commit()
    checkpoints_volume.commit()
    return {"n": len(items), **meta, **_ledger(f"asr:{name}", "A10G", time.monotonic() - start, card)}


@app.function(image=asr_image, volumes=volumes, cpu=2, memory=4096, timeout=3 * 3600)
def asr_fetch(card: str, attempts: int = 4) -> dict:
    """Download a model card's checkpoint to the models volume on a CPU
    container, so the GPU is not billed for a 30 GB download. Retries: the
    host has cut a long download short before."""
    import time

    import omnilingual_asr  # noqa: F401  registers the model cards
    from fairseq2 import assets

    start = time.monotonic()
    if hasattr(assets, "get_asset_download_manager"):
        manager = assets.get_asset_download_manager()
    else:  # fairseq2 0.6 resolves it from the dependency container
        from fairseq2.runtime.dependency import get_dependency_resolver

        manager = get_dependency_resolver().resolve(assets.AssetDownloadManager)
    uri = assets.get_asset_store().retrieve_card(card).field("checkpoint").as_uri()
    last = ""
    for attempt in range(attempts):
        try:
            path = manager.download_model(uri, card, progress=False)
            models_volume.commit()
            return {"card": card, "path": str(path), "attempt": attempt + 1,
                    **_ledger(f"asr-fetch:{card}", None, time.monotonic() - start)}
        except Exception as exc:  # noqa: BLE001  retried, then reported
            last = f"{type(exc).__name__}: {str(exc)[:200]}"
            print(f"attempt {attempt + 1} failed: {last}")
    models_volume.commit()
    _ledger(f"asr-fetch:{card}:failed", None, time.monotonic() - start, last)
    raise RuntimeError(f"download failed after {attempts} attempts: {last}")


@app.function(image=asr_image, volumes=volumes, timeout=600)
def asr_cards() -> dict:
    """The model cards this version of omnilingual-asr knows (CPU, no download)."""
    import importlib.metadata as md
    import os

    os.environ["FAIRSEQ2_EXTENSION_TRACE"] = "1"
    versions = {p: md.version(p) for p in ("torch", "torchaudio", "fairseq2", "fairseq2n", "omnilingual-asr")}
    import omnilingual_asr  # noqa: F401
    from fairseq2.assets import get_asset_store

    names: list[str] = []
    for provider in getattr(get_asset_store(), "metadata_providers", []):
        try:
            names += [n for n in provider.get_names() if "omniASR" in n]
        except Exception as exc:  # noqa: BLE001  a provider without names is skipped
            print(f"provider skipped: {type(exc).__name__}")
    return {"versions": versions, "cards": sorted(set(names))}


# ---------------------------------------------------------------- stage: tts

def _prototype_marker(folder: Path, extra: dict) -> None:
    _write_json(str(folder / "PROTOTYPE.json"), {
        "notice": PROTOTYPE_NOTICE,
        "baseModel": TTS_BASE,
        "baseLicence": "CC BY-NC 4.0",
        "rule": "Never export, publish or deliver anything in this folder or derived from it.",
        **extra,
    })


def _synthesize(model, tokenizer, sentences: list[dict], folder: Path, seed: int) -> list[dict]:
    """Write <promptId>.raw.wav (the model's own level) for each sentence."""
    import soundfile as sf
    import torch

    from igala_speech.tts_text import to_mms_yor

    folder.mkdir(parents=True, exist_ok=True)
    rate = model.config.sampling_rate
    out = []
    for s in sentences:
        text = to_mms_yor(s["text"])
        if not text:
            continue
        torch.manual_seed(seed)
        inputs = tokenizer(text, return_tensors="pt").to(model.device)
        with torch.no_grad():
            wave = model(**inputs).waveform[0].float().cpu().numpy()
        sf.write(str(folder / f"{s['promptId']}.raw.wav"), wave, rate, subtype="PCM_16")
        out.append({"promptId": s["promptId"], "inputCharacters": len(text), "durationMs": round(len(wave) / rate * 1000)})
    return out


def _match_loudness(folder: Path, sentences: list[dict]) -> dict:
    """Bring each synthetic clip to the loudness of the person's clip of the same
    sentence (the level the listener will hear it at), under the peak ceiling."""
    import numpy as np
    import soundfile as sf

    from igala_speech.quality import integrated_lufs, measure, true_peak_dbfs
    from igala_speech.quality_gates import GATES

    ceiling = GATES["clean"]["truePeakCeilingDbfs"]
    stats = {}
    for s in sentences:
        src = folder / f"{s['promptId']}.raw.wav"
        if not src.exists():
            continue
        wave, rate = sf.read(str(src), dtype="float32")
        lufs = integrated_lufs(wave, rate)
        target = s.get("humanLufs")
        gain = 0.0
        if lufs is not None and target is not None:
            gain = min(target - lufs, ceiling - true_peak_dbfs(wave))
        matched = (wave.astype(np.float64) * 10 ** (gain / 20)).astype(np.float32)
        sf.write(str(folder / f"{s['promptId']}.wav"), matched, rate, subtype="PCM_16")
        stats[s["promptId"]] = {"gainDb": round(gain, 2), "humanLufs": target, **measure(matched, rate)}
    return stats


@app.function(image=tts_image, gpu="A10G", volumes=volumes, cpu=4, memory=16384, timeout=3600)
def tts_anchor(plan: dict) -> dict:
    """The low anchor: facebook/mms-tts-yor as published, reading the Igala
    sentences. No training, so no speaker's voice is involved.

    plan: {runId, seed, sentences: [{promptId, text, humanLufs}]}
    """
    import time

    from transformers import VitsModel, VitsTokenizer

    from igala_speech.tts_text import FRONT_END_VERSION

    start = time.monotonic()
    folder = Path(f"{ROOT}/tts/{plan['runId']}/anchor")
    tokenizer = VitsTokenizer.from_pretrained(TTS_BASE)
    model = VitsModel.from_pretrained(TTS_BASE).to("cuda").eval()
    summary = {
        "runId": plan["runId"],
        "system": "mms-tts-yor-unadapted",
        "frontEnd": FRONT_END_VERSION,
        "seed": plan["seed"],
        "clips": _synthesize(model, tokenizer, plan["sentences"], folder, plan["seed"]),
        "levels": _match_loudness(folder, plan["sentences"]),
    }
    _prototype_marker(folder, {"system": summary["system"], "runId": plan["runId"]})
    _write_json(str(folder / "summary.json"), summary)
    models_volume.commit()
    checkpoints_volume.commit()
    return {"clips": len(summary["clips"]), **_ledger(f"tts-anchor:{plan['runId']}", "A10G", time.monotonic() - start)}


def _training_audio(line: dict, rate: int):
    """One training clip at the model's rate, levelled, silence trimmed.

    A line names its audio one of two ways: `audio`, a file under the batch
    folder (a derivative made by `prepare`, or a synthetic clip in the
    self-test), or `url`, the signed URL the app's training manifest carries.
    """
    import subprocess
    import tempfile

    import httpx
    import soundfile as sf

    from igala_speech.clean import normalise_loudness, resample
    from igala_speech.quality import FRAME_MS, energy_vad

    if line.get("audio"):
        audio, src_rate = sf.read(f"{ROOT}/{line['audio']}", dtype="float32")
    else:
        with tempfile.TemporaryDirectory() as d:
            raw = Path(d) / "clip.src"
            raw.write_bytes(httpx.get(line["url"], timeout=120, follow_redirects=True).raise_for_status().content)
            wav = Path(d) / "clip.wav"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-ac", "1", "-c:a", "pcm_f32le", str(wav)],
                check=True,
            )
            audio, src_rate = sf.read(str(wav), dtype="float32")
    audio = resample(audio, src_rate, rate)
    speech = energy_vad(audio, rate)
    idx = speech.nonzero()[0]
    if len(idx):  # keep 150 ms around the speech
        frame = rate * FRAME_MS // 1000
        pad = int(0.15 * rate)
        audio = audio[max(0, idx[0] * frame - pad) : (idx[-1] + 1) * frame + pad]
    return normalise_loudness(audio, rate)[0]


@app.function(image=tts_image, gpu="A10G", volumes=volumes, cpu=4, memory=16384, timeout=3 * 3600)
def tts_finetune(plan: dict) -> dict:
    """Fine-tune mms-tts-yor with the finetune-hf-vits recipe, then synthesise.

    PREPARED, NOT RUN ON ANY PERSON'S VOICE on Nov 13: no clip was cleared for
    voice training (none had a Check verdict of keep). The plan must come from
    web/scripts/speech/first-model-plan.ts, which builds it through the app's
    one training guard (canTrain, purpose cloning) and says so in `guard`;
    this function refuses a plan that does not. The only other plan it accepts
    is the mechanical self-test, whose training audio is the anchor's own
    synthetic output (`guard: "selftest-synthetic"`).

    plan: {runId, system, guard, manifestVersion, seed, epochs, batchSize,
    learningRate, train: [{id, text, audio | url}], sentences: [{promptId,
    text, humanLufs}]}
    """
    import csv
    import json
    import shutil
    import subprocess
    import time

    import soundfile as sf
    from transformers import VitsModel, VitsTokenizer

    from igala_speech.tts_text import FRONT_END_VERSION, to_mms_yor

    if plan.get("guard") not in ("canTrain:internal:cloning", "selftest-synthetic"):
        raise ValueError("this plan did not come through the training guard")
    if plan["guard"] == "selftest-synthetic" and any(
        "url" in t or "/anchor/" not in t.get("audio", "") for t in plan["train"]
    ):
        raise ValueError("the self-test trains on the anchor's synthetic clips only")

    start = time.monotonic()
    run, system = plan["runId"], plan["system"]
    base = Path(f"{ROOT}/tts/{run}")
    repo = "/opt/finetune-hf-vits"
    commit = subprocess.run(
        ["git", "-C", repo, "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()

    train_ckpt = f"{MODELS_DIR}/mms-tts-yor-train"
    if not Path(train_ckpt, "config.json").exists():
        subprocess.run(
            ["python", "convert_original_discriminator_checkpoint.py", "--language_code", "yor",
             "--pytorch_dump_folder_path", train_ckpt],
            cwd=repo, check=True,
        )
        models_volume.commit()
    rate = 16000
    data = Path("/tmp/ds")
    shutil.rmtree(data, ignore_errors=True)
    (data / "train").mkdir(parents=True)
    with (data / "train" / "metadata.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file_name", "text"])
        for i, t in enumerate(plan["train"]):
            sf.write(str(data / "train" / f"{i:04d}.wav"), _training_audio(t, rate), rate, subtype="PCM_16")
            w.writerow([f"{i:04d}.wav", to_mms_yor(t["text"])])
    out_dir = f"/tmp/out/{run}-{system}"
    config = {
        "project_name": "igala_mms_prototype",
        "push_to_hub": False,
        "report_to": ["tensorboard"],
        "overwrite_output_dir": True,
        "output_dir": out_dir,
        "dataset_name": str(data),
        "audio_column_name": "audio",
        "text_column_name": "text",
        "train_split_name": "train",
        "eval_split_name": "train",
        "full_generation_sample_text": to_mms_yor(plan["train"][0]["text"]),
        "max_duration_in_seconds": 25,
        "min_duration_in_seconds": 1.0,
        "max_tokens_length": 500,
        "model_name_or_path": train_ckpt,
        "preprocessing_num_workers": 2,
        "do_train": True,
        "num_train_epochs": plan["epochs"],
        "gradient_accumulation_steps": 1,
        "gradient_checkpointing": False,
        "per_device_train_batch_size": plan["batchSize"],
        "learning_rate": plan["learningRate"],
        "adam_beta1": 0.8,
        "adam_beta2": 0.99,
        "warmup_ratio": 0.01,
        "group_by_length": False,
        "do_eval": False,
        "do_step_schedule_per_epoch": True,
        "weight_disc": 3,
        "weight_fmaps": 1,
        "weight_gen": 1,
        "weight_kl": 1.5,
        "weight_duration": 1,
        "weight_mel": 35,
        "fp16": True,
        "seed": plan["seed"],
        "save_steps": 100000,
        "logging_steps": 10,
    }
    Path("/tmp/config.json").write_text(json.dumps(config))
    train_start = time.monotonic()
    proc = subprocess.run(
        ["accelerate", "launch", "run_vits_finetuning.py", "/tmp/config.json"],
        cwd=repo, capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        print(proc.stdout[-3000:] + "\n" + proc.stderr[-6000:])
        raise RuntimeError("fine-tune failed; see the log above")
    train_seconds = round(time.monotonic() - train_start, 1)

    model_dir = base / f"{system}-model"
    shutil.rmtree(model_dir, ignore_errors=True)
    shutil.copytree(out_dir, model_dir, ignore=shutil.ignore_patterns("checkpoint-*", "runs"))
    marker = {"system": system, "runId": run, "guard": plan["guard"], "trainClips": len(plan["train"]),
              "manifestVersion": plan.get("manifestVersion")}
    _prototype_marker(model_dir, marker)

    tuned = VitsModel.from_pretrained(str(model_dir)).to("cuda").eval()
    folder = base / system
    summary = {
        "runId": run,
        "system": system,
        "guard": plan["guard"],
        "manifestVersion": plan.get("manifestVersion"),
        "frontEnd": FRONT_END_VERSION,
        "finetuneRepoCommit": commit,
        "train": {
            "clips": len(plan["train"]),
            "ids": [t["id"] for t in plan["train"]],
            "seconds": train_seconds,
            "config": {k: config[k] for k in ("num_train_epochs", "per_device_train_batch_size", "learning_rate",
                                               "seed", "max_duration_in_seconds", "fp16")},
        },
        "clips": _synthesize(tuned, VitsTokenizer.from_pretrained(str(model_dir)), plan["sentences"], folder,
                             plan["seed"]),
        "levels": _match_loudness(folder, plan["sentences"]),
    }
    _prototype_marker(folder, marker)
    _write_json(str(folder / "summary.json"), summary)
    checkpoints_volume.commit()
    return {"trainSeconds": train_seconds, "clips": len(summary["clips"]),
            **_ledger(f"tts-finetune:{run}:{system}", "A10G", time.monotonic() - start)}


@app.function(image=clean_image, volumes=volumes, timeout=600)
def read_result(name: str) -> str:
    """A results file as text, for the local scorer (numbers and model output)."""
    checkpoints_volume.reload()
    return Path(f"{ROOT}/results/{name}").read_text(encoding="utf-8")


@app.local_entrypoint()
def main(stage: str, card: str = "", name: str = "", plan: str = "", items: str = "", limit: int = 0):
    import json

    if stage == "prepare":
        print(prepare.remote(limit))
    elif stage == "cards":
        print(asr_cards.remote())
    elif stage == "asr-fetch":
        print(asr_fetch.remote(card))
    elif stage == "asr":
        print(asr.remote(card, name, json.loads(Path(items).read_text())))
    elif stage == "tts-anchor":
        print(tts_anchor.remote(json.loads(Path(plan).read_text())))
    elif stage == "tts-finetune":
        print(tts_finetune.remote(json.loads(Path(plan).read_text())))
    else:
        raise SystemExit(f"unknown stage {stage}")
