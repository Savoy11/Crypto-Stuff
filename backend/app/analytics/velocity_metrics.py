"""
Velocity metrics analytics: transfer velocity, active address scoring,
and network activity health assessment.
"""
from __future__ import annotations

from typing import Any


def calculate_velocity(
    transfer_volume: float | None,
    circulating_supply: float | None,
) -> float | None:
    """
    Compute token velocity: transfer_volume_24h / circulating_supply.

    High velocity indicates active use; extremely high can signal instability.

    Args:
        transfer_volume: Total USD or token volume transferred in 24h.
        circulating_supply: Total circulating supply in the same denomination.

    Returns:
        Velocity ratio, or None if inputs are unavailable.
    """
    if transfer_volume is None or circulating_supply is None or circulating_supply <= 0:
        return None
    return transfer_volume / circulating_supply


def score_velocity(velocity: float | None, asset_type: str = "stablecoin") -> float:
    """
    Score network velocity from 0 to 100.

    Optimal velocity ranges by asset type:
    - stablecoin: 0.05–2.0 (payment medium)
    - defi:       0.1–5.0  (high turnover acceptable)
    - tokenized:  0.01–0.5 (lower turnover expected)
    - cbdc:       0.02–1.0

    Args:
        velocity: Transfer velocity ratio.
        asset_type: Type of asset for context-appropriate scoring.

    Returns:
        Score 0–100.
    """
    if velocity is None or velocity < 0:
        return 0.0

    # Define optimal range per asset type
    optimal_ranges: dict[str, tuple[float, float]] = {
        "stablecoin": (0.05, 2.0),
        "defi": (0.10, 5.0),
        "tokenized": (0.01, 0.5),
        "cbdc": (0.02, 1.0),
    }
    low, high = optimal_ranges.get(asset_type, (0.05, 2.0))

    if low <= velocity <= high:
        # In the sweet spot
        # Score peaks at the midpoint
        midpoint = (low + high) / 2
        distance_from_mid = abs(velocity - midpoint) / ((high - low) / 2)
        return float(90.0 + (1.0 - distance_from_mid) * 10.0)
    elif velocity < low:
        # Below optimal — low usage or dormant supply
        if low > 0:
            return float(max(10.0, velocity / low * 90.0))
        return 10.0
    else:
        # Above optimal — could indicate wash trading or network stress
        overshoot = (velocity - high) / high
        return float(max(0.0, 90.0 - overshoot * 45.0))


def score_active_addresses(
    active_24h: int | None,
    total_holders: int | None,
) -> float:
    """
    Score active address engagement as a percentage of total holders.

    Args:
        active_24h: Number of unique active addresses in 24h.
        total_holders: Total holder count.

    Returns:
        Score 0–100.
    """
    if active_24h is None or total_holders is None or total_holders <= 0:
        return 0.0

    activity_rate = active_24h / total_holders * 100.0

    # Scoring:
    # >10% active → excellent (90–100)
    # 5–10%       → good (75–90)
    # 1–5%        → moderate (40–75)
    # 0.1–1%      → low (10–40)
    # <0.1%       → very low (0–10)
    if activity_rate >= 10.0:
        return min(100.0, 90.0 + (activity_rate - 10.0) / 10.0 * 10.0)
    elif activity_rate >= 5.0:
        return 75.0 + (activity_rate - 5.0) / 5.0 * 15.0
    elif activity_rate >= 1.0:
        return 40.0 + (activity_rate - 1.0) / 4.0 * 35.0
    elif activity_rate >= 0.1:
        return 10.0 + (activity_rate - 0.1) / 0.9 * 30.0
    else:
        return max(0.0, activity_rate / 0.1 * 10.0)


def score_transfer_count(transfer_count_24h: int | None) -> float:
    """
    Score raw transfer count (more transfers = healthier network utility).

    Args:
        transfer_count_24h: Number of on-chain transfers in 24h.

    Returns:
        Score 0–100.
    """
    if transfer_count_24h is None or transfer_count_24h < 0:
        return 0.0

    # Logarithmic scale: 10k txs/day → 80, 100k → 95, 1M+ → 100
    if transfer_count_24h == 0:
        return 0.0

    import math

    log_score = math.log10(transfer_count_24h + 1)
    # log10(1M) = 6.0 → score 100
    score = min(100.0, log_score / 6.0 * 100.0)
    return float(max(0.0, score))


def composite_network_score(
    velocity: float | None,
    active_addresses_24h: int | None,
    total_holders: int | None,
    transfer_count_24h: int | None,
    asset_type: str = "stablecoin",
) -> dict[str, Any]:
    """
    Composite network/velocity score combining all sub-metrics.

    Weights:
    - Velocity:         35%
    - Active addresses: 40%
    - Transfer count:   25%
    """
    velocity_score = score_velocity(velocity, asset_type)
    address_score = score_active_addresses(active_addresses_24h, total_holders)
    transfer_score = score_transfer_count(transfer_count_24h)

    # Weighted average of available scores
    components = [
        (velocity_score, 0.35, velocity is not None),
        (address_score, 0.40, active_addresses_24h is not None and total_holders is not None),
        (transfer_score, 0.25, transfer_count_24h is not None),
    ]

    available = [(s, w) for s, w, avail in components if avail]
    if not available:
        composite = 50.0
    else:
        total_w = sum(w for _, w in available)
        composite = sum(s * w for s, w in available) / total_w

    return {
        "velocity": round(velocity, 6) if velocity is not None else None,
        "velocity_score": round(velocity_score, 2),
        "active_address_score": round(address_score, 2),
        "transfer_count_score": round(transfer_score, 2),
        "composite_score": round(float(max(0.0, min(100.0, composite))), 2),
    }
