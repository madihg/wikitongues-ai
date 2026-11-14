"""Modal GPU rates in USD per second, from https://modal.com/pricing (Nov 2026)."""

RATES_PER_SECOND: dict[str, float] = {
    "A10G": 0.000306,
    "A100-80GB": 0.000694,
    "H100": 0.001097,
}


def cost_usd(gpu: str, seconds: float) -> float:
    """GPU seconds times the rate, rounded to four places. KeyError on an unknown GPU."""
    return round(RATES_PER_SECOND[gpu] * seconds, 4)
