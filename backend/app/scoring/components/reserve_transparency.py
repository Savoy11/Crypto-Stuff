"""
Reserve transparency component (35% weight).
Aggregates reserve composition, collateralisation, and attestation freshness.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from app.analytics.reserve_quality import composite_reserve_score


def compute_reserve_transparency_score(
    reserve_composition: dict[str, Any],
    collateralization_ratio: float | None,
    last_attestation_date: date | None,
    attester_quality: str = "unknown",
    has_real_time_feed: bool = False,
) -> tuple[float, dict[str, Any]]:
    """
    Compute the reserve transparency component score (0–100).

    Args:
        reserve_composition: Dict of reserve asset types and percentages.
        collateralization_ratio: Total reserves / total liabilities.
        last_attestation_date: Date of most recent attestation.
        attester_quality: Type of attesting party.
        has_real_time_feed: Whether on-chain real-time proof of reserves exists.

    Returns:
        Tuple of (score, breakdown_dict).
    """
    sub_scores = composite_reserve_score(
        composition=reserve_composition,
        collateralization_ratio=collateralization_ratio,
        last_attestation_date=last_attestation_date,
        attester_quality=attester_quality,
    )

    score = sub_scores["composite_score"]

    # Bonus for real-time proof of reserves (on-chain attestation)
    if has_real_time_feed:
        score = min(100.0, score + 5.0)

    breakdown = {
        "component": "reserve_transparency",
        "weight": 0.35,
        "score": round(score, 2),
        "sub_scores": sub_scores,
        "has_real_time_feed": has_real_time_feed,
    }

    return float(max(0.0, min(100.0, score))), breakdown
