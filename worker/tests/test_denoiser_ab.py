"""The denoiser comparison reads cleaning logs and transcripts; it changes nothing."""

from igala_speech.denoiser_ab import arm_summary, compare, score_arms


def log(tool, used, corr=0.99, shift=3.0, snr=30.0, reason=None):
    out = {
        "denoiser": {"tool": tool},
        "usedDenoised": used,
        "pitchCheck": {"correlation": corr, "medianShiftCents": shift,
                       "rmseCents": 10.0, "octaveJumpShare": 0.0},
        "before": {"wadaSnrDb": 18.0},
        "after": {"wadaSnrDb": snr, "gate": {"verdict": "pass"}},
    }
    if not used:
        out["keptRawBecause"] = reason or "median_shift"
    return out


def test_arm_summary_counts_and_medians():
    got = arm_summary([log("A", True, shift=-4.0), log("A", False, corr=0.5, snr=18.0)])
    assert got["tool"] == "A" and got["clips"] == 2
    assert got["usedDenoised"] == 1 and got["usedDenoisedShare"] == 0.5
    assert got["keptRawReasons"] == {"median_shift": 1}
    assert got["f0AbsShiftCentsMedian"] == 3.5
    assert got["snrDbAfterMedian"] == 24.0 and got["gateAfter"] == {"pass": 2}


def test_arm_summary_survives_missing_numbers():
    got = arm_summary([{"usedDenoised": False, "pitchCheck": None, "keptRawBecause": "no_denoiser"}])
    assert got["f0CorrelationMedian"] is None and got["snrDbAfterMedian"] is None
    assert arm_summary([])["usedDenoisedShare"] is None


def test_compare_uses_shared_clips_and_lists_disagreements():
    a = {"c1": log("A", True), "c2": log("A", False), "c3": log("A", True)}
    b = {"c1": log("B", True), "c2": log("B", True), "c4": log("B", True)}
    got = compare(a, b)
    assert got["clips"] == 2 and got["onlyInA"] == 1 and got["onlyInB"] == 1
    assert got["pitchCheck"] == {
        "bothPass": 1, "onlyAPasses": [], "onlyBPasses": ["c2"], "neitherPasses": 0,
    }
    assert got["a"]["tool"] == "A" and got["b"]["tool"] == "B"


def test_score_arms_only_scores_clips_every_arm_heard():
    refs = {"c1": "zzzz", "c2": "zzzz", "c3": ""}
    arms = {"raw": {"c1": "zzzz", "c2": "zzqz", "c3": "q"}, "b": {"c1": "zzzz", "c3": ""}}
    got = score_arms(refs, arms)
    assert got["clips"] == 1
    assert got["arms"]["raw"]["cer"] == 0 and got["arms"]["b"]["cer"] == 0
    both = score_arms(refs, {"raw": arms["raw"]})
    assert both["clips"] == 2 and both["arms"]["raw"]["cer"] == 0.125
