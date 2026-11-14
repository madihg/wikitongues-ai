"""Igala text in front of the Yoruba MMS voice (facebook/mms-tts-yor).

That model reads raw characters. Its tokenizer lower-cases the text and then
silently DROPS every character that is not in its 43-symbol vocabulary, so an
Igala letter the Yoruba alphabet lacks vanishes without an error. This module
makes that visible (unknown_characters) and replaces the drop with a written
rule (to_mms_yor), so both the unadapted anchor and the fine-tune read the
same, documented input.

The rules are a first, internal approximation. They are not a statement about
Igala orthography; a linguist should review them before any real voice.
"""

from __future__ import annotations

import unicodedata
from collections import Counter

FRONT_END_VERSION = "igala-to-mms-yor-v1"

# The vocabulary of facebook/mms-tts-yor (vocab.json, read 2026-11-13).
MMS_YOR_VOCAB = frozenset(
    "|nítarbwlksogmypuejfdh-\u2014' "
    "ọiàẹìáúóòṣéèùńǹ"
    "̀́"
)

GRAVE, ACUTE, CIRCUMFLEX, MACRON, CARON, DOUBLE_ACUTE, TILDE, DOT_BELOW = (
    "̀", "́", "̂", "̄", "̌", "̋", "̃", "̣",
)

# Letters the Yoruba alphabet lacks, as the nearest sequence it has.
_DIGRAPHS = {
    "ch": "tṣ",  # an affricate: t plus the Yoruba sh letter
}
_LETTERS = {
    "c": "k",  # a lone c (a loanword); ch is handled as a digraph first
    "v": "f",
    "z": "s",
    "q": "k",
    "x": "ks",
}
# Marks the vocabulary lacks. A falling or rising tone becomes its two halves;
# a mid tone is unmarked in Yoruba spelling; a doubled acute is read as high.
_MARKS = {
    CIRCUMFLEX: ACUTE + GRAVE,
    CARON: GRAVE + ACUTE,
    MACRON: "",
    DOUBLE_ACUTE: ACUTE,
}


def unknown_characters(texts: list[str]) -> dict:
    """What the unadapted tokenizer would drop, counted after NFC and lower case."""
    counts: Counter[str] = Counter()
    clips: Counter[str] = Counter()
    total = 0
    for text in texts:
        t = unicodedata.normalize("NFC", text).lower()
        total += len(t)
        seen = set()
        for ch in t:
            if ch not in MMS_YOR_VOCAB:
                counts[ch] += 1
                seen.add(ch)
        clips.update(seen)
    return {
        "totalCharacters": total,
        "unknownCharacters": sum(counts.values()),
        "byCharacter": [
            {
                "codepoint": f"U+{ord(ch):04X}",
                "name": unicodedata.name(ch, "CONTROL"),
                "count": n,
                "clips": clips[ch],
            }
            for ch, n in counts.most_common()
        ],
    }


def to_mms_yor(text: str) -> str:
    """Rewrite Igala text so every character is in the Yoruba MMS vocabulary."""
    out: list[str] = []
    lowered = unicodedata.normalize("NFD", text.lower())
    for src, dst in _DIGRAPHS.items():
        lowered = lowered.replace(src, dst)
    for ch in lowered:
        if ch in _LETTERS:
            out.append(_LETTERS[ch])
        elif ch in _MARKS:
            out.append(_MARKS[ch])
        elif ch == TILDE:
            continue  # n with tilde (the velar nasal) is read as n
        elif ch.isspace():
            out.append(" ")
        else:
            out.append(ch)
    text = unicodedata.normalize("NFC", "".join(out))
    kept = [ch for ch in text if ch in MMS_YOR_VOCAB and ch != "|"]
    return " ".join("".join(kept).split())
