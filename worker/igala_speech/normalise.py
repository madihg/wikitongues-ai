"""Port of web/src/lib/speech/normalise.ts (tone_strip, normalise_for_scoring).

Same combining-mark list, same rules, same order of steps. Change one side
only together with the other and a fixture case in metrics.fixtures.json.

Tone marks: grave, acute, circumflex, macron, breve, hook above, caron. The
dot-below (U+0323) is a letter and is never stripped. The tilde (U+0303) is a
tone mark except directly on n or N (optionally with a dot below), where it is
a letter.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping
from pathlib import Path

# Grave, acute, circumflex, macron, breve, hook above, caron.
TONE_MARKS_NO_TILDE = frozenset(
    ["̀", "́", "̂", "̄", "̆", "̉", "̌"]
)
TILDE = "̃"
DOT_BELOW = "̣"

_APOSTROPHES = {"’": "'", "‘": "'", "ʼ": "'", "ʻ": "'"}
_EDGE_JOINERS = re.compile(r"^['-]+|['-]+$")

_ORTHOGRAPHY_PATH = (
    Path(__file__).resolve().parents[2]
    / "web"
    / "src"
    / "lib"
    / "speech"
    / "orthography.json"
)


def _load_orthography() -> dict:
    # In a deployed worker the repo tree may be absent; fall back to the empty
    # table, which is also what orthography.json holds until the ruling lands.
    try:
        return json.loads(_ORTHOGRAPHY_PATH.read_text(encoding="utf-8"))
    except OSError:
        return {"version": "0-pending-ruling", "contractions": {}}


_ORTHOGRAPHY = _load_orthography()
ORTHOGRAPHY_VERSION: str = _ORTHOGRAPHY["version"]
CONTRACTIONS: Mapping[str, str] = _ORTHOGRAPHY["contractions"]


def tone_strip(text: str | None) -> str:
    """Remove tone marks, keep every letter; the result is NFC."""
    nfd = unicodedata.normalize("NFD", text or "")
    out: list[str] = []
    for i, ch in enumerate(nfd):
        if ch in TONE_MARKS_NO_TILDE:
            continue
        if ch == TILDE and not _tilde_is_letter(nfd, i):
            continue
        out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def _tilde_is_letter(s: str, i: int) -> bool:
    """True when the tilde at s[i] sits on n/N, with an optional dot below."""
    j = i - 1
    if j >= 0 and s[j] == DOT_BELOW:
        j -= 1
    return j >= 0 and s[j] in "nN"


def _canon(text: str) -> str:
    t = unicodedata.normalize("NFC", text)
    t = "".join(_APOSTROPHES.get(ch, ch) for ch in t)
    return unicodedata.normalize("NFC", t.lower())


def _drop_punctuation(text: str) -> str:
    """Punctuation and symbols become spaces, except apostrophe and hyphen."""
    return "".join(
        " "
        if unicodedata.category(ch)[0] in "PS" and ch not in "'-"
        else ch
        for ch in text
    )


def normalise_for_scoring(
    text: str | None,
    tones: str = "keep",
    contractions: Mapping[str, str] | None = None,
) -> str:
    """The scoring form: NFC, lower case, punctuation removed, whitespace
    collapsed, then the agreed contraction spellings applied word by word."""
    table = CONTRACTIONS if contractions is None else contractions
    t = _canon(text or "")
    if tones == "strip":
        t = tone_strip(t)
    t = _drop_punctuation(t)
    words = [_EDGE_JOINERS.sub("", w) for w in re.split(r"\s+", t)]
    words = [w for w in words if w]
    if not table:
        return " ".join(words)

    mapping: dict[str, str] = {}
    for k, v in table.items():
        src, dst = _canon(k), _canon(v)
        if tones == "strip":
            src, dst = tone_strip(src), tone_strip(dst)
        mapping[src] = dst
    return " ".join(mapping.get(w, w) for w in words)
