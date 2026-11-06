"""CER, WER (tone-stripped and tone-retained) and TER.

Port of web/src/lib/speech/metrics.ts. Both read
web/src/lib/speech/metrics.fixtures.json and must give the same numbers. The
rules are written in the header of metrics.ts; in short:

- cer and wer use tone-stripped text, werToneRetained keeps the marks.
- Edit distance is Levenshtein on characters (CER) or whitespace tokens (WER),
  computed by jiwer.
- An empty reference scores 0 against an empty hypothesis and 1 otherwise.
- Scores are not clamped: a long hypothesis can score above 1.
- TER is the share of reference vowels that carry a tone mark and whose mark
  is wrong or missing in the hypothesis, after aligning the tone-stripped
  letters of both texts. Zero when the reference has no marks.
"""

from __future__ import annotations

import unicodedata

import jiwer

from .normalise import TILDE, TONE_MARKS_NO_TILDE, normalise_for_scoring

VOWELS = frozenset("aeiou")


def _empty_ref(ref: str, hyp: str) -> float | None:
    if ref:
        return None
    return 0.0 if not hyp else 1.0


def cer(ref: str, hyp: str) -> float:
    r = normalise_for_scoring(ref, tones="strip")
    h = normalise_for_scoring(hyp, tones="strip")
    edge = _empty_ref(r, h)
    if edge is not None:
        return edge
    if not h:
        return 1.0
    return float(jiwer.cer(r, h))


def _wer(ref: str, hyp: str, tones: str) -> float:
    r = normalise_for_scoring(ref, tones=tones)
    h = normalise_for_scoring(hyp, tones=tones)
    edge = _empty_ref(r, h)
    if edge is not None:
        return edge
    if not h:
        return 1.0
    return float(jiwer.wer(r, h))


def wer(ref: str, hyp: str) -> float:
    return _wer(ref, hyp, "strip")


def wer_tone_retained(ref: str, hyp: str) -> float:
    return _wer(ref, hyp, "keep")


def _units(text: str) -> list[tuple[str, str]]:
    """Split into (letter key, tone marks) pairs, one per base character."""
    units: list[list[str]] = []  # [base + letter marks, tone marks]
    for ch in unicodedata.normalize("NFD", text):
        if not unicodedata.combining(ch) or not units:
            units.append([ch, ""])
        elif ch in TONE_MARKS_NO_TILDE or (
            ch == TILDE and units[-1][0][0] not in "nN"
        ):
            units[-1][1] += ch
        else:
            units[-1][0] += ch
    return [(k, "".join(sorted(t))) for k, t in units]


def _align(ref: list[str], hyp: list[str]) -> list[int]:
    """Levenshtein alignment. For each ref index, the matching hyp index, or
    -1 if that ref unit was deleted or substituted. Ties: diagonal, then
    deletion, then insertion."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = d[i - 1][j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1)
            d[i][j] = min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1)
    match = [-1] * n
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            same = ref[i - 1] == hyp[j - 1]
            if d[i][j] == d[i - 1][j - 1] + (0 if same else 1):
                if same:
                    match[i - 1] = j - 1
                i -= 1
                j -= 1
                continue
        if i > 0 and d[i][j] == d[i - 1][j] + 1:
            i -= 1
        else:
            j -= 1
    return match


def ter(ref: str, hyp: str) -> float:
    r = _units(normalise_for_scoring(ref, tones="keep"))
    h = _units(normalise_for_scoring(hyp, tones="keep"))
    match = _align([k for k, _ in r], [k for k, _ in h])
    marked = wrong = 0
    for i, (key, tone) in enumerate(r):
        if key[0] not in VOWELS or not tone:
            continue
        marked += 1
        if match[i] < 0 or h[match[i]][1] != tone:
            wrong += 1
    return wrong / marked if marked else 0.0


def score_all(ref: str, hyp: str) -> dict[str, float]:
    return {
        "cer": cer(ref, hyp),
        "werStripped": wer(ref, hyp),
        "werRetained": wer_tone_retained(ref, hyp),
        "ter": ter(ref, hyp),
    }
