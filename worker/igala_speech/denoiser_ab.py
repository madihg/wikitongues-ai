"""Compare two denoisers on the same clips. Reads cleaning logs, changes nothing.

A is the denoiser the pipeline uses (DeepFilterNet3, the logs `prepare` wrote
to results/quality.json). B is the candidate (Inworld Voice Isolator v1, the
logs the `denoiser-ab` stage wrote to results/denoiser-ab.json). Only clips
that have a log on both sides are compared.

What matters for a tonal language is in the pitch check: a denoiser that moves
F0 fails it and the clip keeps its raw audio, so the share that passes and how
far the pitch moved are the first numbers to read. Noise comes second.
"""

from __future__ import annotations

from statistics import median

from .metrics import cer, cer_tone_retained


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _median(values: list) -> float | None:
    kept = [v for v in values if _num(v)]
    return round(float(median(kept)), 3) if kept else None


def _mean(values: list) -> float | None:
    kept = [v for v in values if _num(v)]
    return round(sum(kept) / len(kept), 4) if kept else None


def arm_summary(logs: list[dict]) -> dict:
    """One denoiser's numbers over its cleaning logs (make_derivative's log)."""
    checks = [log.get("pitchCheck") or {} for log in logs]
    reasons: dict[str, int] = {}
    for log in logs:
        if not log.get("usedDenoised"):
            reason = log.get("keptRawBecause") or "unknown"
            reasons[reason] = reasons.get(reason, 0) + 1
    gates: dict[str, int] = {}
    for log in logs:
        verdict = ((log.get("after") or {}).get("gate") or {}).get("verdict")
        gates[str(verdict)] = gates.get(str(verdict), 0) + 1
    used = sum(1 for log in logs if log.get("usedDenoised"))
    tools = sorted({str((log.get("denoiser") or {}).get("tool")) for log in logs})
    return {
        "tool": tools[0] if len(tools) == 1 else tools,
        "clips": len(logs),
        "usedDenoised": used,
        "usedDenoisedShare": round(used / len(logs), 4) if logs else None,
        "keptRawReasons": dict(sorted(reasons.items())),
        "f0CorrelationMedian": _median([c.get("correlation") for c in checks]),
        "f0AbsShiftCentsMedian": _median(
            [abs(c["medianShiftCents"]) for c in checks if _num(c.get("medianShiftCents"))]
        ),
        "f0RmseCentsMedian": _median([c.get("rmseCents") for c in checks]),
        "octaveJumpShareMean": _mean([c.get("octaveJumpShare") for c in checks]),
        "snrDbBeforeMedian": _median(
            [(log.get("before") or {}).get("wadaSnrDb") for log in logs]
        ),
        "snrDbAfterMedian": _median(
            [(log.get("after") or {}).get("wadaSnrDb") for log in logs]
        ),
        "gateAfter": dict(sorted(gates.items())),
    }


def compare(a_logs: dict[str, dict], b_logs: dict[str, dict]) -> dict:
    """Both arms on the clips they share, and the clips where they disagree."""
    ids = sorted(set(a_logs) & set(b_logs))
    a_used = {i for i in ids if a_logs[i].get("usedDenoised")}
    b_used = {i for i in ids if b_logs[i].get("usedDenoised")}
    return {
        "clips": len(ids),
        "onlyInA": len(set(a_logs) - set(b_logs)),
        "onlyInB": len(set(b_logs) - set(a_logs)),
        "a": arm_summary([a_logs[i] for i in ids]),
        "b": arm_summary([b_logs[i] for i in ids]),
        "pitchCheck": {
            "bothPass": len(a_used & b_used),
            "onlyAPasses": sorted(a_used - b_used),
            "onlyBPasses": sorted(b_used - a_used),
            "neitherPasses": len(set(ids) - a_used - b_used),
        },
    }


def score_arms(references: dict[str, str], arms: dict[str, dict[str, str]]) -> dict:
    """Character error per arm on the clips every arm transcribed and that have
    a reference. `arms` maps an arm's name to {clipId: what the recogniser
    heard}. Mean per clip, tone-stripped and tone-retained."""
    shared = set(references)
    for heard in arms.values():
        shared &= set(heard)
    ids = sorted(i for i in shared if (references[i] or "").strip())
    out: dict = {"clips": len(ids), "arms": {}}
    for name, heard in arms.items():
        out["arms"][name] = {
            "cer": _mean([cer(references[i], heard[i]) for i in ids]),
            "cerToneRetained": _mean(
                [cer_tone_retained(references[i], heard[i]) for i in ids]
            ),
        }
    return out
