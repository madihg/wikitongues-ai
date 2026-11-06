"""The Parquet layout the Omnilingual CTC fine-tune recipe reads.

Fields: text, audio_bytes (FLAC), audio_size (samples), corpus, split, language.
Files are partitioned corpus=<c>/split=<s>/language=<l>/part-0.parquet.
pyarrow is only in the Modal image; recipe_rows needs none.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .audio import RATE, flac_bytes
from .jobs import Line

FIELDS = ("text", "audio_bytes", "audio_size", "corpus", "split", "language")
CORPUS = "wikitongues"
LANGUAGE = "igl_Latn"


def recipe_rows(lines: list[Line], clips: dict[str, np.ndarray], split: str) -> list[dict]:
    return [
        {
            "text": line.transcript,
            "audio_bytes": flac_bytes(clips[line.id], RATE),
            "audio_size": len(clips[line.id]),
            "corpus": CORPUS,
            "split": split,
            "language": LANGUAGE,
        }
        for line in lines
    ]


def partition_dir(root: Path, split: str) -> Path:
    return root / f"corpus={CORPUS}" / f"split={split}" / f"language={LANGUAGE}"


def write_parquet(rows: list[dict], path: str | Path) -> Path:
    import pyarrow as pa
    import pyarrow.parquet as pq

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    table = pa.table({f: [r[f] for r in rows] for f in FIELDS})
    pq.write_table(table, path)
    return path
