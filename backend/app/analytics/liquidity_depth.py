"""
Liquidity depth analytics: market depth scoring, venue concentration,
slippage scoring, and composite liquidity metrics.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np


def calculate_market_depth_score(
    depth_1pct: float | None,
    depth_2pct: float | None,
    market_cap: float | None,
) -> float:
    """
    Score market depth quality from 0 to 100.

    Methodology:
    - Computes depth-to-market-cap ratio at 1% and 2% price impact levels.
    - Higher ratios indicate more liquid, resilient markets.

    Args:
        depth_1pct: USD value tradable within 1% price impact.
        depth_2pct: USD value tradable within 2% price impact.
        market_cap: Total market capitalisation in USD.

    Returns:
        Depth quality score 0–100.
    """
    if market_cap is None or market_cap <= 0:
        return 0.0

    score = 0.0
    weight_1pct = 0.6
    weight_2pct = 0.4

    if depth_1pct is not None and depth_1pct > 0:
        ratio_1pct = depth_1pct / market_cap
        # A ratio of 0.05 (5% of market cap) scores ~100
        score_1pct = min(100.0, ratio_1pct / 0.05 * 100.0)
        score += score_1pct * weight_1pct

    if depth_2pct is not None and depth_2pct > 0:
        ratio_2pct = depth_2pct / market_cap
        # A ratio of 0.10 (10% of market cap at 2% impact) scores ~100
        score_2pct = min(100.0, ratio_2pct / 0.10 * 100.0)
        score += score_2pct * weight_2pct

    # Absolute depth bonus: stablecoins with >$100M at 1% are extremely liquid
    if depth_1pct is not None:
        if depth_1pct >= 100_000_000:
            score = min(100.0, score + 10.0)
        elif depth_1pct >= 50_000_000:
            score = min(100.0, score + 5.0)

    return float(max(0.0, min(100.0, score)))


def assess_venue_concentration(venues: list[dict[str, Any]]) -> float:
    """
    Score venue diversity using HHI (Herfindahl-Hirschman Index).

    Lower HHI → more diversified → higher score.

    Args:
        venues: List of dicts with at least {"pct": float} or {"liquidity_usd": float}.

    Returns:
        Venue diversity score 0–100.
    """
    if not venues:
        return 0.0

    # Extract percentage shares
    shares: list[float] = []
    for v in venues:
        pct = v.get("pct", v.get("share_pct", 0.0))
        if pct > 0:
            shares.append(float(pct))

    # Fallback: compute from liquidity_usd if pct not available
    if not shares:
        total_liq = sum(float(v.get("liquidity_usd", 0)) for v in venues)
        if total_liq > 0:
            shares = [float(v.get("liquidity_usd", 0)) / total_liq * 100 for v in venues]

    if not shares:
        return 0.0

    # Normalise to 100%
    total = sum(shares)
    normalised = [s / total for s in shares]

    # HHI: sum of squared market shares (as fractions), scaled to 0–10000
    hhi = sum(s ** 2 for s in normalised) * 10_000.0

    # HHI interpretation:
    # < 1000 → unconcentrated (diverse)    → high score
    # 1000–2500 → moderately concentrated  → medium score
    # > 2500 → highly concentrated          → low score
    if hhi < 1000:
        score = 80.0 + (1000.0 - hhi) / 1000.0 * 20.0
    elif hhi < 2500:
        score = 40.0 + (2500.0 - hhi) / 1500.0 * 40.0
    else:
        score = max(0.0, 40.0 - (hhi - 2500.0) / 7500.0 * 40.0)

    return float(max(0.0, min(100.0, score)))


def calculate_slippage_score(slippage_bps: float | None) -> float:
    """
    Score slippage (lower slippage = higher score).

    Args:
        slippage_bps: Slippage in basis points for a standard-size trade.

    Returns:
        Score 0–100.
    """
    if slippage_bps is None or slippage_bps < 0:
        return 0.0

    # <5 bps → 100 (institutional-grade)
    # 5–25 bps → 70–100
    # 25–100 bps → 30–70
    # 100–500 bps → 0–30
    # >500 bps → 0
    if slippage_bps <= 5.0:
        return 100.0
    elif slippage_bps <= 25.0:
        return 100.0 - (slippage_bps - 5.0) / 20.0 * 30.0
    elif slippage_bps <= 100.0:
        return 70.0 - (slippage_bps - 25.0) / 75.0 * 40.0
    elif slippage_bps <= 500.0:
        return 30.0 - (slippage_bps - 100.0) / 400.0 * 30.0
    else:
        return 0.0


def calculate_bid_ask_score(spread_bps: float | None) -> float:
    """
    Score bid-ask spread quality (tighter spread = higher score).

    Args:
        spread_bps: Bid-ask spread in basis points.

    Returns:
        Score 0–100.
    """
    if spread_bps is None:
        return 0.0

    if spread_bps <= 1.0:
        return 100.0
    elif spread_bps <= 5.0:
        return 90.0 - (spread_bps - 1.0) / 4.0 * 20.0
    elif spread_bps <= 20.0:
        return 70.0 - (spread_bps - 5.0) / 15.0 * 30.0
    elif spread_bps <= 100.0:
        return 40.0 - (spread_bps - 20.0) / 80.0 * 30.0
    else:
        return max(0.0, 10.0 - (spread_bps - 100.0) / 400.0 * 10.0)


def composite_liquidity_score(
    depth_1pct: float | None,
    depth_2pct: float | None,
    market_cap: float | None,
    slippage_bps: float | None,
    spread_bps: float | None,
    venues: list[dict[str, Any]] | None = None,
) -> dict[str, float]:
    """
    Composite liquidity score from all sub-components.

    Weights:
    - Market depth:          40%
    - Slippage:              30%
    - Bid-ask spread:        20%
    - Venue concentration:   10%
    """
    depth_score = calculate_market_depth_score(depth_1pct, depth_2pct, market_cap)
    slippage_score = calculate_slippage_score(slippage_bps)
    spread_score = calculate_bid_ask_score(spread_bps)
    venue_score = assess_venue_concentration(venues or [])

    composite = (
        depth_score * 0.40
        + slippage_score * 0.30
        + spread_score * 0.20
        + venue_score * 0.10
    )

    return {
        "depth_score": round(depth_score, 2),
        "slippage_score": round(slippage_score, 2),
        "spread_score": round(spread_score, 2),
        "venue_diversity_score": round(venue_score, 2),
        "composite_score": round(float(max(0.0, min(100.0, composite))), 2),
    }
