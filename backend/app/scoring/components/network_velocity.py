"""
Network velocity component (20% weight).
Combines transfer velocity, active addresses, and concentration metrics.
"""
from __future__ import annotations

from typing import Any

from app.analytics.velocity_metrics import composite_network_score
from app.analytics.wallet_concentration import concentration_score


def compute_network_velocity_score(
    velocity: float | None,
    active_addresses_24h: int | None,
    total_holders: int | None,
    transfer_count_24h: int | None,
    gini: float | None,
    hhi: float | None,
    top_10_pct: float | None,
    asset_type: str = "stablecoin",
) -> tuple[float, dict[str, Any]]:
    """
    Compute the network velocity component score (0–100).

    Weights within component:
    - Network activity score:         60%
    - Wallet concentration score:     40%

    Args:
        velocity: Transfer velocity ratio.
        active_addresses_24h: Active unique addresses in 24h.
        total_holders: Total holder count.
        transfer_count_24h: Transfer count in 24h.
        gini: Gini coefficient (0–1).
        hhi: Herfindahl-Hirschman Index (0–10000).
        top_10_pct: Percentage held by top 10 wallets.
        asset_type: Asset type for velocity benchmarking.

    Returns:
        Tuple of (score, breakdown_dict).
    """
    net_scores = composite_network_score(
        velocity=velocity,
        active_addresses_24h=active_addresses_24h,
        total_holders=total_holders,
        transfer_count_24h=transfer_count_24h,
        asset_type=asset_type,
    )
    net_score = net_scores["composite_score"]

    conc_score = concentration_score(gini, hhi, top_10_pct)

    composite = net_score * 0.60 + conc_score * 0.40

    breakdown = {
        "component": "network_velocity",
        "weight": 0.20,
        "score": round(composite, 2),
        "network_activity_score": round(net_score, 2),
        "concentration_score": round(conc_score, 2),
        "network_detail": net_scores,
        "gini": round(gini, 4) if gini is not None else None,
        "hhi": round(hhi, 2) if hhi is not None else None,
        "top_10_pct": round(top_10_pct, 2) if top_10_pct is not None else None,
    }

    return float(max(0.0, min(100.0, composite))), breakdown
