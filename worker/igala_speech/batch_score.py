"""Score a set of transcripts against the locked texts, three ways.

For each clip: tones kept (cerRetained, werRetained), tone marks stripped with
underdots kept (cer, werStripped), and the tone error rate (ter). The set gets
the mean over clips of each (the same aggregate the evaluate job stores), a
bootstrap interval over clips, the pooled figures (errors over reference
length), and the tone figures on the clips whose text carries tone marks at
all: a text without marks scores a TER of 0 by definition and would hide the
real rate.
"""

from __future__ import annotations

from collections import defaultdict

import jiwer
import numpy as np

from .metrics import score_three_ways, ter_counts
from .normalise import normalise_for_scoring

KEYS = ("cer", "cerRetained", "werStripped", "werRetained", "ter")
BOOTSTRAP_RESAMPLES = 1000
BOOTSTRAP_SEED = 13


def _mean(rows: list[dict]) -> dict:
    out = {k: round(sum(r[k] for r in rows) / len(rows), 4) for k in KEYS}
    out["nClips"] = len(rows)
    return out


def _interval(values: list[float]) -> list[float]:
    v = np.asarray(values, dtype=np.float64)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    means = v[rng.integers(0, len(v), size=(BOOTSTRAP_RESAMPLES, len(v)))].mean(axis=1)
    return [round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4)]


def _pooled_cer(pairs: list[tuple[str, str]], tones: str) -> float | None:
    errors = length = 0
    for ref, hyp in pairs:
        r = normalise_for_scoring(ref, tones=tones)
        h = normalise_for_scoring(hyp, tones=tones)
        if not r:
            continue
        length += len(r)
        if not h:
            errors += len(r)
            continue
        out = jiwer.process_characters(r, h)
        errors += out.substitutions + out.deletions + out.insertions
    return round(errors / length, 4) if length else None


def score_set(
    refs: dict[str, str],
    hyps: dict[str, str],
    meta: dict[str, dict] | None = None,
) -> dict:
    """refs and hyps are keyed by clip id; meta gives {speaker, dialect} per id."""
    ids = [i for i in refs if i in hyps]
    if not ids:
        raise ValueError("no clip has both a reference and a transcript")
    meta = meta or {}
    per_clip = {i: {k: round(v, 4) for k, v in score_three_ways(refs[i], hyps[i]).items()} for i in ids}
    by_speaker: dict[str, list[dict]] = defaultdict(list)
    by_dialect: dict[str, list[dict]] = defaultdict(list)
    tones: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # group: [wrong, marked]
    wrong = marked = 0
    toned: list[str] = []
    for i in ids:
        speaker = meta.get(i, {}).get("speaker") or "spk_unknown"
        dialect = meta.get(i, {}).get("dialect") or "unknown"
        by_speaker[speaker].append(per_clip[i])
        by_dialect[dialect].append(per_clip[i])
        w, m = ter_counts(refs[i], hyps[i])
        wrong, marked = wrong + w, marked + m
        for group in (f"s:{speaker}", f"d:{dialect}"):
            tones[group][0] += w
            tones[group][1] += m
        if m:
            toned.append(i)

    def group(prefix: str, key: str, rows: list[dict]) -> dict:
        w, m = tones[f"{prefix}:{key}"]
        # The mean TER counts a clip with no tone marks as 0; terPooled is the
        # rate over the vowels that do carry one.
        return {**_mean(rows), "markedVowels": m, "terPooled": round(w / m, 4) if m else None}

    pairs = [(refs[i], hyps[i]) for i in ids]
    return {
        "nClips": len(ids),
        "aggregate": {k: v for k, v in _mean(list(per_clip.values())).items() if k != "nClips"},
        "interval95": {k: _interval([per_clip[i][k] for i in ids]) for k in KEYS},
        "pooled": {
            "cer": _pooled_cer(pairs, "strip"),
            "cerRetained": _pooled_cer(pairs, "keep"),
            "ter": round(wrong / marked, 4) if marked else None,
            "markedVowels": marked,
        },
        "toneMarkedClips": {
            "nClips": len(toned),
            **({k: v for k, v in _mean([per_clip[i] for i in toned]).items() if k != "nClips"} if toned else {}),
        },
        "perSpeaker": {k: group("s", k, v) for k, v in sorted(by_speaker.items())},
        "perDialect": {k: group("d", k, v) for k, v in sorted(by_dialect.items())},
        "perClip": per_clip,
    }
