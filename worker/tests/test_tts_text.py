"""Igala text in front of the Yoruba MMS vocabulary (invented words only)."""

from igala_speech.tts_text import MMS_YOR_VOCAB, to_mms_yor, unknown_characters


def test_vocabulary_is_the_43_published_symbols():
    assert len(MMS_YOR_VOCAB) == 43
    for ch in "ẹọṣńǹ̀́":
        assert ch in MMS_YOR_VOCAB
    for ch in "cvzqx̄̂":
        assert ch not in MMS_YOR_VOCAB


def test_unknown_characters_are_counted_after_nfc_and_lower_case():
    got = unknown_characters(["Chava, vula", "táva", "tâ"])
    by = {c["codepoint"]: c for c in got["byCharacter"]}
    assert by["U+0063"]["count"] == 1 and by["U+0076"]["count"] == 3
    assert by["U+0076"]["clips"] == 2
    assert by["U+002C"]["count"] == 1
    assert "U+0301" not in by and "U+00E1" not in by  # a-acute is in the vocabulary
    assert by["U+00E2"]["count"] == 1
    assert got["totalCharacters"] == len("chava, vula") + len("táva") + len("tâ")


def test_every_output_character_is_in_the_vocabulary():
    for text in ["Chava, vula!", "tâ tǎ tā ta̋", "ñava (zo) 2", "tẹ́ tọ̀ tệ", "a\nb\tc", "ta’va"]:
        out = to_mms_yor(text)
        assert out and all(ch in MMS_YOR_VOCAB and ch != "|" for ch in out), text


def test_the_written_rules():
    assert to_mms_yor("Chava") == "tṣafa"
    assert to_mms_yor("ñava") == "nafa"
    assert to_mms_yor("tâ") == "tá̀"  # falling: high then low
    assert to_mms_yor("tǎ") == "tà́"  # rising: low then high
    assert to_mms_yor("tā ta̋") == "ta tá"
    assert to_mms_yor("tẹ́ tọ̀") == "tẹ́ tọ̀"  # dotted vowels and their tones are kept
    assert to_mms_yor("a,\n b  (c) 2") == "a b k"
    assert to_mms_yor("...") == ""
