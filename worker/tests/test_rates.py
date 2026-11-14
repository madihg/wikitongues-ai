import pytest

from igala_speech.rates import RATES_PER_SECOND, cost_usd


def test_rate_table_matches_modal_pricing():
    assert RATES_PER_SECOND == {"A10G": 0.000306, "A100-80GB": 0.000694, "H100": 0.001097}


def test_cost_is_seconds_times_rate_rounded_to_cents_of_a_cent():
    assert cost_usd("A10G", 1000) == 0.306
    assert cost_usd("A100-80GB", 3600) == 2.4984
    assert cost_usd("H100", 0) == 0.0


def test_unknown_gpu_is_an_error():
    with pytest.raises(KeyError):
        cost_usd("T4", 10)
