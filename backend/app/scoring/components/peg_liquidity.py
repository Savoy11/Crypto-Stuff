"""
Peg stability + liquidity component (30% weight).
Combines peg deviation analytics with market depth and slippage metrics.
"""
from __future__ import annotations

from typing import Any

from app.analytics.liquidity_depth import composite_liquidity_score
from app.analytics.peg_stability import calculate_peg_score


def compute_peg_liquidity_score(
    prices: list[float],
    peg_target: float,
    depth_1pct: float | None,
    depth_2pct: float | None,
    market_cap: float | None,
    slippage_bps: float | None,
    spread_bps: float | None,
    venues: list[dict[str, Any]] | None = None,
) -> tuple[float, dict[str, Any]]:
    """
    Compute the peg stability + liquidity component score (0–100).

    Weights within component:
    - Peg stability: 55%
    - Liquidity:     45%

    Args:
        prices: Historical price observations.
        peg_target: Target peg price (e.g., 1.0).
        depth_1pct: USD liquidity at 1% price impact.
        depth_2pct: USD liquidity at 2% price impact.
        market_cap: Total market capitalisation.
        slippage_bps: Slippage in basis points.
        spread_bps: Bid-ask spread in basis points.
        venues: Venue liquidity breakdown list.

    Returns:
        Tuple of (score, breakdown_dict).
    """
    peg_score = calculate_peg_score(prices, peg_target) if prices else 50.0

    liq_scores = composite_liquidity_score(
        depth_1pct=depth_1pct,
        depth_2pct=depth_2pct,
        market_cap=market_cap,
        slippage_bps=slippage_bps,
        spread_bps=spread_bps,
        venues=venues,
    )
    liq_score = liq_scores["composite_score"]

    composite = peg_score * 0.55 + liq_score * 0.45

    breakdown = {
        "component": "peg_liquidity",
        "weight": 0.30,
        "score": round(composite, 2),
        "peg_score": round(peg_score, 2),
        "liquidity_score": round(liq_score, 2),
        "liquidity_breakdown": liq_scores,
        "peg_observations": len(prices),
    }

    return float(max(0.0, min(100.0, composite))), breakdown
