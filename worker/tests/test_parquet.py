import io

import numpy as np
import pytest
import soundfile as sf

from igala_speech.parquet import FIELDS, recipe_rows, write_parquet


def _wav(seconds=0.5, rate=16000):
    return (0.2 * np.sin(2 * np.pi * 200 * np.arange(int(rate * seconds)) / rate)).astype(np.float32)


def test_rows_carry_the_recipe_fields_and_flac_audio(mock_lines):
    clips = {l["id"]: _wav() for l in mock_lines}
    from igala_speech.jobs import Line

    lines = [Line(**l) for l in mock_lines]
    rows = recipe_rows(lines, clips, split="train")
    assert len(rows) == 3
    for row in rows:
        assert set(row) == set(FIELDS)
        assert row["split"] == "train"
        assert row["language"] == "igl_Latn"
        assert row["corpus"] == "wikitongues"
        audio, rate = sf.read(io.BytesIO(row["audio_bytes"]))
        assert rate == 16000 and len(audio) == row["audio_size"] == 8000
        assert row["audio_bytes"][:4] == b"fLaC"
    assert rows[0]["text"] == "the red boat sails"


def test_write_parquet_round_trips(tmp_path, mock_lines):
    pq = pytest.importorskip("pyarrow.parquet")
    from igala_speech.jobs import Line

    rows = recipe_rows([Line(**l) for l in mock_lines], {l["id"]: _wav() for l in mock_lines}, split="dev")
    path = write_parquet(rows, tmp_path / "part-0.parquet")
    table = pq.read_table(path)
    assert table.num_rows == 3
    assert set(table.column_names) == set(FIELDS)
