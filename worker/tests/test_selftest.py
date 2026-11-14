from igala_speech.selftest import run


def test_selftest_prints_known_cers(capsys):
    assert run() == 0
    out = capsys.readouterr().out
    assert "identical CER 0.0" in out
    assert "corrupted CER 0.2" in out
